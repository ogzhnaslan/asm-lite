import crypto from "crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScanScheduleService } from "../modules/scans/scan-schedule.service";
import { SCAN_INTERVALS } from "@asm/shared";
import { AssetStatus } from "@prisma/client";
import * as dns from "node:dns/promises";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ScanScheduleService,
  ) { }

  async create(userId: string, body: { type?: "DOMAIN" | "IP"; value: string }) {
    const type = body.type ?? "DOMAIN";
    const rawValue = (body.value ?? "").trim();

    if (!rawValue) throw new BadRequestException("value is required");

    if (type === "DOMAIN" && /^https?:\/\//i.test(rawValue)) {
      throw new BadRequestException("Domain should not include http/https prefix. Example: example.com");
    }

    const value = rawValue.toLowerCase().replace(/\/+$/, "");

    if (type === "DOMAIN") {
      const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
      if (!domainRegex.test(value) || value.length > 253) {
        throw new BadRequestException("Invalid domain format. Example: example.com");
      }
    }

    if (type === "IP") {
      const octets = value.split(".");
      const validIp =
        octets.length === 4 &&
        octets.every((o) => {
          const n = parseInt(o, 10);
          return /^\d+$/.test(o) && n >= 0 && n <= 255;
        });
      if (!validIp) throw new BadRequestException("Invalid IPv4 address");
    }

    try {
      return await this.prisma.asset.create({ data: { userId, type, value } });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "P2002") {
        throw new ConflictException("Asset already exists for this account");
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
    if (!asset) throw new NotFoundException("Asset not found");
    return asset;
  }

  async remove(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset not found");

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
      throw new BadRequestException("critical must be a boolean");
    }
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { critical } });
    return { ok: true, assetId, critical };
  }

  async updateScanInterval(userId: string, assetId: string, interval: string) {
    if (!(SCAN_INTERVALS as readonly string[]).includes(interval)) {
      throw new BadRequestException(`Invalid interval. Valid options: ${SCAN_INTERVALS.join(", ")}`);
    }

    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { scanInterval: interval } });

    if (asset.status === AssetStatus.VERIFIED) {
      await this.schedule.schedule(assetId, interval);
    }

    return { ok: true, assetId, scanInterval: interval };
  }

  async getIntelligence(userId: string, assetId: string): Promise<{
    assetId: string; assetValue: string; assetType: string;
    dns: unknown; rdap: unknown; geoip: unknown; robots: unknown;
    phishtank: unknown; reputation: unknown; breach: unknown; otx: unknown;
    lastUpdatedAt: string | null;
  }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true, value: true, type: true },
    });
    if (!asset) throw new NotFoundException("Asset not found");

    const TYPES = [
      "DNS_RECORDS",
      "RDAP_INFO",
      "GEOIP_INFO",
      "ROBOTS_TXT",
      "PHISHTANK_REPUTATION",
      "MALICIOUS_REPUTATION",
      "BREACH_EXPOSURE",
      "OTX_INTELLIGENCE",
    ] as const;

    const snapshots = await Promise.all(
      TYPES.map((type) =>
        this.prisma.scanCheckResult.findFirst({
          where: { type, scanRun: { assetId: asset.id, status: "DONE" } },
          orderBy: { createdAt: "desc" },
          select: { dataJson: true, createdAt: true },
        })
      )
    );

    const [dns, rdap, geoip, robots, phishtank, reputation, breach, otx] = snapshots;

    const validDates = snapshots.filter(Boolean).map((s) => s!.createdAt.getTime());
    const lastUpdatedAt = validDates.length > 0
      ? new Date(Math.max(...validDates)).toISOString()
      : null;

    return {
      assetId: asset.id,
      assetValue: asset.value,
      assetType: asset.type,
      dns: dns?.dataJson ?? null,
      rdap: rdap?.dataJson ?? null,
      geoip: geoip?.dataJson ?? null,
      robots: robots?.dataJson ?? null,
      phishtank: phishtank?.dataJson ?? null,
      reputation: reputation?.dataJson ?? null,
      breach: breach?.dataJson ?? null,
      otx: otx?.dataJson ?? null,
      lastUpdatedAt,
    };
  }

  async devVerify(userId: string, assetId: string) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Dev verify is not available in production");
    }

    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId } });
    if (!asset) throw new NotFoundException("Asset not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { status: "VERIFIED" } });
    await this.schedule.schedule(assetId, asset.scanInterval);

    return { ok: true, assetId, status: "VERIFIED", method: "DEV_BYPASS" };
  }

  async requestHttpToken(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.status === AssetStatus.VERIFIED) {
      throw new BadRequestException("Asset is already verified");
    }

    const existing = await this.prisma.assetVerification.findFirst({
      where: { assetId, method: "HTTP_FILE", verifiedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true },
    });

    const token = existing?.token ?? crypto.randomBytes(16).toString("hex");
    if (!existing) {
      await this.prisma.assetVerification.create({ data: { assetId, method: "HTTP_FILE", token } });
    }

    return {
      assetId,
      method: "HTTP_FILE",
      token,
      instruction: `Place this token as plain text at https://${asset.value}/.well-known/asm-verify.txt`,
    };
  }

  async requestDnsToken(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.userId !== userId) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.type !== "DOMAIN") {
      throw new BadRequestException("DNS verification is only available for DOMAIN assets");
    }

    if (asset.status === AssetStatus.VERIFIED) {
      throw new BadRequestException("Asset is already verified");
    }

    const existing = await this.prisma.assetVerification.findFirst({
      where: { assetId, method: "DNS_TXT", verifiedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true },
    });

    const token = existing?.token ?? crypto.randomBytes(16).toString("hex");
    if (!existing) {
      await this.prisma.assetVerification.create({ data: { assetId, method: "DNS_TXT", token } });
    }

    const host = "_asm-verify";
    const fqdn = `${host}.${asset.value}`;
    const value = `asm-verify=${token}`;

    return {
      assetId,
      method: "DNS_TXT",
      token,
      dns: { type: "TXT", host, fqdn, value },
      instruction: `Add a DNS TXT record: Host/Name="${host}"  Value="${value}" (full record: ${fqdn})`,
    };
  }

  async verifyHttp(userId: string, assetId: string, url: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { verifications: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!asset || asset.userId !== userId) throw new NotFoundException("Asset not found");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException("Invalid URL format");
    }

    const hostname = parsedUrl.hostname;
    if (hostname !== asset.value && hostname !== `www.${asset.value}`) {
      throw new BadRequestException(`URL hostname must match asset domain: ${asset.value}`);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new BadRequestException("URL must use http or https protocol");
    }

    const last = asset.verifications[0];
    if (!last) throw new BadRequestException("Request a verification token first");

    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch {
      throw new BadRequestException("Failed to reach the URL");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new BadRequestException(`HTTP ${res.status}: Failed to read token file`);
    }

    const text = await res.text();
    if (!text.includes(last.token)) {
      throw new BadRequestException("Token not found in the response");
    }

    await this.prisma.assetVerification.update({ where: { id: last.id }, data: { verifiedAt: new Date() } });
    await this.prisma.asset.update({ where: { id: assetId }, data: { status: "VERIFIED" } });
    await this.schedule.schedule(assetId, asset.scanInterval);

    return { ok: true, assetId, status: "VERIFIED" };
  }

  async verifyDns(userId: string, assetId: string, domain?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });

    if (!asset || asset.userId !== userId) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.type !== "DOMAIN") {
      throw new BadRequestException("DNS verification is only available for DOMAIN assets");
    }

    const lastDns = await this.prisma.assetVerification.findFirst({
      where: { assetId, method: "DNS_TXT", verifiedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true },
    });

    if (!lastDns) {
      throw new BadRequestException("Request a DNS verification token first");
    }

    const d = (domain?.trim().toLowerCase() || asset.value).replace(/\.$/, "");
    const fqdn = `_asm-verify.${d}`;
    const expected = `asm-verify=${lastDns.token}`;

    const normalizeTxtRecords = (records: string[][]): string[] => {
      return records
        .map((parts) => parts.join("").trim())
        .filter(Boolean);
    };

    const resolveTxtWithResolver = async (servers: string[] | null): Promise<string[]> => {
      if (servers && servers.length > 0) {
        const resolver = new dns.Resolver();
        resolver.setServers(servers);

        const records = await resolver.resolveTxt(fqdn);
        return normalizeTxtRecords(records);
      }

      const records = await dns.resolveTxt(fqdn);
      return normalizeTxtRecords(records);
    };

    const configuredServers = process.env.DNS_SERVERS
      ? process.env.DNS_SERVERS
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      : [];

    const fallbackServers = ["1.1.1.1", "8.8.8.8"];

    let flattened: string[] = [];
    let defaultResolverError: unknown = null;
    let configuredResolverError: unknown = null;
    let fallbackResolverError: unknown = null;

    try {
      flattened = await resolveTxtWithResolver(null);
    } catch (err) {
      defaultResolverError = err;

      if (configuredServers.length > 0) {
        try {
          flattened = await resolveTxtWithResolver(configuredServers);
        } catch (configuredErr) {
          configuredResolverError = configuredErr;
        }
      }

      if (flattened.length === 0) {
        try {
          flattened = await resolveTxtWithResolver(fallbackServers);
        } catch (fallbackErr) {
          fallbackResolverError = fallbackErr;
        }
      }
    }

    if (flattened.length === 0) {
      console.log("[assets] DNS TXT resolve failed", {
        fqdn,
        expected,
        defaultResolverError:
          defaultResolverError instanceof Error
            ? defaultResolverError.message
            : String(defaultResolverError),
        configuredResolverError:
          configuredResolverError instanceof Error
            ? configuredResolverError.message
            : String(configuredResolverError),
        fallbackResolverError:
          fallbackResolverError instanceof Error
            ? fallbackResolverError.message
            : String(fallbackResolverError),
      });

      throw new BadRequestException(`DNS TXT record not found: ${fqdn}`);
    }

    if (!flattened.includes(expected)) {
      console.log("[assets] DNS TXT token mismatch", {
        fqdn,
        expected,
        resolvedValues: flattened,
      });

      throw new BadRequestException("Token not found in DNS TXT records");
    }

    await this.prisma.assetVerification.update({ where: { id: lastDns.id }, data: { verifiedAt: new Date() } });
    await this.prisma.asset.update({ where: { id: assetId }, data: { status: "VERIFIED" } });
    await this.schedule.schedule(assetId, asset.scanInterval);

    return { ok: true, assetId, status: "VERIFIED", method: "DNS_TXT" };
  }
}