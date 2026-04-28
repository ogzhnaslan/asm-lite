import { Test, TestingModule } from '@nestjs/testing';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

const mockAssetsService = {
  create: jest.fn(),
  list: jest.fn(),
  get: jest.fn(),
  remove: jest.fn(),
  setCritical: jest.fn(),
  updateScanInterval: jest.fn(),
  requestHttpToken: jest.fn(),
  requestDnsToken: jest.fn(),
  verifyHttp: jest.fn(),
  verifyDns: jest.fn(),
};

const mockUser = { id: 'user-1', email: 'test@example.com' };

describe('AssetsController', () => {
  let controller: AssetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [{ provide: AssetsService, useValue: mockAssetsService }],
    }).compile();

    controller = module.get<AssetsController>(AssetsController);
    jest.clearAllMocks();
  });

  it('tanımlı olmalı', () => {
    expect(controller).toBeDefined();
  });

  it('create → service.create çağırır', () => {
    const body = { value: 'example.com' };
    controller.create(mockUser, body);
    expect(mockAssetsService.create).toHaveBeenCalledWith('user-1', body);
  });

  it('list → service.list çağırır', () => {
    controller.list(mockUser, '2', '10');
    expect(mockAssetsService.list).toHaveBeenCalledWith('user-1', { page: 2, limit: 10 });
  });

  it('remove → service.remove çağırır', () => {
    controller.remove(mockUser, 'asset-1');
    expect(mockAssetsService.remove).toHaveBeenCalledWith('user-1', 'asset-1');
  });

  it('setCritical → service.setCritical çağırır', () => {
    controller.setCritical(mockUser, 'asset-1', { critical: true });
    expect(mockAssetsService.setCritical).toHaveBeenCalledWith('user-1', 'asset-1', true);
  });
});
