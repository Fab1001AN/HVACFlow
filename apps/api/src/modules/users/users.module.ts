import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Module,
} from '@nestjs/common';
import { IsString, IsEmail, IsOptional, IsBoolean, IsArray, IsUUID, MinLength } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsBoolean() isActive?: boolean = true;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SetUserRolesDto {
  @IsArray() @IsUUID(undefined, { each: true }) roleIds: string[];
}

class SetUserDepartmentsDto {
  @IsArray() departments: Array<{ departmentId: string; isPrimary: boolean }>;
}

class ResetPasswordDto {
  @IsString() @MinLength(8) newPassword: string;
}

class CreateRoleDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
}

class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}

class SetRolePermissionsDto {
  @IsArray() @IsUUID(undefined, { each: true }) permissionIds: string[];
}

// ─── Users Service ────────────────────────────────────────────────────────────

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Explicit field selection that NEVER includes passwordHash. Using
  // Prisma `select` (not `include`) means the hash never even leaves the
  // database into the app layer, so it can't leak through any response
  // built from these queries. Do not switch this back to `include` - that
  // returns every scalar field including passwordHash, which was a real
  // leak (findAll/findOne responses exposed the bcrypt hash to any client
  // with user:view). There is no @Exclude()/entity-class serialization in
  // this codebase, so query-level omission is the actual safeguard.
  private userSelect() {
    return {
      id: true,
      email: true,
      name: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      roles: { include: { role: true } },
      departments: { include: { department: true } },
    };
  }

  async findAll(search?: string, departmentId?: string, roleId?: string, isActive?: boolean) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(isActive !== undefined ? { isActive } : {}),
        ...(departmentId ? { departments: { some: { departmentId } } } : {}),
        ...(roleId ? { roles: { some: { roleId } } } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
      },
      select: this.userSelect(),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: this.userSelect(),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // config:manage is the permission that gates all user/role/department
  // administration - a user with it is an "administrator" for lockout
  // purposes. These helpers back the guard that stops the last admin from
  // being removed by ANY route (delete, deactivate, or role-strip), since
  // each of those independently reaches the same "nobody can administer
  // the system anymore" state.
  private readonly ADMIN_PERMISSION = 'config:manage';

  private async userIsAdmin(userId: string): Promise<boolean> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return roles.some((ur) => ur.role.permissions.some((rp) => rp.permission.code === this.ADMIN_PERMISSION));
  }

  private async otherActiveAdminsExist(excludeUserId: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: {
        id: { not: excludeUserId },
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { permissions: { some: { permission: { code: this.ADMIN_PERMISSION } } } } } },
      },
    });
    return count > 0;
  }

  /**
   * Throws if removing this user's admin access (by deletion, deactivation,
   * or role change) would leave the system with zero active administrators.
   * Call BEFORE any such change. No-op if the user isn't currently an admin,
   * or if other active admins remain.
   */
  private async assertNotLastAdmin(userId: string, action: string): Promise<void> {
    if (!(await this.userIsAdmin(userId))) return;
    if (await this.otherActiveAdminsExist(userId)) return;
    throw new ConflictException(`Cannot ${action} the last administrator - the system would have no one able to manage users, roles, or configuration.`);
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // The email's unique constraint is at the DB level and includes
      // soft-deleted users, so distinguish the two cases - otherwise an
      // admin sees "email already in use" for an email that belongs to no
      // visible user (the owner was deleted and is hidden from the list),
      // with no way forward.
      if (existing.deletedAt) {
        throw new ConflictException(
          'This email belonged to a deleted user. Restore that account, or delete it permanently, to reuse the email.',
        );
      }
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { password, ...rest } = dto;

    return this.prisma.user.create({
      data: { ...rest, passwordHash },
      select: this.userSelect(),
    });
  }

  // List soft-deleted users so an admin can find and restore one (e.g. a
  // returning employee, or an accidental deletion). Kept separate from the
  // normal list, which only shows active accounts.
  async findDeleted() {
    return this.prisma.user.findMany({
      where: { deletedAt: { not: null } },
      select: this.userSelect(),
      orderBy: { deletedAt: 'desc' },
    });
  }

  // Restore a soft-deleted user: clears deletedAt and reactivates. Fails if
  // the id isn't a deleted user, or if - while it was gone - a NEW active
  // user was created with the same email (which the DB unique constraint
  // would otherwise reject on restore, as a raw error).
  async restore(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.deletedAt) throw new ConflictException('User is not deleted');

    const emailTaken = await this.prisma.user.findFirst({
      where: { email: user.email, deletedAt: null, id: { not: id } },
    });
    if (emailTaken) {
      throw new ConflictException(
        'Cannot restore: another active user now has this email. Change or remove that user first.',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      select: this.userSelect(),
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    // Deactivating a user removes their ability to log in - if they're the
    // last admin, that's the same lockout as deleting them, so guard it the
    // same way. Only checked when actually turning isActive off.
    if (dto.isActive === false) {
      await this.assertNotLastAdmin(id, 'deactivate');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: this.userSelect(),
    });
  }

  async setRoles(id: string, dto: SetUserRolesDto) {
    await this.findOne(id);

    // If this change would strip admin access from the last remaining
    // admin, block it. We check the NEW role set: only a problem if the
    // user is currently the last admin AND the incoming roles no longer
    // grant config:manage.
    if (await this.userIsAdmin(id) && !(await this.otherActiveAdminsExist(id))) {
      const newRolesGrantAdmin = dto.roleIds.length > 0 && await this.prisma.role.count({
        where: {
          id: { in: dto.roleIds },
          permissions: { some: { permission: { code: this.ADMIN_PERMISSION } } },
        },
      }) > 0;
      if (!newRolesGrantAdmin) {
        throw new ConflictException('Cannot remove administrator access from the last administrator - the system would have no one able to manage users, roles, or configuration.');
      }
    }

    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    if (dto.roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
      });
    }
    return this.findOne(id);
  }

  async remove(id: string, requestingUserId: string) {
    await this.findOne(id);

    if (id === requestingUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    // Same last-admin protection used by update()/setRoles(). (This also
    // fixes a subtle bug in the previous inline check, which counted
    // deactivated admins as valid "other admins" - a deactivated admin
    // can't log in, so it shouldn't have satisfied the guard.)
    await this.assertNotLastAdmin(id, 'delete');

    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, name: true, email: true, deletedAt: true },
    });
  }

  async setDepartments(id: string, dto: SetUserDepartmentsDto) {
    await this.findOne(id);
    await this.prisma.userDepartment.deleteMany({ where: { userId: id } });
    if (dto.departments.length > 0) {
      await this.prisma.userDepartment.createMany({
        data: dto.departments.map((d) => ({ userId: id, ...d })),
      });
    }
    return this.findOne(id);
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'Password updated successfully' };
  }
}

