import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantContextService } from './assistant-context.service';
import { AssistantLlmService } from './assistant-llm.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockAsset = {
  value: 'example.com',
  type: 'DOMAIN',
  status: 'VERIFIED',
  critical: false,
  scanInterval: '24h',
};

const mockContext = {
  asset: mockAsset,
  scanRuns: [{ status: 'DONE', startedAt: new Date().toISOString(), finishedAt: null, findingCount: 3 }],
  findings: {
    activeCount: 3,
    resolvedCount: 1,
    bySeverity: { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 0 },
    top: [{ type: 'DNS_DMARC_MISSING', severity: 'HIGH', key: 'DNS_DMARC_MISSING:example.com', aiScore: 75, summary: 'DMARC eksik', recommendations: ['DMARC kaydı ekleyin'] }],
  },
  intelligence: {
    dns: { totalRecords: 5, a: 1, mx: 1, ns: 2, txt: 1, caa: 0, hasDmarc: false, errorCount: 0 },
    rdap: null,
    geoip: null,
    robots: null,
    phishtank: null,
    reputation: null,
    breach: null,
  },
  hasIntelligence: true,
};

const mockPrisma = {
  asset: { findFirst: jest.fn() },
};

const mockContextService = {
  build: jest.fn().mockResolvedValue(mockContext),
  formatForPrompt: jest.fn().mockReturnValue('formatted prompt'),
};

const mockLlmService = {
  chat: jest.fn().mockResolvedValue({ answer: 'AI cevabı', model: 'ollama:llama3.2' }),
};

describe('AssistantService', () => {
  let service: AssistantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AssistantContextService, useValue: mockContextService },
        { provide: AssistantLlmService, useValue: mockLlmService },
      ],
    }).compile();

    service = module.get<AssistantService>(AssistantService);
    jest.clearAllMocks();
    mockContextService.build.mockResolvedValue(mockContext);
    mockContextService.formatForPrompt.mockReturnValue('formatted prompt');
    mockLlmService.chat.mockResolvedValue({ answer: 'AI cevabı', model: 'ollama:llama3.2' });
  });

  it('tanımlı olmalı', () => {
    expect(service).toBeDefined();
  });

  it('başka kullanıcının asset\'i → 404 fırlatır', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);

    await expect(service.chat('user-1', 'asset-x', 'soru')).rejects.toThrow(NotFoundException);
    expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-x', userId: 'user-1' },
      select: expect.any(Object),
    });
  });

  it('ownership geçerliyse context + LLM çağırır', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);

    const result = await service.chat('user-1', 'asset-1', 'Ne yapmalıyım?');

    expect(mockContextService.build).toHaveBeenCalledWith('asset-1', mockAsset);
    expect(mockContextService.formatForPrompt).toHaveBeenCalledWith(mockContext, 'Ne yapmalıyım?');
    expect(mockLlmService.chat).toHaveBeenCalledWith('formatted prompt');
    expect(result.answer).toBe('AI cevabı');
    expect(result.model).toBe('ollama:llama3.2');
    expect(result.usedContext.asset).toBe(true);
    expect(result.usedContext.findings).toBe(3);
    expect(result.usedContext.intelligence).toBe(true);
    expect(result.usedContext.scanRuns).toBe(1);
  });

  it('LLM hata verirse kontrollü cevap döner', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);
    mockLlmService.chat.mockRejectedValue(new Error('Ollama down'));

    const result = await service.chat('user-1', 'asset-1', 'soru');

    expect(result.answer).toContain('erişilemiyor');
    expect(result.model).toBe('none');
  });

  it('usedContext içinde doğru sayılar var', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(mockAsset);

    const result = await service.chat('user-1', 'asset-1', 'soru');

    expect(result.usedContext).toEqual({
      asset: true,
      findings: 3,
      intelligence: true,
      scanRuns: 1,
    });
  });
});
