import crypto from "crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as dns from "node:dns/promises";

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) { }

  async create(userId: string, body: { type?: "DOMAIN" | "IP"; value: string }) {
    const type = body.type ?? "DOMAIN";
    const value = (body.value ?? "").trim().toLowerCase();

    if (!value) throw new BadRequestException("value zorunlu");
    if (type === "DOMAIN" && (value.includes("http://") || value.includes("https://"))) {
      throw new BadRequestException("Domain girerken http/https yazma. Örn: example.com");
    }

    // Basit doğrulama (MVP)
    if (type === "IP") {
      const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4.test(value)) throw new BadRequestException("Geçerli bir IPv4 gir");
    }

    try {
      return await this.prisma.asset.create({
        data: {
          userId,
          type,
          value,
        },
      });
    } catch (e: any) {
      // Prisma unique constraint: P2002
      if (e?.code === "P2002") {
        throw new ConflictException("Bu asset zaten ekli (aynı kullanıcı için tekrar eklenemez).");
      }
      throw e;
    }
  }

  async list(userId: string) {
    return this.prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  // HTTP file için token üret
  async requestHttpToken(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("Asset bulunamadı");
    }

    const token = crypto.randomBytes(16).toString("hex");

    await this.prisma.assetVerification.create({
      data: {
        assetId,
        method: "HTTP_FILE",
        token,
      },
    });

    return {
      assetId,
      method: "HTTP_FILE",
      token,
      instruction: `https://${asset.value}/.well-known/asm-verify.txt dosyasına bu token'ı düz metin olarak koy`,
    };
  }

  // ✅ DNS TXT için token üret + talimat döndür
  async requestDnsToken(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("Asset bulunamadı");
    }

    if (asset.type !== "DOMAIN") {
      throw new BadRequestException("DNS doğrulama sadece DOMAIN asset'leri için geçerlidir");
    }

    const token = crypto.randomBytes(16).toString("hex");

    await this.prisma.assetVerification.create({
      data: {
        assetId,
        method: "DNS_TXT",
        token,
      },
    });

    const host = "_asm-verify";
    const fqdn = `${host}.${asset.value}`;
    const value = `asm-verify=${token}`;

    return {
      assetId,
      method: "DNS_TXT",
      token,
      dns: {
        type: "TXT",
        host,
        fqdn,
        value,
      },
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

    const res = await fetch(url);
    const text = await res.text();

    if (!text.includes(last.token)) {
      throw new BadRequestException("Token dosyada bulunamadı");
    }

    await this.prisma.assetVerification.update({
      where: { id: last.id },
      data: { verifiedAt: new Date() },
    });

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { status: "VERIFIED" },
    });

    return { ok: true, assetId, status: "VERIFIED" };
  }

  async verifyDns(userId: string, assetId: string, domain?: string) {
    // 1) Asset'i çek ve kullanıcıya ait mi kontrol et
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("Asset bulunamadı");
    }

    if (asset.type !== "DOMAIN") {
      throw new BadRequestException("DNS doğrulama sadece DOMAIN asset'leri için geçerlidir");
    }

    // 2) DNS token'ını (en son üretilen DNS_TXT token) al
    const lastDns = await this.prisma.assetVerification.findFirst({
      where: { assetId, method: "DNS_TXT" },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true },
    });

    if (!lastDns) {
      throw new BadRequestException("Önce request-dns-token çağırmalısın");
    }

    // 3) Doğrulayacağımız domain: body.domain geldiyse onu, gelmediyse asset.value kullan
    const d = (domain?.trim().toLowerCase() || asset.value).replace(/\.$/, "");

    // 4) DNS'ten TXT kaydını oku: _asm-verify.<domain>
    const fqdn = `_asm-verify.${d}`;

    // Cache/propagation sıkıntısı yaşamamak için sabit resolver (Cloudflare IP)
    dns.setServers(["162.159.24.201", "162.159.25.42"]);

    let txtRecords: string[][];
    try {
      txtRecords = await dns.resolveTxt(fqdn);
    } catch {
      throw new BadRequestException(`DNS TXT kaydı bulunamadı: ${fqdn}`);
    }

    const flattened = txtRecords.map((parts) => parts.join(""));
    const expected = `asm-verify=${lastDns.token}`;

    const found = flattened.some((v) => v.includes(expected));
    if (!found) {
      throw new BadRequestException("Token DNS TXT kaydında bulunamadı");
    }

    // 5) Verification'ı verified yap
    await this.prisma.assetVerification.update({
      where: { id: lastDns.id },
      data: { verifiedAt: new Date() },
    });

    // 6) Asset'i VERIFIED yap
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { status: "VERIFIED" },
    });

    return { ok: true, assetId, status: "VERIFIED", method: "DNS_TXT" };
  }
}