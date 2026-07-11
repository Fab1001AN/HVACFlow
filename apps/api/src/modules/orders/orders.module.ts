import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Module } from '@nestjs/common';
import { IsString, IsOptional, IsDateString, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderStatus } from '@hvacflow/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PaginationQueryDto, paginate, paginationArgs } from '../../common/dto/pagination.dto';

class CreateOrderDto {
  @ApiProperty() @IsString() orderNumber: string;
  @ApiProperty() @IsUUID() priorityLevelId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requestedDeliveryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

class UpdateOrderDto {
  @IsOptional() @IsString() orderNumber?: string;
  @IsOptional() @IsUUID() priorityLevelId?: string;
  @IsOptional() @IsDateString() requestedDeliveryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Draft]: [OrderStatus.Confirmed, OrderStatus.Cancelled],
  [OrderStatus.Confirmed]: [OrderStatus.InProduction, OrderStatus.Cancelled],
  [OrderStatus.InProduction]: [OrderStatus.Completed, OrderStatus.Cancelled],
  [OrderStatus.Completed]: [],
  [OrderStatus.Cancelled]: [],
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectId: string, status?: OrderStatus, page = 1, pageSize = 25) {
    const where = {
      projectId,
      deletedAt: null,
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          priorityLevel: true,
          _count: { select: { units: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
        ...paginationArgs(page, pageSize),
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id, deletedAt: null },
      include: {
        project: { include: { customer: true } },
        priorityLevel: true,
        units: {
          where: { deletedAt: null },
          include: { unitType: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(projectId: string, dto: CreateOrderDto) {
    return this.prisma.order.create({
      data: { projectId, ...dto },
      include: { priorityLevel: true },
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    await this.findOne(id);
    return this.prisma.order.update({ where: { id }, data: dto, include: { priorityLevel: true } });
  }

  async transition(id: string, newStatus: OrderStatus) {
    const order = await this.findOne(id);
    const allowed = ORDER_TRANSITIONS[order.status];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition order from ${order.status} to ${newStatus}`,
      );
    }

    if (newStatus === OrderStatus.Cancelled) {
      const inProgressCount = await this.prisma.productionTask.count({
        where: {
          unit: { orderId: id },
          status: 'InProgress',
        },
      });
      if (inProgressCount > 0) {
        throw new ConflictException(
          'Cannot cancel order with tasks currently in progress',
        );
      }
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: newStatus },
      include: { priorityLevel: true },
    });
  }

  async remove(id: string) {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.Draft) {
      throw new BadRequestException('Only draft orders can be deleted');
    }
    return this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get('projects/:projectId/orders')
  @RequirePermissions('order:view')
  findByProject(
    @Param('projectId') projectId: string,
    @Query('status') status?: OrderStatus,
    @Query() pagination?: PaginationQueryDto,
  ) {
    return this.service.findByProject(projectId, status, pagination?.page, pagination?.pageSize);
  }

  @Get('orders/:id')
  @RequirePermissions('order:view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post('projects/:projectId/orders')
  @RequirePermissions('order:manage')
  create(@Param('projectId') projectId: string, @Body() dto: CreateOrderDto) {
    return this.service.create(projectId, dto);
  }

  @Patch('orders/:id')
  @RequirePermissions('order:manage')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.service.update(id, dto);
  }

  @Post('orders/:id/confirm')
  @RequirePermissions('order:manage')
  confirm(@Param('id') id: string) {
    return this.service.transition(id, OrderStatus.Confirmed);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('order:manage')
  cancel(@Param('id') id: string) {
    return this.service.transition(id, OrderStatus.Cancelled);
  }

  @Delete('orders/:id')
  @RequirePermissions('order:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
