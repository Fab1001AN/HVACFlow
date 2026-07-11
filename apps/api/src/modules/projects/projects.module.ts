import { Injectable, NotFoundException } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PaginationQueryDto, paginate, paginationArgs } from '../../common/dto/pagination.dto';

class CreateProjectDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @MaxLength(50) code: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() targetEndDate?: string;
}

class UpdateProjectDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() targetEndDate?: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCustomer(customerId: string, page = 1, pageSize = 25) {
    const where = { customerId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          _count: { select: { orders: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(page, pageSize),
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        orders: {
          where: { deletedAt: null },
          include: {
            priorityLevel: true,
            _count: { select: { units: { where: { deletedAt: null } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(customerId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: { customerId, ...dto },
      include: { customer: true },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

@ApiTags('Projects')
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('customers/:customerId/projects')
  @RequirePermissions('project:view')
  findByCustomer(
    @Param('customerId') customerId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.service.findByCustomer(customerId, pagination.page, pagination.pageSize);
  }

  @Get('projects/:id')
  @RequirePermissions('project:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post('customers/:customerId/projects')
  @RequirePermissions('project:manage')
  create(@Param('customerId') customerId: string, @Body() dto: CreateProjectDto) {
    return this.service.create(customerId, dto);
  }

  @Patch('projects/:id')
  @RequirePermissions('project:manage')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.update(id, dto);
  }

  @Delete('projects/:id')
  @RequirePermissions('project:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
