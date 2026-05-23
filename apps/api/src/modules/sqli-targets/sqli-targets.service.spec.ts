import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SqliTargetsService } from './sqli-targets.service';
import { PrismaService } from '../../prisma/prisma.service';

const verifiedAsset = { id: 'asset-1', status: 'VERIFIED' };
const pendingAsset = { id: 'asset-1', status: 'PENDING' };

function makeTarget(overrides: Partial<{
  id: string; assetId: string; method: string; path: string;
  paramsJson: Record<string, string>; injectParam: string; enabled: boolean;
}> = {}) {
  return {
    id: 't-1',
    assetId: 'asset-1',
    method: 'GET',
    path: '/product',
    paramsJson: { id: '1' },
    injectParam: 'id',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SqliTargetsService', () => {
  let service: SqliTargetsService;
  let prismaAsset: { findFirst: jest.Mock };
  let prismaSqliTarget: {
    findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock;
    update: jest.Mock; delete: jest.Mock; count: jest.Mock;
  };

  beforeEach(async () => {
    prismaAsset = { findFirst: jest.fn() };
    prismaSqliTarget = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqliTargetsService,
        {
          provide: PrismaService,
          useValue: { asset: prismaAsset, sqliTarget: prismaSqliTarget },
        },
      ],
    }).compile();

    service = module.get<SqliTargetsService>(SqliTargetsService);
  });

  // ─── Asset ownership / status guards ─────────────────────────────────────────

  describe('Asset guards (paylaşımlı)', () => {
    it('asset bulunamazsa list → NotFoundException', async () => {
      prismaAsset.findFirst.mockResolvedValue(null);
      await expect(service.list('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
    });

    it('başka kullanıcının asset\'i (findFirst null) → NotFoundException', async () => {
      // findFirst already filters by userId, returning null simulates ownership mismatch
      prismaAsset.findFirst.mockResolvedValue(null);
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(NotFoundException);
    });

    it('asset PENDING ise create → BadRequestException', async () => {
      prismaAsset.findFirst.mockResolvedValue(pendingAsset);
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => prismaAsset.findFirst.mockResolvedValue(verifiedAsset));

    it('VERIFIED asset için target oluşturulur', async () => {
      prismaSqliTarget.count.mockResolvedValue(0);
      prismaSqliTarget.create.mockResolvedValue(makeTarget());

      const result = await service.create('user-1', 'asset-1', {
        method: 'GET', path: '/product', paramsJson: { id: '1' }, injectParam: 'id',
      });

      expect(result.id).toBe('t-1');
      expect(prismaSqliTarget.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          assetId: 'asset-1', method: 'GET', path: '/product',
          paramsJson: { id: '1' }, injectParam: 'id', enabled: true,
        }),
      }));
    });

    it('5 target varken 6. create reddedilir', async () => {
      prismaSqliTarget.count.mockResolvedValue(5);
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(/Maximum 5/);
      expect(prismaSqliTarget.create).not.toHaveBeenCalled();
    });

    it('method GET dışında reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'POST' as 'GET', path: '/x', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(/method must be GET/);
    });

    it('path "/" ile başlamıyorsa reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: 'product', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(/path must start with/);
    });

    it('path içinde "://" varsa reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/redir?u=http://evil.com', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(/URL scheme/);
    });

    it('path içinde "https://" varsa reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x?https://attacker', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(/URL scheme/);
    });

    it('path içinde ".." varsa reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/../etc/passwd', paramsJson: { id: '1' }, injectParam: 'id',
      })).rejects.toThrow(/\.\./);
    });

    it('paramsJson array ise reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: ['1', '2'] as unknown as Record<string, string>, injectParam: 'id',
      })).rejects.toThrow(/plain object/);
    });

    it('paramsJson 5 keyden fazlaysa reddedilir', async () => {
      const params = { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' };
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: params, injectParam: 'a',
      })).rejects.toThrow(/at most 5 keys/);
    });

    it('param value string değilse reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: { id: 1 as unknown as string }, injectParam: 'id',
      })).rejects.toThrow(/must be a string/);
    });

    it('injectParam paramsJson içinde yoksa reddedilir', async () => {
      await expect(service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: { id: '1' }, injectParam: 'q',
      })).rejects.toThrow(/key of paramsJson/);
    });

    it('enabled default true alır', async () => {
      prismaSqliTarget.count.mockResolvedValue(0);
      prismaSqliTarget.create.mockResolvedValue(makeTarget({ enabled: true }));

      await service.create('user-1', 'asset-1', {
        method: 'GET', path: '/x', paramsJson: { id: '1' }, injectParam: 'id',
      });

      expect(prismaSqliTarget.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ enabled: true }),
      }));
    });
  });

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('VERIFIED asset için targetları döndürür', async () => {
      prismaAsset.findFirst.mockResolvedValue(verifiedAsset);
      prismaSqliTarget.findMany.mockResolvedValue([makeTarget(), makeTarget({ id: 't-2', path: '/search' })]);

      const result = await service.list('user-1', 'asset-1');

      expect(result).toHaveLength(2);
      expect(prismaSqliTarget.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { assetId: 'asset-1' },
      }));
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    beforeEach(() => prismaAsset.findFirst.mockResolvedValue(verifiedAsset));

    it('enabled toggle çalışır', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(makeTarget({ enabled: true }));
      prismaSqliTarget.update.mockResolvedValue(makeTarget({ enabled: false }));

      const result = await service.update('user-1', 'asset-1', 't-1', { enabled: false });

      expect(result.enabled).toBe(false);
      expect(prismaSqliTarget.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 't-1' },
        data: { enabled: false },
      }));
    });

    it('paramsJson güncellenirse injectParam yeni keys içinde olmalı', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(makeTarget({ paramsJson: { id: '1' }, injectParam: 'id' }));

      // injectParam mevcut 'id' ama yeni paramsJson 'q' içeriyor → injectParam artık geçersiz
      await expect(service.update('user-1', 'asset-1', 't-1', {
        paramsJson: { q: 'test' },
      })).rejects.toThrow(/key of paramsJson/);
    });

    it('injectParam güncellenirse mevcut paramsJson içinde olmalı', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(makeTarget({ paramsJson: { id: '1' }, injectParam: 'id' }));

      await expect(service.update('user-1', 'asset-1', 't-1', {
        injectParam: 'q',
      })).rejects.toThrow(/key of paramsJson/);
    });

    it('hem paramsJson hem injectParam birlikte değişirse merge validation çalışır', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(makeTarget());
      prismaSqliTarget.update.mockResolvedValue(makeTarget({ paramsJson: { q: 'test' }, injectParam: 'q' }));

      const result = await service.update('user-1', 'asset-1', 't-1', {
        paramsJson: { q: 'test' }, injectParam: 'q',
      });

      expect(result.injectParam).toBe('q');
    });

    it('target başka asset\'e aitse update → NotFoundException', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(null); // assetId filtresi başarısız
      await expect(service.update('user-1', 'asset-1', 't-other', { enabled: false }))
        .rejects.toThrow(/SQLi target not found/);
    });

    it('geçersiz path update reddedilir (validation korunur)', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(makeTarget());
      await expect(service.update('user-1', 'asset-1', 't-1', { path: '/etc/../passwd' }))
        .rejects.toThrow(/\.\./);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    beforeEach(() => prismaAsset.findFirst.mockResolvedValue(verifiedAsset));

    it('mevcut target silinir', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(makeTarget());

      const result = await service.remove('user-1', 'asset-1', 't-1');

      expect(result.ok).toBe(true);
      expect(prismaSqliTarget.delete).toHaveBeenCalledWith({ where: { id: 't-1' } });
    });

    it('target başka asset\'e aitse delete → NotFoundException', async () => {
      prismaSqliTarget.findFirst.mockResolvedValue(null);
      await expect(service.remove('user-1', 'asset-1', 't-other'))
        .rejects.toThrow(/SQLi target not found/);
      expect(prismaSqliTarget.delete).not.toHaveBeenCalled();
    });
  });
});
