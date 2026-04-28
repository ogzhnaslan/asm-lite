import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));

const mockHash = bcrypt.hash as jest.Mock;
const mockCompare = bcrypt.compare as jest.Mock;

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  password: 'hashed_pw',
  createdAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let prismaUser: { findUnique: jest.Mock; create: jest.Mock };
  let jwtSign: jest.Mock;

  beforeEach(async () => {
    prismaUser = { findUnique: jest.fn(), create: jest.fn() };
    jwtSign = jest.fn().mockReturnValue('mock.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: prismaUser } },
        { provide: JwtService, useValue: { sign: jwtSign } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    jwtSign.mockReturnValue('mock.jwt.token');
  });

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('başarılı kayıt → user ve token döner', async () => {
      prismaUser.findUnique.mockResolvedValue(null);
      mockHash.mockResolvedValue('hashed_pw');
      prismaUser.create.mockResolvedValue({ id: 'user-1', email: 'test@example.com', createdAt: new Date() });

      const result = await service.register('test@example.com', 'password123');

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBe('mock.jwt.token');
      expect(mockHash).toHaveBeenCalledWith('password123', 10);
    });

    it('email boş → BadRequestException', async () => {
      await expect(service.register('', 'password')).rejects.toThrow(BadRequestException);
      expect(prismaUser.findUnique).not.toHaveBeenCalled();
    });

    it('şifre boş → BadRequestException', async () => {
      await expect(service.register('test@example.com', '')).rejects.toThrow(BadRequestException);
    });

    it('email zaten kayıtlı → ConflictException', async () => {
      prismaUser.findUnique.mockResolvedValue(mockUser);

      await expect(service.register('test@example.com', 'password')).rejects.toThrow(ConflictException);
      expect(prismaUser.create).not.toHaveBeenCalled();
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('başarılı giriş → token döner', async () => {
      prismaUser.findUnique.mockResolvedValue(mockUser);
      mockCompare.mockResolvedValue(true);

      const result = await service.login('test@example.com', 'password123');

      expect(result.token).toBe('mock.jwt.token');
      expect(mockCompare).toHaveBeenCalledWith('password123', 'hashed_pw');
    });

    it('email boş → BadRequestException', async () => {
      await expect(service.login('', 'password')).rejects.toThrow(BadRequestException);
    });

    it('şifre boş → BadRequestException', async () => {
      await expect(service.login('test@example.com', '')).rejects.toThrow(BadRequestException);
    });

    it('kullanıcı bulunamadı → UnauthorizedException', async () => {
      prismaUser.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@example.com', 'password')).rejects.toThrow(UnauthorizedException);
    });

    it('şifre yanlış → UnauthorizedException', async () => {
      prismaUser.findUnique.mockResolvedValue(mockUser);
      mockCompare.mockResolvedValue(false);

      await expect(service.login('test@example.com', 'wrong_pass')).rejects.toThrow(UnauthorizedException);
    });
  });
});
