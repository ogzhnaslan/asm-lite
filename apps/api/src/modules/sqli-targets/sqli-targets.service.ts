import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSqliTargetDto } from './dto/create-sqli-target.dto';
import { UpdateSqliTargetDto } from './dto/update-sqli-target.dto';

const MAX_TARGETS_PER_ASSET = 5;
const MAX_PARAMS_PER_TARGET = 5;
const MAX_PARAM_KEY_LENGTH = 64;
const MAX_PARAM_VALUE_LENGTH = 256;
const MAX_PATH_LENGTH = 256;

// Fields shared by create + update that need cross-field / deep validation.
interface ValidatableFields {
  method?: string;
  path?: string;
  paramsJson?: unknown;
  injectParam?: string;
}

// Portable response shape — avoids TS2742 (inferred Prisma type can't be named
// without referencing .pnpm/.prisma internal runtime path). `paramsJson` is
// `unknown` since Prisma's JsonValue is not portable either.
export interface SqliTargetResponse {
  id: string;
  assetId: string;
  method: string;
  path: string;
  paramsJson: unknown;
  injectParam: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeleteSqliTargetResponse {
  ok: true;
  id: string;
}

@Injectable()
export class SqliTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  async list(userId: string, assetId: string): Promise<SqliTargetResponse[]> {
    await this.ensureVerifiedAsset(userId, assetId);
    return this.prisma.sqliTarget.findMany({
      where: { assetId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, assetId: string, dto: CreateSqliTargetDto): Promise<SqliTargetResponse> {
    await this.ensureVerifiedAsset(userId, assetId);

    const count = await this.prisma.sqliTarget.count({ where: { assetId } });
    if (count >= MAX_TARGETS_PER_ASSET) {
      throw new BadRequestException(`Maximum ${MAX_TARGETS_PER_ASSET} SQLi targets per asset`);
    }

    this.validateFields({
      method: dto.method,
      path: dto.path,
      paramsJson: dto.paramsJson,
      injectParam: dto.injectParam,
    });

    return this.prisma.sqliTarget.create({
      data: {
        assetId,
        method: dto.method,
        path: dto.path,
        paramsJson: dto.paramsJson as object,
        injectParam: dto.injectParam,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async update(userId: string, assetId: string, targetId: string, dto: UpdateSqliTargetDto): Promise<SqliTargetResponse> {
    await this.ensureVerifiedAsset(userId, assetId);

    const existing = await this.prisma.sqliTarget.findFirst({
      where: { id: targetId, assetId },
    });
    if (!existing) {
      throw new NotFoundException('SQLi target not found');
    }

    // Merge effective fields for cross-field validation: when paramsJson is
    // changed, injectParam (whether updated or existing) must still be a key
    // of the new params; vice versa.
    const effective: ValidatableFields = {
      method: dto.method ?? existing.method,
      path: dto.path ?? existing.path,
      paramsJson: dto.paramsJson !== undefined ? dto.paramsJson : existing.paramsJson,
      injectParam: dto.injectParam ?? existing.injectParam,
    };
    this.validateFields(effective);

    return this.prisma.sqliTarget.update({
      where: { id: targetId },
      data: {
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.path !== undefined ? { path: dto.path } : {}),
        ...(dto.paramsJson !== undefined ? { paramsJson: dto.paramsJson as object } : {}),
        ...(dto.injectParam !== undefined ? { injectParam: dto.injectParam } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
  }

  async remove(userId: string, assetId: string, targetId: string): Promise<DeleteSqliTargetResponse> {
    await this.ensureVerifiedAsset(userId, assetId);

    const existing = await this.prisma.sqliTarget.findFirst({
      where: { id: targetId, assetId },
    });
    if (!existing) {
      throw new NotFoundException('SQLi target not found');
    }

    await this.prisma.sqliTarget.delete({ where: { id: targetId } });
    return { ok: true, id: targetId };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async ensureVerifiedAsset(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true, status: true },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    if (asset.status !== AssetStatus.VERIFIED) {
      throw new BadRequestException('Asset must be verified to manage SQLi targets');
    }
  }

  private validateFields(fields: ValidatableFields): void {
    // method
    if (fields.method !== undefined && fields.method !== 'GET') {
      throw new BadRequestException('method must be GET');
    }

    // path
    if (fields.path !== undefined) {
      const p = fields.path;
      if (typeof p !== 'string' || p.length === 0) {
        throw new BadRequestException('path is required');
      }
      if (!p.startsWith('/')) {
        throw new BadRequestException('path must start with /');
      }
      if (p.length > MAX_PATH_LENGTH) {
        throw new BadRequestException(`path must be at most ${MAX_PATH_LENGTH} characters`);
      }
      if (p.includes('://') || p.toLowerCase().includes('http://') || p.toLowerCase().includes('https://')) {
        throw new BadRequestException('path must not contain URL scheme');
      }
      if (p.includes('..')) {
        throw new BadRequestException('path must not contain ".."');
      }
    }

    // paramsJson — deep validation
    let paramKeys: string[] = [];
    if (fields.paramsJson !== undefined) {
      const params = fields.paramsJson;
      if (
        params === null ||
        typeof params !== 'object' ||
        Array.isArray(params)
      ) {
        throw new BadRequestException('paramsJson must be a plain object');
      }
      paramKeys = Object.keys(params);
      if (paramKeys.length > MAX_PARAMS_PER_TARGET) {
        throw new BadRequestException(`paramsJson must have at most ${MAX_PARAMS_PER_TARGET} keys`);
      }
      for (const key of paramKeys) {
        if (typeof key !== 'string' || key.length === 0) {
          throw new BadRequestException('paramsJson keys must be non-empty strings');
        }
        if (key.length > MAX_PARAM_KEY_LENGTH) {
          throw new BadRequestException(`paramsJson key "${key}" exceeds ${MAX_PARAM_KEY_LENGTH} chars`);
        }
        const value = (params as Record<string, unknown>)[key];
        if (typeof value !== 'string') {
          throw new BadRequestException(`paramsJson value for "${key}" must be a string`);
        }
        if (value.length > MAX_PARAM_VALUE_LENGTH) {
          throw new BadRequestException(`paramsJson value for "${key}" exceeds ${MAX_PARAM_VALUE_LENGTH} chars`);
        }
      }
    }

    // injectParam — must be a key of paramsJson when both are present
    if (fields.injectParam !== undefined) {
      if (typeof fields.injectParam !== 'string' || fields.injectParam.length === 0) {
        throw new BadRequestException('injectParam is required');
      }
      if (fields.injectParam.length > MAX_PARAM_KEY_LENGTH) {
        throw new BadRequestException(`injectParam exceeds ${MAX_PARAM_KEY_LENGTH} chars`);
      }
      if (fields.paramsJson !== undefined && !paramKeys.includes(fields.injectParam)) {
        throw new BadRequestException('injectParam must be a key of paramsJson');
      }
    }
  }
}
