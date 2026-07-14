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

  private userIncludes() {
    return {
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
      include: this.userIncludes(),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      include: this.userIncludes(),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { password, ...rest } = dto;

    return this.prisma.user.create({
      data: { ...rest, passwordHash },
      include: this.userIncludes(),
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      include: this.userIncludes(),
    });
  }

  async setRoles(id: string, dto: SetUserRolesDto) {
    await this.findOne(id);
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

    // Guard against removing the last active user with a role that has admin-level access
    // (config:manage is the permission that gates user/role/department management).
    const targetRoles = await this.prisma.userRole.findMany({
      where: { userId: id },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const targetIsAdmin = targetRoles.some((ur) =>
      ur.role.permissions.some((rp) => rp.permission.code === 'config:manage'),
    );
    if (targetIsAdmin) {
      const otherAdmins = await this.prisma.user.count({
        where: {
          id: { not: id },
          deletedAt: null,
          roles: { some: { role: { permissions: { some: { permission: { code: 'config:manage' } } } } } },
        },
      });
      if (otherAdmins === 0) {
        throw new ConflictException('Cannot delete the last administrator account');
      }
    }

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
    await this.findOne(id);
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

  @Get(':id')
  @RequirePermissions('user:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

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
