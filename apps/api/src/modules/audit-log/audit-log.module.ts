import { Injectable, Controller, Get, Query, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class AuditLogQueryDto {
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  // Admin-only, paginated, newest first. Optional filters by actor, entity
  // type, and action so an admin can answer "who deleted this department?"
  // or "what did this user change last week?".
  async list(query: AuditLogQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = Math.min(query.pageSize && query.pageSize > 0 ? query.pageSize : 50, 200);

    const where = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entity ? { entity: { contains: query.entity, mode: 'insensitive' as const } } : {}),
      ...(query.action ? { action: query.action.toUpperCase() } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  @RequirePermissions('config:manage')
  list(@Query() query: AuditLogQueryDto) {
    return this.service.list(query);
  }
}

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogViewModule {}
