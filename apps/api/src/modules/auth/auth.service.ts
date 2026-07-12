import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtPayload, AuthTokens, AuthUser } from '@hvacflow/shared-types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return null;
    }

    return user;
  }

  async login(userId: string): Promise<{ tokens: AuthTokens; user: AuthUser }> {
    const user = await this.getFullUser(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update lastLoginAt
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    // Build flat permissions list from all roles
    const permissions = this.extractPermissions(user);
    const departmentIds = user.departments.map((ud) => ud.departmentId);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      permissions,
      departmentIds,
    };

    const tokens = await this.generateTokens(payload);

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        roles: user.roles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          description: ur.role.description,
          isSystem: ur.role.isSystem,
        })),
        departments: user.departments.map((ud) => ({
          departmentId: ud.departmentId,
          department: {
            id: ud.department.id,
            name: ud.department.name,
            code: ud.department.code,
            color: ud.department.color,
            sortOrder: ud.department.sortOrder,
            isActive: ud.department.isActive,
          },
          isPrimary: ud.isPrimary,
        })),
        permissions,
      },
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('app.jwt.refreshSecret'),
      });

      // Re-resolve permissions in case roles changed
      const user = await this.getFullUser(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User is no longer active');
      }

      const permissions = this.extractPermissions(user);
      const departmentIds = user.departments.map((ud) => ud.departmentId);

      const newPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        permissions,
        departmentIds,
      };

      return this.generateTokens(newPayload);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.getFullUser(userId);
    if (!user) throw new NotFoundException('User not found');

    const permissions = this.extractPermissions(user);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.roles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        isSystem: ur.role.isSystem,
      })),
      departments: user.departments.map((ud) => ({
        departmentId: ud.departmentId,
        department: {
          id: ud.department.id,
          name: ud.department.name,
          code: ud.department.code,
          color: ud.department.color,
          sortOrder: ud.department.sortOrder,
          isActive: ud.department.isActive,
        },
        isPrimary: ud.isPrimary,
      })),
      permissions,
    };
  }

  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
  const accessSecret =
    this.configService.getOrThrow<string>("app.jwt.accessSecret");

  const refreshSecret =
    this.configService.getOrThrow<string>("app.jwt.refreshSecret");

  const accessExpiresIn = "15m" as const;
  const refreshExpiresIn = "7d" as const;

  const [accessToken, refreshToken] = await Promise.all([
    this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn,
    }),
    this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    }),
  ]);

  return {
    accessToken,
    refreshToken,
  };
}

  private async getFullUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        departments: {
          include: { department: true },
        },
      },
    });
  }

  private extractPermissions(
    user: Awaited<ReturnType<typeof this.getFullUser>>,
  ): string[] {
    if (!user) return [];
    const permSet = new Set<string>();
    for (const userRole of user.roles) {
      for (const rp of userRole.role.permissions) {
        permSet.add(rp.permission.code);
      }
    }
    return Array.from(permSet);
  }
}