// ─── Roles Service ────────────────────────────────────────────────────────────

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: dto });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);
    if (role.isSystem && dto.name) {
      throw new BadRequestException('System role names cannot be changed');
    }
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto) {
    const role = await this.findOne(id);

    // Prevent locking everyone out by stripping config:manage (the admin
    // permission) from a role if no other route to admin access remains.
    // Only a concern when: this role currently grants config:manage, the
    // new set drops it, and no OTHER role grants it to an active user.
    const roleCurrentlyGrantsAdmin = await this.prisma.rolePermission.count({
      where: { roleId: id, permission: { code: 'config:manage' } },
    }) > 0;
    if (roleCurrentlyGrantsAdmin) {
      const newSetKeepsAdmin = dto.permissionIds.length > 0 && await this.prisma.permission.count({
        where: { id: { in: dto.permissionIds }, code: 'config:manage' },
      }) > 0;
      if (!newSetKeepsAdmin) {
        const adminViaOtherRole = await this.prisma.user.count({
          where: {
            deletedAt: null,
            isActive: true,
            roles: { some: { roleId: { not: id }, role: { permissions: { some: { permission: { code: 'config:manage' } } } } } },
          },
        });
        if (adminViaOtherRole === 0) {
          throw new ConflictException('Cannot remove administrator access from this role - no other active administrator would remain, locking everyone out of user, role, and configuration management.');
        }
      }
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    if (dto.permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    const userCount = await this.prisma.userRole.count({ where: { roleId: id } });
    if (userCount > 0) throw new ConflictException('Cannot delete role assigned to users');
    return this.prisma.role.delete({ where: { id } });
  }
}

// ─── Permissions Service ──────────────────────────────────────────────────────

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { code: 'asc' }] });
  }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @RequirePermissions('user:view')
  findAll(
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('roleId') roleId?: string,
  ) {
    return this.service.findAll(search, departmentId, roleId);
  }

  // Must be declared before @Get(':id') so "deleted" isn't captured as an id.
  @Get('deleted')
  @RequirePermissions('user:manage')
  findDeleted() { return this.service.findDeleted(); }

  @Get(':id')
  @RequirePermissions('user:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/restore')
  @RequirePermissions('user:manage')
  restore(@Param('id') id: string) { return this.service.restore(id); }

  @Post()
  @RequirePermissions('user:manage')
  create(@Body() dto: CreateUserDto) { return this.service.create(dto); }

  @Patch(':id')
  @RequirePermissions('user:manage')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/roles')
  @RequirePermissions('user:manage')
  setRoles(@Param('id') id: string, @Body() dto: SetUserRolesDto) {
    return this.service.setRoles(id, dto);
  }

  @Patch(':id/departments')
  @RequirePermissions('user:manage')
  setDepartments(@Param('id') id: string, @Body() dto: SetUserDepartmentsDto) {
    return this.service.setDepartments(id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions('user:manage')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('user:manage')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user.sub);
  }
}

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('role:view')
  findAll() { return this.service.findAll(); }

  @Get(':id')
  @RequirePermissions('role:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermissions('role:manage')
  create(@Body() dto: CreateRoleDto) { return this.service.create(dto); }

  @Patch(':id')
  @RequirePermissions('role:manage')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/permissions')
  @RequirePermissions('role:manage')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.service.setPermissions(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @RequirePermissions('role:view')
  findAll() { return this.service.findAll(); }
}

// ─── Modules ─────────────────────────────────────────────────────────────────

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
