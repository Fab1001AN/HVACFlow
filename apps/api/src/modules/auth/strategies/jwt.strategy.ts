import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@hvacflow/shared-types';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Verify the user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new UnauthorizedException('User is no longer active');
    }

    return payload;
  }
}
