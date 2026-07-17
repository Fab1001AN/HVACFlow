import {
  Injectable,
  Controller, Get, Patch,
  Body, Module,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';

const SETTINGS_ID = 'default';

class UpdateOrganizationSettingsDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
}

@Injectable()
export class OrganizationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert on read too, not just write - guarantees the singleton row
  // always exists even against a database that hasn't run the latest
  // seed yet, rather than the login page (which calls this
  // unauthenticated, before anything else has a chance to fix it up)
  // ever hitting a 404 for something this fundamental.
  async get() {
    return this.prisma.organizationSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  async update(dto: UpdateOrganizationSettingsDto) {
    return this.prisma.organizationSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { name: dto.name },
      create: { id: SETTINGS_ID, name: dto.name },
    });
  }
}

@ApiTags('Organization Settings')
@Controller('organization-settings')
export class OrganizationSettingsController {
  constructor(private readonly service: OrganizationSettingsService) {}

  // Public: the login page (and the sidebar logo before a user is
  // authenticated on first load) both need this before any JWT exists.
  // It only ever reveals the chosen display name - nothing sensitive.
  @Get()
  @Public()
  get() {
    return this.service.get();
  }

  @Patch()
  @RequirePermissions('config:manage')
  update(@Body() dto: UpdateOrganizationSettingsDto) {
    return this.service.update(dto);
  }
}

@Module({
  controllers: [OrganizationSettingsController],
  providers: [OrganizationSettingsService],
  exports: [OrganizationSettingsService],
})
export class OrganizationSettingsModule {}
