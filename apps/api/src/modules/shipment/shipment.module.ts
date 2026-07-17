import {
  Injectable, NotFoundException,
  Controller, Get, Post, Patch,
  Body, Param, Module,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsDateString, MaxLength } from 'class-validator';
import { ActivityAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { ActivityLogModule, ActivityLogService } from '../activity-log/activity-log.module';

// ─── DTOs ─────────────────────────────────────────────────────────────────────
// Every field is optional except which unit it's for - a shipping
// person might fill this in over several visits (log the truck number
// now, come back and add the signed proof-of-delivery once it's
// actually received), not all at once in a single form.

class CreateShipmentDto {
  @IsOptional() @IsString() @MaxLength(200) carrierName?: string;
  @IsOptional() @IsDateString() shipDate?: string;
  @IsOptional() @IsString() @MaxLength(100) truckNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) driverName?: string;
  @IsOptional() @IsBoolean() destinationConfirmed?: boolean;
  @IsOptional() @IsString() @MaxLength(200) receivedBySignature?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class UpdateShipmentDto extends CreateShipmentDto {}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ShipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  listByUnit(unitId: string) {
    return this.prisma.shipmentRecord.findMany({
      where: { unitId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(unitId: string, dto: CreateShipmentDto, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit not found');

    const shipment = await this.prisma.shipmentRecord.create({
      data: {
        unitId,
        carrierName: dto.carrierName,
        shipDate: dto.shipDate ? new Date(dto.shipDate) : undefined,
        truckNumber: dto.truckNumber,
        trackingNumber: dto.trackingNumber,
        driverName: dto.driverName,
        destinationConfirmed: dto.destinationConfirmed ?? false,
        receivedBySignature: dto.receivedBySignature,
        notes: dto.notes,
        createdByUserId: userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await this.activityLog.log({
      unitId,
      userId,
      action: ActivityAction.ShipmentLogged,
      description: `Shipment logged${dto.carrierName ? ` - ${dto.carrierName}` : ''}${dto.truckNumber ? `, truck ${dto.truckNumber}` : ''}`,
    });
    return shipment;
  }

  async update(id: string, dto: UpdateShipmentDto) {
    const existing = await this.prisma.shipmentRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Shipment record not found');

    return this.prisma.shipmentRecord.update({
      where: { id },
      data: {
        ...(dto.carrierName !== undefined ? { carrierName: dto.carrierName } : {}),
        ...(dto.shipDate !== undefined ? { shipDate: new Date(dto.shipDate) } : {}),
        ...(dto.truckNumber !== undefined ? { truckNumber: dto.truckNumber } : {}),
        ...(dto.trackingNumber !== undefined ? { trackingNumber: dto.trackingNumber } : {}),
        ...(dto.driverName !== undefined ? { driverName: dto.driverName } : {}),
        ...(dto.destinationConfirmed !== undefined ? { destinationConfirmed: dto.destinationConfirmed } : {}),
        ...(dto.receivedBySignature !== undefined ? { receivedBySignature: dto.receivedBySignature } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Shipments')
@ApiBearerAuth()
@Controller()
export class ShipmentController {
  constructor(private readonly service: ShipmentService) {}

  @Get('units/:unitId/shipments')
  @RequirePermissions('unit:view')
  listByUnit(@Param('unitId') unitId: string) {
    return this.service.listByUnit(unitId);
  }

  @Post('units/:unitId/shipments')
  @RequirePermissions('shipment:manage')
  create(@Param('unitId') unitId: string, @Body() dto: CreateShipmentDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(unitId, dto, user.sub);
  }

  @Patch('shipments/:id')
  @RequirePermissions('shipment:manage')
  update(@Param('id') id: string, @Body() dto: UpdateShipmentDto) {
    return this.service.update(id, dto);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [ActivityLogModule],
  controllers: [ShipmentController],
  providers: [ShipmentService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
