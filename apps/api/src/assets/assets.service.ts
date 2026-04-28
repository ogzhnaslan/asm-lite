import crypto from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScanScheduleService, VALID_INTERVALS } from "../modules/scans/scan-schedule.service";
import * as dns from "node:dns/promises";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScanScheduleService,
  ) {}

  async create(userId: string, body: { type?: "DOMAIN" | "IP"; value: string }) {
    const type = body.type ?? "DOMAIN";
    const value = (body.value ?? "").trim().toLowerCase();

    if (!value) throw new BadRequestException("value zorunlu");
    if (type === "DOMAIN" && (value.includes("http://") || value.includes("https://"))) {
      throw new BadRequestException("Domain girerken http/https yazma. Örn: example.com");
    }

    if (type === "IP") {
      const octets = value.split(".");
      const validIp =
        octets.length === 4 &&
        octets.every((o) => {
          const n = parseInt(o, 10);
          return /^\d+$/.test(o) && n >= 0 && n <= 255;
        });
      if (!validIp) throw new BadRequestException("Geçerli bir IPv4 gir");
    }

    try {
      return await this.prisma.asset.create({ data: { userId, type, value } });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new ConflictException("Bu asset zaten ekli (aynı kullanıcı için tekrar eklenemez).");
      }
      throw e;
    }
  }

  async list(userId: string, opts: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.asset.count({ where: { userId } }),
    ]);

    return { items, total, page, limit };
  }

  async get(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset bulunamadı");
    return asset;
  }

  async remove(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset bulunamadı");

    await this.schedule.unschedule(assetId);

    await this.prisma.$transaction([
      this.prisma.finding.deleteMany({ where: { assetId } }),
      this.prisma.scanRun.deleteMany({ where: { assetId } }),
      this.prisma.assetVerification.deleteMany({ where: { assetId } }),
      this.prisma.asset.delete({ where: { id: assetId } }),
    ]);

    return { ok: true, assetId };
  }

  async setCritical(userId: string, assetId: string, critical: boolean) {
    if (typeof critical !== "boolean") {
      throw new BadRequestException("critical boolean olmalı");
    }
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset bulunamadı");

    await this.prisma.asset.update({ where: { id: assetId }, data: { critical } });
    return { ok: true, assetId, critical };
  }

  async updateScanInterval(userId: string, assetId: string, interval: string) {
    if (!VALID_INTERVALS.includes(interval)) {
      throw new BadRequestException(`Geçersiz interval. Seçenekler: ${VALID_INTERVALS.join(", ")}`);
    }

    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset bulunamadı");

    await this.prisma.asset.update({ where: { id: assetId }, data: { scanInterval: interval } });

    if (asset.status === "VERIFIED") {
      await this.schedule.schedule(assetId, interval);
    }

    return { ok: true, assetId, scanInterval: interval };
  }

  async requestHttpToken(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("Asset bulunamadı");
    }

    const token = crypto.randomBytes(16).toString("hex");
    await this.prisma.assetVerification.create({ data: { assetId, method: "HTTP_FILE", token } });

    return {
      assetId,
      method: "HTTP_FILE",
      token,
      instruction: `https://${asset.value}/.well-known/asm-verify.txt dosyasına bu token'ı düz metin olarak koy`,
    };
  }

  async requestDnsToken(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("Asset bulunamadı");
    }

    if (asset.type !== "DOMAIN") {
      throw new BadRequestException("DNS doğrulama sadece DOMAIN asset'leri için geçerlidir");
    }

    const token = crypto.randomBytes(16).toString("hex");
    await this.prisma.assetVerification.create({ data: { assetId, method: "DNS_TXT", token } });

    const host = "_asm-verify";
    const fqdn = `${host}.${asset.value}`;
    const value = `asm-verify=${token}`;

    return {
      assetId,
      method: "DNS_TXT",
      token,
      dns: { type: "TXT", host, fqdn, value },
      instruction: `DNS panelinde TXT kaydı ekle: Host/Name="${host}"  Value="${value}" (tam kayıt: ${fqdn})`,
    };
  }

  async verifyHttp(userId: string, assetId: string, url: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { verifications: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!asset || asset.userId !== userId) throw new BadRequestException("Asset bulunamadı");

    const last = asset.verifications[0];
    if (!last) throw new BadRequestException("Önce request-token çağırmalısın");

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
    } catch {
      throw new BadRequestException("URL'ye erişilemedi");
    }

    if (!res.ok) {
      throw new BadRequestException(`HTTP ${res.status}: Token dosyası okunamadı`);
    }

    const text = await res.text();
    if (!text.includes(last.token)) {
      throw new BadRequestException("Token dosyada bulunamadı");
    }

    await this.prisma.assetVerification.update({ where: { id: last.id }, data: { verifiedAt: new Date() } });
    await this.prisma.asset.update({ where: { id: assetId }, data: { status: "VERIFIED" } });

    await this.schedule.schedule(assetId, asset.scanInterval);

    return { ok: true, assetId, status: "VERIFIED" };
  }

  async verifyDns(userId: string, assetId: string, domain?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });

    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("Asset bulunamadı");
    }

    if (asset.type !== "DOMAIN") {
      throw new BadRequestException("DNS doğrulama sadece DOMAIN asset'leri için geçerlidir");
    }

    const lastDns = await this.prisma.assetVerification.findFirst({
      where: { assetId, method: "DNS_TXT" },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true },
    });

    if (!lastDns) {
      throw new BadRequestException("Önce request-dns-token çağırmalısın");
    }

    const d = (domain?.trim().toLowerCase() || asset.value).replace(/\.$/, "");
    const fqdn = `_asm-verify.${d}`;

    dns.setServers(["162.159.24.201", "162.159.25.42"]);

    let txtRecords: string[][];
    try {
      txtRecords = await dns.resolveTxt(fqdn);
    } catch {
      throw new BadRequestException(`DNS TXT kaydı bulunamadı: ${fqdn}`);
    }

    const flattened = txtRecords.map((parts) => parts.join(""));
    const expected = `asm-verify=${lastDns.token}`;

    if (!flattened.some((v) => v.includes(expected))) {
      throw new BadRequestException("Token DNS TXT kaydında bulunamadı");
    }

    await this.prisma.assetVerification.update({ where: { id: lastDns.id }, data: { verifiedAt: new Date() } });
    await this.prisma.asset.update({ where: { id: assetId }, data: { status: "VERIFIED" } });

    await this.schedule.schedule(assetId, asset.scanInterval);

    return { ok: true, assetId, status: "VERIFIED", method: "DNS_TXT" };
  }
}
