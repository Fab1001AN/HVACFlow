import { Injectable, Controller, Get, Param, Module } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ActivityAction } from '@prisma/client';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one entry on a unit's activity timeline. Called from other
   * services at the moment a meaningful business event happens - never
   * awaited in a way that could fail the actual operation (logging a
   * problem shouldn't block the real work), so callers should not put
   * this inside the same transaction as the primary write unless the
   * log entry is itself essential to that transaction's correctness.
   */
  async log(params: {
    unitId: string;
    userId?: string | null;
    action: ActivityAction;
    description: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          unitId: params.unitId,
          userId: params.userId ?? undefined,
          action: params.action,
          description: params.description,
          metadata: params.metadata as any,
        },
      });
    } catch (err) {
      // Never let a logging failure break the real operation that
      // triggered it (e.g. a unit being deleted concurrently would
      // otherwise turn an unrelated write into a 500).
      // eslint-disable-next-line no-console
      console.error('ActivityLogService.log failed:', err);
    }
  }

  async listByUnit(unitId: string) {
    return this.prisma.activityLog.findMany({
      where: { unitId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

@ApiTags('Activity Log')
@ApiBearerAuth()
@Controller()
export class ActivityLogController {
  constructor(private readonly service: ActivityLogService) {}

  @Get('units/:unitId/activity')
  @RequirePermissions('unit:view')
  listByUnit(@Param('unitId') unitId: string) {
    return this.service.listByUnit(unitId);
  }
}

@Module({
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
