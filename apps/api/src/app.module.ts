import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, validateConfig } from './config/app.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { PriorityLevelsModule } from './modules/priority-levels/priority-levels.module';
import { ProcessDefinitionsModule } from './modules/process-definitions/process-definitions.module';
import { ProcessRoutesModule } from './modules/process-routes/process-routes.module';
import { UnitTypesModule } from './modules/unit-types/unit-types.module';
import { PartTypesModule } from './modules/part-types/part-types.module';
import { UnitCompositionModule } from './modules/unit-composition/unit-composition.module';
import { MachinesModule } from './modules/machines/machines.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UnitsModule } from './modules/units/units.module';
import { VendorPartsModule } from './modules/vendor-parts/vendor-parts.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { OrganizationSettingsModule } from './modules/organization-settings/organization-settings.module';
import { WorkflowStagesModule } from './modules/workflow-stages/workflow-stages.module';
import { PartsModule } from './modules/parts/parts.module';
import { ProductionTasksModule } from './modules/production-tasks/production-tasks.module';
import { WorkflowProgressModule } from './modules/workflow-progress/workflow-progress.module';
import { MissionControlModule } from './modules/mission-control/mission-control.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    // ─── Config (must be first) ─────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateConfig,
      expandVariables: true,
    }),

    // ─── Infrastructure ─────────────────────────────────────────────────────
    PrismaModule,

    // ─── Identity & Access ──────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,

    // ─── Configuration Domain ───────────────────────────────────────────────
    DepartmentsModule,
    PriorityLevelsModule,
    ProcessDefinitionsModule,
    ProcessRoutesModule,
    UnitTypesModule,
    PartTypesModule,
    UnitCompositionModule,
    MachinesModule,
    ChecklistsModule,

    // ─── Manufacturing Hierarchy ────────────────────────────────────────────
    CustomersModule,
    ProjectsModule,
    OrdersModule,
    UnitsModule,
    VendorPartsModule,
    ActivityLogModule,
    OrganizationSettingsModule,
    WorkflowStagesModule,
    PartsModule,

    // ─── Production Task Engine ─────────────────────────────────────────────
    WorkflowProgressModule,
    ProductionTasksModule,
    MissionControlModule,

    // ─── Realtime & Dashboard ────────────────────────────────────────────────
    RealtimeModule,
    DashboardModule,
    ReportsModule,
  ],
})
export class AppModule {}
