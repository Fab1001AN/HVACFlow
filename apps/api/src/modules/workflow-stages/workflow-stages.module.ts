import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
  Controller, Get, Post, Patch, Delete,
  Body, Param, Module,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsUUID, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { ActivityLogModule, ActivityLogService } from '../activity-log/activity-log.module';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateWorkflowStageDto {
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsString() @MaxLength(100) requiredPermission: string;
  @IsOptional() @IsString() @MaxLength(50) actionLabel?: string;
  @IsOptional() @IsBoolean() allowsBackward?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @IsBoolean() gatesOnPartsComplete?: boolean;
  @IsOptional() @IsBoolean() isManagerBoundary?: boolean;
}

class UpdateWorkflowStageDto extends PartialType(CreateWorkflowStageDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ReorderItemDto {
  @IsUUID() id: string;
  sortOrder: number;
}

class ReorderWorkflowStagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

class MoveBackDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class SendBackDto {
  @IsUUID() targetStageId: string;
  @IsString() @MaxLength(500) reason: string;
}

class SetStageDto {
  @IsUUID() stageId: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowStagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  findAll() {
    return this.prisma.workflowStage.findMany({
      include: { department: true, _count: { select: { units: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const stage = await this.prisma.workflowStage.findUnique({ where: { id }, include: { department: true } });
    if (!stage) throw new NotFoundException('Workflow stage not found');
    return stage;
  }

  // Same reasoning as ProcessDefinitionsService.impact()/DepartmentsService.impact()
  // from Step 1 - editing or deactivating a stage that units are
  // currently sitting on is a real, immediate risk, not a hypothetical
  // one. Reusing the identical pattern rather than inventing a new one.
  async impact(id: string) {
    const unitsHere = await this.prisma.unit.count({ where: { currentWorkflowStageId: id, deletedAt: null } });
    return { unitsHere };
  }

  async create(dto: CreateWorkflowStageDto) {
    const maxOrder = await this.prisma.workflowStage.aggregate({ _max: { sortOrder: true } });
    return this.prisma.workflowStage.create({
      data: { ...dto, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
      include: { department: true },
    });
  }

  async update(id: string, dto: UpdateWorkflowStageDto) {
    await this.findOne(id);
    return this.prisma.workflowStage.update({ where: { id }, data: dto, include: { department: true } });
  }

  async remove(id: string) {
    const unitsHere = await this.prisma.unit.count({ where: { currentWorkflowStageId: id } });
    if (unitsHere > 0) {
      throw new ConflictException(
        `Cannot delete - ${unitsHere} unit(s) are currently on this stage. Move them first, or deactivate the stage instead of deleting it.`,
      );
    }
    return this.prisma.workflowStage.delete({ where: { id } });
  }

  async reorder(dto: ReorderWorkflowStagesDto) {
    await this.prisma.$transaction(
      dto.items.map((item) => this.prisma.workflowStage.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
    );
    return this.findAll();
  }

  private assertPermission(user: JwtPayload, requiredPermission: string) {
    // Each stage carries its OWN required permission, configured by an
    // admin at setup time - this can't be a static @RequirePermissions()
    // decorator the way every other endpoint in this app uses, since
    // the actual requirement isn't known until the stage row is read.
    if (!user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(`You don't have the '${requiredPermission}' permission required for this stage`);
    }
  }

  // Powers per-stage dashboards (Testing, eventually Dispatch) - "who's
  // actually sitting here right now" rather than a generic units list
  // filtered client-side.
  async unitsOnStage(stageId: string) {
    return this.prisma.unit.findMany({
      where: { currentWorkflowStageId: stageId, deletedAt: null },
      include: {
        unitType: true,
        priorityLevel: true,
        parts: { where: { deletedAt: null }, select: { id: true, status: true, partType: { select: { name: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  private async allStagesOrdered() {
    return this.prisma.workflowStage.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  // Would advancing this unit land it on a terminal stage? Uses the same
  // "next active stage after current" logic as advance(), so ShipmentService
  // can decide whether logging a shipment should auto-advance the unit into
  // its terminal (e.g. Shipped) stage - by position, not by matching a
  // hardcoded "Dispatch" stage name. Returns false if the unit has no stage,
  // is already terminal, or has no active stage ahead of it.
  async nextStageIsTerminal(unitId: string): Promise<boolean> {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId }, select: { currentWorkflowStageId: true } });
    if (!unit?.currentWorkflowStageId) return false;
    const allStages = await this.allStagesOrdered();
    const currentIndex = allStages.findIndex((s) => s.id === unit.currentWorkflowStageId);
    if (currentIndex < 0) return false;
    for (let i = currentIndex + 1; i < allStages.length; i++) {
      if (allStages[i].isActive) return allStages[i].isTerminal;
    }
    return false;
  }

  async advance(unitId: string, user: JwtPayload) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit not found');

    // Deliberately look up the unit's CURRENT position among ALL stages,
    // not just active ones - Step 1's own impact-warning system allows
    // deactivating a stage while units still sit on it (with a
    // confirmation), so a unit can legitimately be parked on an
    // inactive stage. Using only-active stages to find "where am I now"
    // would make that unit invisible to its own position (findIndex
    // returns -1, identical to "hasn't started yet"), silently sending
    // it back to stage one instead of correctly continuing forward.
    // Only the DESTINATION needs to be active - you can leave an
    // inactive stage, you just can't be routed INTO one.
    const allStages = await this.allStagesOrdered();
    if (allStages.filter((s) => s.isActive).length === 0) {
      throw new ConflictException('No workflow stages configured yet - set them up in Configuration first');
    }

    const currentIndex = unit.currentWorkflowStageId ? allStages.findIndex((s) => s.id === unit.currentWorkflowStageId) : -1;
    let nextStage: (typeof allStages)[number] | undefined;
    for (let i = currentIndex + 1; i < allStages.length; i++) {
      if (allStages[i].isActive) { nextStage = allStages[i]; break; }
    }
    if (!nextStage) throw new ConflictException('Already at the final stage');
    this.assertPermission(user, nextStage.requiredPermission);

    // The parts-completion quality gate: a unit can't advance INTO a stage
    // flagged gatesOnPartsComplete while any of its parts still have
    // unfinished work. Flag-driven rather than matched to a hardcoded stage
    // name, so a deployment can position this gate wherever its pipeline
    // needs it (or nowhere) via the Workflow Stages config.
    if (nextStage.gatesOnPartsComplete) {
      const parts = await this.prisma.part.findMany({ where: { unitId, deletedAt: null }, select: { status: true, partType: { select: { name: true } } } });
      const unfinished = parts.filter((p) => p.status !== 'Completed');
      if (unfinished.length > 0) {
        throw new ConflictException(
          `Cannot mark this unit completed - ${unfinished.length} part(s) still have unfinished work: ${unfinished.map((p) => p.partType.name).join(', ')}`,
        );
      }
    }

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: { currentWorkflowStageId: nextStage.id },
      include: { currentWorkflowStage: true },
    });
    await this.activityLog.log({
      unitId,
      userId: user.sub,
      action: ActivityAction.WorkflowStageAdvanced,
      description: `Advanced to ${nextStage.name}`,
    });
    return updated;
  }

  async moveBack(unitId: string, dto: MoveBackDto, user: JwtPayload) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (!unit.currentWorkflowStageId) throw new ConflictException('This unit is not on any stage yet');

    const allStages = await this.allStagesOrdered();
    const currentIndex = allStages.findIndex((s) => s.id === unit.currentWorkflowStageId);
    if (currentIndex < 0) throw new ConflictException('This unit\'s current stage no longer exists - use the admin override to set a valid stage');
    if (currentIndex === 0) throw new ConflictException('Already at the first stage');

    const currentStage = allStages[currentIndex];
    if (!currentStage.allowsBackward) {
      throw new ConflictException(`${currentStage.name} does not allow moving backward - enable it in Configuration if this should be possible`);
    }
    this.assertPermission(user, currentStage.requiredPermission);

    let prevStage: (typeof allStages)[number] | undefined;
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (allStages[i].isActive) { prevStage = allStages[i]; break; }
    }
    if (!prevStage) throw new ConflictException('No active stage before this one to move back to');

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: { currentWorkflowStageId: prevStage.id },
      include: { currentWorkflowStage: true },
    });
    await this.activityLog.log({
      unitId,
      userId: user.sub,
      action: ActivityAction.WorkflowStageMovedBack,
      description: `Sent back to ${prevStage.name}${dto.reason ? ` - ${dto.reason}` : ''}`,
    });
    return updated;
  }

  // Admin override - jump directly to any stage, skipping the normal
  // sequence entirely. Deliberately gated on config:manage (not a
  // per-stage permission) and always logged distinctly from a normal
  // advance/move-back, since this is a manual correction, not a real
  // workflow transition.
  // The QC scenario needs more than moveBack()'s strict single-step:
  // "send it back to Fabrication" from a QC stage near the end of the
  // pipeline needs to reach an arbitrary earlier stage, not just the
  // immediately preceding one. Reason is required - this is exactly the
  // kind of action that needs a paper trail (who sent it back, and why),
  // logged distinctly from a normal advance so it's visibly different on
  // the timeline, not just another step.
  async sendBack(unitId: string, dto: SendBackDto, user: JwtPayload) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (!unit.currentWorkflowStageId) throw new ConflictException('This unit is not on any stage yet');

    const allStages = await this.allStagesOrdered();
    const currentIndex = allStages.findIndex((s) => s.id === unit.currentWorkflowStageId);
    if (currentIndex < 0) throw new ConflictException('This unit\'s current stage no longer exists - use the admin override to set a valid stage');

    const currentStage = allStages[currentIndex];
    this.assertPermission(user, currentStage.requiredPermission);

    const targetStage = allStages.find((s) => s.id === dto.targetStageId);
    if (!targetStage) throw new NotFoundException('Target stage not found');
    if (!targetStage.isActive) throw new ConflictException(`${targetStage.name} is not active - activate it first or choose a different stage`);
    const targetIndex = allStages.findIndex((s) => s.id === targetStage.id);
    if (targetIndex >= currentIndex) throw new ConflictException('Can only send back to an earlier stage, not the current or a later one');

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: { currentWorkflowStageId: targetStage.id },
      include: { currentWorkflowStage: true },
    });
    await this.activityLog.log({
      unitId,
      userId: user.sub,
      action: ActivityAction.WorkflowStageMovedBack,
      description: `Sent back from ${currentStage.name} to ${targetStage.name} - ${dto.reason}`,
    });
    return updated;
  }

  async setStage(unitId: string, dto: SetStageDto, userId: string) {
    const [unit, stage] = await Promise.all([
      this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } }),
      this.prisma.workflowStage.findUnique({ where: { id: dto.stageId } }),
    ]);
    if (!unit) throw new NotFoundException('Unit not found');
    if (!stage) throw new NotFoundException('Workflow stage not found');

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: { currentWorkflowStageId: stage.id },
      include: { currentWorkflowStage: true },
    });
    await this.activityLog.log({
      unitId,
      userId,
      action: ActivityAction.WorkflowStageSet,
      description: `Manually set to ${stage.name} (admin override)`,
    });
    return updated;
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Workflow Stages')
@ApiBearerAuth()
@Controller()
export class WorkflowStagesController {
  constructor(private readonly service: WorkflowStagesService) {}

  @Get('workflow-stages')
  findAll() {
    return this.service.findAll();
  }

  @Get('workflow-stages/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get('workflow-stages/:id/impact')
  @RequirePermissions('config:manage')
  impact(@Param('id') id: string) {
    return this.service.impact(id);
  }

  @Get('workflow-stages/:id/units')
  @RequirePermissions('unit:view')
  unitsOnStage(@Param('id') id: string) {
    return this.service.unitsOnStage(id);
  }

  @Post('workflow-stages')
  @RequirePermissions('config:manage')
  create(@Body() dto: CreateWorkflowStageDto) {
    return this.service.create(dto);
  }

  @Patch('workflow-stages/reorder')
  @RequirePermissions('config:manage')
  reorder(@Body() dto: ReorderWorkflowStagesDto) {
    return this.service.reorder(dto);
  }

  @Patch('workflow-stages/:id')
  @RequirePermissions('config:manage')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowStageDto) {
    return this.service.update(id, dto);
  }

  @Delete('workflow-stages/:id')
  @RequirePermissions('config:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('units/:id/workflow/advance')
  advance(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.advance(id, user);
  }

  @Post('units/:id/workflow/move-back')
  moveBack(@Param('id') id: string, @Body() dto: MoveBackDto, @CurrentUser() user: JwtPayload) {
    return this.service.moveBack(id, dto, user);
  }

  @Post('units/:id/workflow/send-back')
  sendBack(@Param('id') id: string, @Body() dto: SendBackDto, @CurrentUser() user: JwtPayload) {
    return this.service.sendBack(id, dto, user);
  }

  @Post('units/:id/workflow/set-stage')
  @RequirePermissions('config:manage')
  setStage(@Param('id') id: string, @Body() dto: SetStageDto, @CurrentUser() user: JwtPayload) {
    return this.service.setStage(id, dto, user.sub);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [ActivityLogModule],
  controllers: [WorkflowStagesController],
  providers: [WorkflowStagesService],
  exports: [WorkflowStagesService],
})
export class WorkflowStagesModule {}
