import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
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

  /**
   * Mints a short-lived, read-only access token scoped to `targetUserId`,
   * for admins previewing how another user's dashboard looks. No refresh
   * token is issued — the preview session simply expires. Writes are
   * blocked globally for these tokens by ImpersonationGuard.
   */
  async impersonate(adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      throw new BadRequestException('You are already viewing your own dashboard');
    }

    const admin = await this.getFullUser(adminId);
    if (!admin) throw new NotFoundException('Admin user not found');

    const target = await this.getFullUser(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    if (!target.isActive) {
      throw new BadRequestException('Cannot preview an inactive user');
    }

    const permissions = this.extractPermissions(target);
    const departmentIds = target.departments.map((ud) => ud.departmentId);

    const payload: JwtPayload = {
      sub: target.id,
      email: target.email,
      name: target.name,
      permissions,
      departmentIds,
      impersonatedBy: admin.id,
    };

    const accessSecret = this.configService.getOrThrow<string>('app.jwt.accessSecret');
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: '30m',
    });

    // Accountability trail: record who previewed whom. Names are snapshotted
    // so the entry stays meaningful even if an account is deleted later.
    // Wrapped so an audit-write failure can never block the preview itself.
    try {
      await this.prisma.impersonationAudit.create({
        data: {
          adminId: admin.id,
          targetUserId: target.id,
          adminName: admin.name,
          targetUserName: target.name,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to write impersonation audit entry:', err);
    }

    return {
      accessToken,
      user: {
        id: target.id,
        email: target.email,
        name: target.name,
        isActive: target.isActive,
        roles: target.roles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          description: ur.role.description,
          isSystem: ur.role.isSystem,
        })),
        departments: target.departments.map((ud) => ({
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
      } satisfies AuthUser,
      impersonatedBy: { id: admin.id, name: admin.name },
    };
  }

  /** Admin-only: the impersonation/"view as" audit trail, most recent first. */
  async listImpersonationAudit(limit = 200) {
    return this.prisma.impersonationAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
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
