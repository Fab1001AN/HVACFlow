import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PaginationQueryDto, paginate, paginationArgs } from '../../common/dto/pagination.dto';

class CreateCustomerDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @MaxLength(50) code: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() contactInfo?: Record<string, string>;
}

class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsObject() contactInfo?: Record<string, string>;
  @IsOptional() isActive?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string, page = 1, pageSize = 25) {
    const where = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: { _count: { select: { projects: { where: { deletedAt: null } } } } },
        orderBy: { name: 'asc' },
        ...paginationArgs(page, pageSize),
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id, deletedAt: null },
      include: {
        projects: {
          where: { deletedAt: null },
          include: { _count: { select: { orders: { where: { deletedAt: null } } } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Block deletion while the customer still has live projects. Without
    // this, soft-deleting a customer orphaned its projects/orders/units -
    // they stayed active on dashboards and the shop floor with a parent
    // that no longer exists. Same guard philosophy as order.remove()
    // (Draft-only): clean up top-down. A user who wants everything gone
    // cancels/deletes the projects first.
    const liveProjects = await this.prisma.project.count({ where: { customerId: id, deletedAt: null } });
    if (liveProjects > 0) {
      throw new ConflictException(
        `Cannot delete this customer - it still has ${liveProjects} active project(s). Delete or move them first.`,
      );
    }
    return this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermissions('customer:view')
  findAll(
    @Query('search') search?: string,
    @Query() pagination?: PaginationQueryDto,
  ) {
    return this.service.findAll(search, pagination?.page, pagination?.pageSize);
  }

  @Get(':id')
  @RequirePermissions('customer:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @RequirePermissions('customer:manage')
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Patch(':id')
  @RequirePermissions('customer:manage')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermissions('customer:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
