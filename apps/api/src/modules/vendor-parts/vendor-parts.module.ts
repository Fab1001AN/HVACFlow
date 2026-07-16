import {
  Injectable, NotFoundException,
  Controller, Get, Post, Patch, Delete,
  Body, Param, Module,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsUUID, IsDateString } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateVendorPartDto {
  @IsUUID() partTypeId: string;
  @IsBoolean() isReceived: boolean;
  @IsOptional() @IsDateString() expectedArrivalDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
}

class UpdateVendorPartDto {
  @IsOptional() @IsBoolean() isReceived?: boolean;
  @IsOptional() @IsDateString() expectedArrivalDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VendorPartsService {
  constructor(private readonly prisma: PrismaService) {}

  listByUnit(unitId: string) {
    return this.prisma.vendorPart.findMany({
      where: { unitId },
      include: { partType: true, addedByUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(unitId: string, dto: CreateVendorPartDto, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId, deletedAt: null } });
    if (!unit) throw new NotFoundException('Unit not found');

    return this.prisma.vendorPart.create({
      data: {
        unitId,
        partTypeId: dto.partTypeId,
        isReceived: dto.isReceived,
        expectedArrivalDate: dto.expectedArrivalDate ? new Date(dto.expectedArrivalDate) : null,
        // If marked received without an explicit date, default to now
        // rather than leaving it null - a received part should always
        // have a receipt date.
        receivedDate: dto.isReceived ? new Date(dto.receivedDate ?? Date.now()) : null,
        addedByUserId: userId,
      },
      include: { partType: true, addedByUser: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateVendorPartDto) {
    const existing = await this.prisma.vendorPart.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vendor part not found');

    const isReceived = dto.isReceived ?? existing.isReceived;
    return this.prisma.vendorPart.update({
      where: { id },
      data: {
        ...(dto.isReceived !== undefined ? { isReceived: dto.isReceived } : {}),
        // Arrival dates slip - always editable regardless of received
        // status, not just while pending.
        ...(dto.expectedArrivalDate !== undefined ? { expectedArrivalDate: new Date(dto.expectedArrivalDate) } : {}),
        ...(dto.receivedDate !== undefined ? { receivedDate: new Date(dto.receivedDate) } : {}),
        // Flipping to received without an explicit date defaults to now.
        ...(dto.isReceived === true && dto.receivedDate === undefined && !existing.receivedDate ? { receivedDate: new Date() } : {}),
        ...(isReceived === false && dto.isReceived !== undefined ? { receivedDate: null } : {}),
      },
      include: { partType: true, addedByUser: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.vendorPart.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vendor part not found');
    return this.prisma.vendorPart.delete({ where: { id } });
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Vendor Parts')
@ApiBearerAuth()
@Controller()
export class VendorPartsController {
  constructor(private readonly service: VendorPartsService) {}

  @Get('units/:unitId/vendor-parts')
  @RequirePermissions('unit:view')
  listByUnit(@Param('unitId') unitId: string) {
    return this.service.listByUnit(unitId);
  }

  @Post('units/:unitId/vendor-parts')
  @RequirePermissions('vendor-part:manage')
  create(@Param('unitId') unitId: string, @Body() dto: CreateVendorPartDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(unitId, dto, user.sub);
  }

  @Patch('vendor-parts/:id')
  @RequirePermissions('vendor-part:manage')
  update(@Param('id') id: string, @Body() dto: UpdateVendorPartDto) {
    return this.service.update(id, dto);
  }

  @Delete('vendor-parts/:id')
  @RequirePermissions('vendor-part:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  controllers: [VendorPartsController],
  providers: [VendorPartsService],
  exports: [VendorPartsService],
})
export class VendorPartsModule {}
