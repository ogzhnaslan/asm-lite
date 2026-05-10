import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PwnedPasswordsService } from './pwned-passwords.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly pwnedPasswords: PwnedPasswordsService,
  ) {}

  async register(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    // Pwned password check runs before bcrypt to avoid hashing a rejected password
    const enabled = process.env.ENABLE_PWNED_PASSWORD_CHECK !== 'false';
    if (enabled) {
      const pwned = await this.pwnedPasswords.check(password);

      if (pwned.pwned) {
        throw new BadRequestException(
          'Bu şifre daha önce veri ihlallerinde görülmüş. Lütfen daha güvenli bir şifre seçin.',
        );
      }

      if (!pwned.checked && pwned.error) {
        const failureMode = process.env.PWNED_PASSWORD_FAILURE_MODE ?? 'soft';
        if (failureMode === 'strict') {
          throw new BadRequestException(
            'Şifre güvenlik kontrolü şu anda tamamlanamadı. Lütfen daha sonra tekrar deneyin.',
          );
        }
        this.logger.warn(`Pwned password check skipped (soft mode): ${pwned.error}`);
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, password: hashed },
      select: { id: true, email: true, createdAt: true },
    });

    return { user, token: this.sign(user.id, user.email) };
  }

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return { token: this.sign(user.id, user.email) };
  }

  private sign(id: string, email: string): string {
    return this.jwt.sign({ sub: id, email });
  }
}
