import {
  Injectable, NotFoundException, ForbiddenException,
  Controller, Get, Post, Patch, Res,
  Body, Param, Module,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsDateString, MaxLength } from 'class-validator';
import { ActivityAction } from '@prisma/client';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { ActivityLogModule, ActivityLogService } from '../activity-log/activity-log.module';
import { WorkflowStagesModule, WorkflowStagesService } from '../workflow-stages/workflow-stages.module';

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
    private readonly workflowStages: WorkflowStagesService,
  ) {}

  listByUnit(unitId: string) {
    return this.prisma.shipmentRecord.findMany({
      where: { unitId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(unitId: string, dto: CreateShipmentDto, user: JwtPayload) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId, deletedAt: null },
      select: { id: true },
    });
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
        createdByUserId: user.sub,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await this.activityLog.log({
      unitId,
      userId: user.sub,
      action: ActivityAction.ShipmentLogged,
      description: `Shipment logged${dto.carrierName ? ` - ${dto.carrierName}` : ''}${dto.truckNumber ? `, truck ${dto.truckNumber}` : ''}`,
    });

    // Auto-advance into the terminal stage when a shipment is logged for a
    // unit sitting immediately before it (e.g. Dispatch -> Shipped). Decided
    // by position (is the next stage terminal?) rather than a hardcoded
    // "Dispatch" stage name, so a renamed pipeline still works. A shipment
    // logged for a unit anywhere else (a correction/backfill) doesn't move
    // it. Wrapped in try/catch and never rethrown - same defensive
    // philosophy as shadowSetStage(): a failed advance must never block the
    // shipment record itself from being saved.
    try {
      if (await this.workflowStages.nextStageIsTerminal(unitId)) {
        await this.workflowStages.advance(unitId, user);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to auto-advance unit ${unitId} to its terminal stage after logging shipment:`, err);
    }

    return shipment;
  }

  // Every shipment ever logged, joined with enough unit/order/customer
  // context to be useful as a standalone report - not filtered to only
  // "currently at Dispatch", since Directors reviewing this report care
  // about shipment history, including reships logged after rework.
  async dispatchReport() {
    return this.prisma.shipmentRecord.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        unit: {
          select: {
            serialNumber: true,
            displayName: true,
            unitType: { select: { name: true } },
            order: { select: { orderNumber: true, project: { select: { name: true, customer: { select: { name: true } } } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async dispatchReportCsv(): Promise<string> {
    const rows = await this.dispatchReport();
    const header = ['Serial Number', 'Unit', 'Customer', 'Project', 'Order', 'Carrier', 'Ship Date', 'Truck #', 'Tracking #', 'Driver', 'Destination Confirmed', 'Logged By', 'Logged At'];
    const escape = (val: unknown) => {
      const str = val === null || val === undefined ? '' : String(val);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = rows.map((r) => [
      r.unit.serialNumber,
      r.unit.displayName ?? r.unit.unitType?.name ?? '',
      r.unit.order?.project?.customer?.name ?? '',
      r.unit.order?.project?.name ?? '',
      r.unit.order?.orderNumber ?? '',
      r.carrierName ?? '',
      r.shipDate ? r.shipDate.toISOString().slice(0, 10) : '',
      r.truckNumber ?? '',
      r.trackingNumber ?? '',
      r.driverName ?? '',
      r.destinationConfirmed ? 'Yes' : 'No',
      r.createdBy?.name ?? '',
      r.createdAt.toISOString(),
    ].map(escape).join(','));
    return [header.join(','), ...lines].join('\n');
  }

  async dispatchReportPdf(): Promise<Buffer> {
    const rows = await this.dispatchReport();
    const doc = new PDFDocument({ size: 'LETTER', margin: 36, layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    doc.fontSize(16).text('Dispatch Report', { align: 'left' });
    doc.fontSize(9).fillColor('#555').text(`Generated ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown(1);

    // Widths must total <= 720pt: landscape LETTER is 792pt wide minus
    // 36pt margins each side. Verified by rendering a real PDF - a
    // first draft at 760pt total pushed the last column past the
    // physical page edge.
    const columns = [
      { label: 'Serial #', width: 85 },
      { label: 'Customer', width: 105 },
      { label: 'Order', width: 80 },
      { label: 'Carrier', width: 85 },
      { label: 'Ship Date', width: 65 },
      { label: 'Truck #', width: 60 },
      { label: 'Tracking #', width: 85 },
      { label: 'Confirmed', width: 55 },
      { label: 'Logged By', width: 80 },
    ];
    const startX = doc.page.margins.left;
    let y = doc.y;
    doc.fontSize(9).fillColor('#000');
    const drawRow = (values: string[], bold = false) => {
      let x = startX;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      values.forEach((val, i) => {
        doc.text(val, x, y, { width: columns[i].width, ellipsis: true });
        x += columns[i].width;
      });
      y += 18;
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage({ size: 'LETTER', margin: 36, layout: 'landscape' });
        y = doc.page.margins.top;
      }
    };
    drawRow(columns.map((c) => c.label), true);
    doc.moveTo(startX, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#ccc').stroke();

    for (const r of rows) {
      drawRow([
        r.unit.serialNumber,
        r.unit.order?.project?.customer?.name ?? '-',
        r.unit.order?.orderNumber ?? '-',
        r.carrierName ?? '-',
        r.shipDate ? r.shipDate.toISOString().slice(0, 10) : '-',
        r.truckNumber ?? '-',
        r.trackingNumber ?? '-',
        r.destinationConfirmed ? 'Yes' : 'No',
        r.createdBy?.name ?? '-',
      ]);
    }

    doc.end();
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  // Dispatch report needs to be visible to Directors who don't have
  // full shipment-management rights, but also to Shipping staff who
  // have shipment:manage but not report:view. The global PermissionsGuard
  // only supports AND (every()) across a decorator's permission list, so
  // this OR check has to be manual - same pattern as
  // WorkflowStagesService.assertPermission().
  assertReportAccess(user: JwtPayload) {
    if (!user.permissions.includes('shipment:manage') && !user.permissions.includes('report:view')) {
      throw new ForbiddenException("You need either 'shipment:manage' or 'report:view' to access this report");
    }
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
    return this.service.create(unitId, dto, user);
  }

  @Patch('shipments/:id')
  @RequirePermissions('shipment:manage')
  update(@Param('id') id: string, @Body() dto: UpdateShipmentDto) {
    return this.service.update(id, dto);
  }

  // Deliberately no @RequirePermissions() here - access is gated manually
  // via assertReportAccess()'s OR logic (shipment:manage OR report:view),
  // which the global AND-only guard can't express.
  @Get('shipments/dispatch-report')
  dispatchReport(@CurrentUser() user: JwtPayload) {
    this.service.assertReportAccess(user);
    return this.service.dispatchReport();
  }

  @Get('shipments/dispatch-report/csv')
  async dispatchReportCsv(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    this.service.assertReportAccess(user);
    const csv = await this.service.dispatchReportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dispatch-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  }

  @Get('shipments/dispatch-report/pdf')
  async dispatchReportPdf(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    this.service.assertReportAccess(user);
    const pdf = await this.service.dispatchReportPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dispatch-report-${new Date().toISOString().slice(0, 10)}.pdf"`);
    return pdf;
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [ActivityLogModule, WorkflowStagesModule],
  controllers: [ShipmentController],
  providers: [ShipmentService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
