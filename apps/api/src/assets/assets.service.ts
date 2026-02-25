import crypto from "crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

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
}