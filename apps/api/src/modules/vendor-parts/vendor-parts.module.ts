import {
  Injectable, NotFoundException, BadRequestException,
  Controller, Get, Post, Patch, Delete,
  Body, Param, Module, Res, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsUUID, IsDateString, IsArray, MaxLength } from 'class-validator';
import { ActivityAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@hvacflow/shared-types';
import { ActivityLogModule, ActivityLogService } from '../activity-log/activity-log.module';

// Proof documents are stored in the database, so keep them modest. A photo of
// a delivery note is well under this; the cap stops someone attaching a 200MB
// video and bloating every backup.
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_DOCUMENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
];

// Minimal shape of an uploaded file. Declared here rather than importing
// Express.Multer.File so this doesn't require adding @types/multer - keeping
// the patch free of a dependency install.
interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateVendorPartDto {
  @IsUUID() partTypeId: string;
  @IsBoolean() isReceived: boolean;
  @IsOptional() @IsDateString() expectedArrivalDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsString() @MaxLength(100) poReference?: string;
}

class UpdateVendorPartDto {
  @IsOptional() @IsBoolean() isReceived?: boolean;
  @IsOptional() @IsDateString() expectedArrivalDate?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsString() @MaxLength(100) poReference?: string;
}

// One delivery note usually covers several parts arriving together, so the
// common case is "these five parts are all now expected on the 15th".
class BulkArrivalDto {
  @IsArray() @IsUUID(undefined, { each: true }) vendorPartIds: string[];
  @IsOptional() @IsDateString() expectedArrivalDate?: string;
}

class UploadDocumentMetaDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VendorPartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

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

    const vendorPart = await this.prisma.vendorPart.create({
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
    await this.activityLog.log({
      unitId,
      userId,
      action: dto.isReceived ? ActivityAction.VendorPartReceived : ActivityAction.VendorPartLogged,
      description: dto.isReceived ? `${vendorPart.partType.name} received` : `${vendorPart.partType.name} logged as needed from vendor`,
    });
    return vendorPart;
  }

  async update(id: string, dto: UpdateVendorPartDto, userId?: string) {
    const existing = await this.prisma.vendorPart.findUnique({ where: { id }, include: { partType: true } });
    if (!existing) throw new NotFoundException('Vendor part not found');

    const isReceived = dto.isReceived ?? existing.isReceived;
    const updated = await this.prisma.vendorPart.update({
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
    // Only log the meaningful transition (newly marked received), not
    // every date-only edit - that would flood the timeline with noise
    // every time a date gets adjusted for a delay.
    if (dto.isReceived === true && !existing.isReceived) {
      await this.activityLog.log({
        unitId: existing.unitId,
        userId,
        action: ActivityAction.VendorPartReceived,
        description: `${existing.partType.name} received`,
      });
    }
    return updated;
  }

  async remove(id: string) {
    const existing = await this.prisma.vendorPart.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vendor part not found');
    return this.prisma.vendorPart.delete({ where: { id } });
  }

  // Set one expected arrival date across several parts at once - the usual
  // case when a single delivery note covers multiple items. Done in a
  // transaction so the whole set moves together or not at all.
  async bulkSetArrival(dto: BulkArrivalDto, userId: string) {
    if (dto.vendorPartIds.length === 0) {
      throw new BadRequestException('Select at least one vendor part');
    }

    const parts = await this.prisma.vendorPart.findMany({
      where: { id: { in: dto.vendorPartIds } },
      include: { partType: true },
    });
    if (parts.length !== dto.vendorPartIds.length) {
      throw new NotFoundException('One or more vendor parts no longer exist');
    }

    const date = dto.expectedArrivalDate ? new Date(dto.expectedArrivalDate) : null;

    await this.prisma.$transaction(
      dto.vendorPartIds.map((id) =>
        this.prisma.vendorPart.update({
          where: { id },
          data: { expectedArrivalDate: date },
        }),
      ),
    );

    // One timeline entry per affected unit, rather than per part, so a
    // five-item delivery note doesn't spam the unit's history.
    const byUnit = new Map<string, string[]>();
    for (const p of parts) {
      const list = byUnit.get(p.unitId) ?? [];
      list.push(p.partType.name);
      byUnit.set(p.unitId, list);
    }
    for (const [unitId, names] of byUnit) {
      await this.activityLog.log({
        unitId,
        userId,
        action: ActivityAction.VendorPartLogged,
        description: date
          ? `Expected arrival set to ${date.toDateString()} for: ${names.join(', ')}`
          : `Expected arrival cleared for: ${names.join(', ')}`,
      });
    }

    return { updated: dto.vendorPartIds.length };
  }

  // Store a delivery note / order confirmation / screenshot as proof, linked
  // to one or more vendor parts. Bytes live in the database - see the note on
  // the VendorPartDocument model for why.
  async addDocument(
    vendorPartIds: string[],
    file: UploadedFileLike,
    note: string | undefined,
    user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');
    if (vendorPartIds.length === 0) {
      throw new BadRequestException('Attach the document to at least one vendor part');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException(
        `File is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
      );
    }
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only images (JPEG, PNG, WebP, HEIC) and PDF files can be attached.',
      );
    }

    const found = await this.prisma.vendorPart.count({ where: { id: { in: vendorPartIds } } });
    if (found !== vendorPartIds.length) {
      throw new NotFoundException('One or more vendor parts no longer exist');
    }

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vendorPartDocument.create({
        data: {
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          data: file.buffer,
          note,
          uploadedById: user.sub,
          uploadedByName: user.name,
        },
      });
      await tx.vendorPartDocumentLink.createMany({
        data: vendorPartIds.map((vendorPartId) => ({ vendorPartId, documentId: created.id })),
      });
      return created;
    });

    // Return metadata only - never the bytes, which would bloat the response.
    return {
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      note: doc.note,
      uploadedByName: doc.uploadedByName,
      createdAt: doc.createdAt,
      linkedCount: vendorPartIds.length,
    };
  }

  async listDocuments(vendorPartId: string) {
    const links = await this.prisma.vendorPartDocumentLink.findMany({
      where: { vendorPartId },
      include: {
        document: {
          select: {
            id: true, fileName: true, mimeType: true, sizeBytes: true,
            note: true, uploadedByName: true, createdAt: true,
          },
        },
      },
      orderBy: { document: { createdAt: 'desc' } },
    });
    return links.map((l) => l.document);
  }

  // Returns the raw bytes for download/preview.
  async getDocumentFile(documentId: string) {
    const doc = await this.prisma.vendorPartDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async removeDocument(documentId: string) {
    const doc = await this.prisma.vendorPartDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    // Links cascade with the document.
    await this.prisma.vendorPartDocument.delete({ where: { id: documentId } });
    return { deleted: true };
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

  // Set one expected arrival date across several parts (one delivery note,
  // several items).
  @Patch('vendor-parts/bulk-arrival')
  @RequirePermissions('vendor-part:manage')
  bulkArrival(@Body() dto: BulkArrivalDto, @CurrentUser() user: JwtPayload) {
    return this.service.bulkSetArrival(dto, user.sub);
  }

  // Attach a delivery note / screenshot as proof. vendorPartIds is sent as a
  // comma-separated field alongside the file, since this is multipart form
  // data rather than JSON.
  @Post('vendor-parts/documents')
  @RequirePermissions('vendor-part:manage')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @UploadedFile() file: UploadedFileLike,
    @Body('vendorPartIds') vendorPartIds: string,
    @Body('note') note: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const ids = (vendorPartIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.service.addDocument(ids, file, note, user);
  }

  @Get('vendor-parts/:id/documents')
  @RequirePermissions('unit:view')
  listDocuments(@Param('id') id: string) {
    return this.service.listDocuments(id);
  }

  @Get('vendor-parts/documents/:documentId/file')
  @RequirePermissions('unit:view')
  async downloadDocument(@Param('documentId') documentId: string, @Res() res: Response) {
    const doc = await this.service.getDocumentFile(documentId);
    res.setHeader('Content-Type', doc.mimeType);
    // "inline" so images and PDFs preview in the browser rather than
    // force-downloading; the filename is still offered if the user saves it.
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/"/g, '')}"`);
    res.send(Buffer.from(doc.data));
  }

  @Delete('vendor-parts/documents/:documentId')
  @RequirePermissions('vendor-part:manage')
  removeDocument(@Param('documentId') documentId: string) {
    return this.service.removeDocument(documentId);
  }

  @Post('units/:unitId/vendor-parts')
  @RequirePermissions('vendor-part:manage')
  create(@Param('unitId') unitId: string, @Body() dto: CreateVendorPartDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(unitId, dto, user.sub);
  }

  @Patch('vendor-parts/:id')
  @RequirePermissions('vendor-part:manage')
  update(@Param('id') id: string, @Body() dto: UpdateVendorPartDto, @CurrentUser() user: JwtPayload) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete('vendor-parts/:id')
  @RequirePermissions('vendor-part:manage')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [ActivityLogModule],
  controllers: [VendorPartsController],
  providers: [VendorPartsService],
  exports: [VendorPartsService],
})
export class VendorPartsModule {}
