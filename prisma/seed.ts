import 'dotenv/config';
/**
 * HVACFlow Database Seed
 *
 * Seeds all configurable data — roles, permissions, priority levels,
 * departments, process definitions, unit types, part types, compositions,
 * and process routes.
 *
 * All of this data is fully editable through the application UI after seeding.
 * No values here are hardcoded in application logic.
 */

import { PrismaClient, AppliesTo, RouteTargetType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting HVACFlow seed...\n');

  // ─── Permissions ───────────────────────────────────────────────────────────
  console.log('Creating permissions...');

  const permissionData = [
    // Tasks
    { code: 'task:view', category: 'Tasks', description: 'View tasks in assigned departments' },
    { code: 'task:view-all', category: 'Tasks', description: 'View tasks across all departments' },
    { code: 'task:start', category: 'Tasks', description: 'Start a ready task' },
    { code: 'task:complete', category: 'Tasks', description: 'Complete an in-progress task' },
    { code: 'task:verify', category: 'Tasks', description: 'Verify a task pending verification' },
    { code: 'task:hold', category: 'Tasks', description: 'Place a task on hold or resume it' },
    { code: 'task:reject', category: 'Tasks', description: 'Reject a task' },
    { code: 'task:reassign', category: 'Tasks', description: 'Reassign a task to another user' },
    // Hierarchy
    { code: 'customer:view', category: 'Customers', description: 'View customers' },
    { code: 'customer:manage', category: 'Customers', description: 'Create and edit customers' },
    { code: 'project:view', category: 'Projects', description: 'View projects' },
    { code: 'project:manage', category: 'Projects', description: 'Create and edit projects' },
    { code: 'order:view', category: 'Orders', description: 'View orders' },
    { code: 'order:manage', category: 'Orders', description: 'Create and edit orders' },
    { code: 'unit:view', category: 'Units', description: 'View units' },
    { code: 'unit:manage', category: 'Units', description: 'Create and edit units' },
    { code: 'part:view', category: 'Parts', description: 'View parts' },
    { code: 'part:manage', category: 'Parts', description: 'Create and edit parts' },
    // Configuration
    { code: 'config:manage', category: 'Configuration', description: 'Manage all system configuration' },
    // Users & Roles
    { code: 'user:view', category: 'Users', description: 'View users' },
    { code: 'user:manage', category: 'Users', description: 'Create and edit users' },
    { code: 'role:view', category: 'Roles', description: 'View roles and permissions' },
    { code: 'role:manage', category: 'Roles', description: 'Create and edit roles' },
    // Reporting
    { code: 'report:view', category: 'Reporting', description: 'View audit trail and reports' },
    // Dashboard
    { code: 'dashboard:configure', category: 'Dashboard', description: 'Configure role-level dashboard defaults' },
    // Configuration views (read-only config access for non-admins)
    { code: 'department:view', category: 'Configuration', description: 'View departments' },
    { code: 'process:view', category: 'Configuration', description: 'View process definitions and routes' },
    { code: 'machine:view', category: 'Configuration', description: 'View machines' },
  ];

  const permissions: Record<string, string> = {};
  for (const perm of permissionData) {
    const created = await prisma.permission.upsert({
      where: { code: perm.code },
      update: perm,
      create: perm,
    });
    permissions[perm.code] = created.id;
  }

  // ─── Roles ─────────────────────────────────────────────────────────────────
  console.log('Creating roles...');

  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin', description: 'Full system access', isSystem: true },
  });

  const supervisorRole = await prisma.role.upsert({
    where: { name: 'Supervisor' },
    update: {},
    create: { name: 'Supervisor', description: 'Oversee production across departments', isSystem: true },
  });

  const operatorRole = await prisma.role.upsert({
    where: { name: 'Operator' },
    update: {},
    create: { name: 'Operator', description: 'Shop floor task execution', isSystem: true },
  });

  // Admin gets all permissions
  const allPermIds = Object.values(permissions);
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermIds.map((permissionId) => ({ roleId: adminRole.id, permissionId })),
  });

  // Supervisor permissions
  const supervisorPerms = [
    'task:view', 'task:view-all', 'task:start', 'task:complete', 'task:verify',
    'task:hold', 'task:reject', 'task:reassign',
    'customer:view', 'project:view', 'order:view', 'order:manage',
    'unit:view', 'unit:manage', 'part:view', 'part:manage',
    'user:view', 'role:view', 'report:view', 'dashboard:configure',
    'department:view', 'process:view', 'machine:view',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: supervisorRole.id } });
  await prisma.rolePermission.createMany({
    data: supervisorPerms.map((code) => ({
      roleId: supervisorRole.id,
      permissionId: permissions[code],
    })),
  });

  // Operator permissions
  const operatorPerms = [
    'task:view', 'task:start', 'task:complete', 'task:hold',
    'customer:view', 'project:view', 'order:view',
    'unit:view', 'part:view',
    'department:view', 'process:view', 'machine:view',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: operatorRole.id } });
  await prisma.rolePermission.createMany({
    data: operatorPerms.map((code) => ({
      roleId: operatorRole.id,
      permissionId: permissions[code],
    })),
  });

  // ─── Priority Levels ────────────────────────────────────────────────────────
  console.log('Creating priority levels...');

  const priorityData = [
    { name: 'Low', color: '#6b7280', sortOrder: 1, isDefault: false },
    { name: 'Normal', color: '#3b82f6', sortOrder: 2, isDefault: true },
    { name: 'High', color: '#f59e0b', sortOrder: 3, isDefault: false },
    { name: 'Urgent', color: '#ef4444', sortOrder: 4, isDefault: false },
  ];

  const priorities: Record<string, string> = {};
  for (const p of priorityData) {
    const created = await prisma.priorityLevel.upsert({
      where: { name: p.name },
      update: p,
      create: p,
    });
    priorities[p.name] = created.id;
  }

  // ─── Departments ────────────────────────────────────────────────────────────
  console.log('Creating departments...');

  const departmentData = [
    { name: 'Engineering', code: 'ENG', color: '#0ea5e9', sortOrder: 1 },
    { name: 'Fabrication', code: 'FAB', color: '#6366f1', sortOrder: 3 },
    { name: 'Assembly', code: 'ASSY', color: '#10b981', sortOrder: 5 },
    { name: 'Electrical', code: 'ELEC', color: '#8b5cf6', sortOrder: 6 },
    { name: 'Piping', code: 'PIPE', color: '#06b6d4', sortOrder: 7 },
    { name: 'Painting', code: 'PAINT', color: '#ec4899', sortOrder: 8 },
    { name: 'Miscellaneous Finishing', code: 'MISC', color: '#a855f7', sortOrder: 9 },
    { name: 'Testing & Quality', code: 'QA', color: '#14b8a6', sortOrder: 10 },
    { name: 'Dispatch', code: 'LOG', color: '#64748b', sortOrder: 11 },
  ];

  const departments: Record<string, string> = {};
  for (const d of departmentData) {
    const created = await prisma.department.upsert({
      where: { code: d.code },
      update: d,
      create: d,
    });
    departments[d.code] = created.id;
  }

  // ─── Process Definitions ────────────────────────────────────────────────────
  console.log('Creating process definitions...');

  const processData = [
    // Fabrication (Part-level)
    { name: 'Cutting', code: 'CUT', departmentId: departments['FAB'], appliesTo: AppliesTo.PART, requiresVerification: false, requiresChecklist: false, weight: 1.0, defaultEstimatedMinutes: 30 },
    { name: 'Bending', code: 'BEND', departmentId: departments['FAB'], appliesTo: AppliesTo.PART, requiresVerification: false, requiresChecklist: false, weight: 1.0, defaultEstimatedMinutes: 45 },
    { name: 'Punching', code: 'PUNCH', departmentId: departments['FAB'], appliesTo: AppliesTo.PART, requiresVerification: false, requiresChecklist: false, weight: 0.5, defaultEstimatedMinutes: 20 },
    // Foaming (Part-level)
    { name: 'Foaming', code: 'FOAM', departmentId: departments['FAB'], appliesTo: AppliesTo.PART, requiresVerification: false, requiresChecklist: true, weight: 1.5, defaultEstimatedMinutes: 60 },
    // Assembly (Part-level)
    { name: 'Sub-Assembly', code: 'SUBASSY', departmentId: departments['ASSY'], appliesTo: AppliesTo.PART, requiresVerification: false, requiresChecklist: false, isOptional: true, weight: 1.0, defaultEstimatedMinutes: 45 },
    { name: 'Assembly', code: 'ASSY', departmentId: departments['ASSY'], appliesTo: AppliesTo.PART, requiresVerification: true, requiresChecklist: true, weight: 2.0, defaultEstimatedMinutes: 90 },
    // Electrical (Part-level)
    { name: 'Electrical Wiring', code: 'ELEC', departmentId: departments['ELEC'], appliesTo: AppliesTo.PART, requiresVerification: true, requiresChecklist: true, weight: 2.0, defaultEstimatedMinutes: 120 },
    // Painting (Part-level)
    { name: 'Painting', code: 'PAINT', departmentId: departments['PAINT'], appliesTo: AppliesTo.PART, requiresVerification: false, requiresChecklist: false, weight: 1.0, defaultEstimatedMinutes: 60 },
    // QA (Unit-level)
    { name: 'Testing', code: 'TEST', departmentId: departments['QA'], appliesTo: AppliesTo.UNIT, requiresVerification: true, requiresChecklist: true, weight: 3.0, defaultEstimatedMinutes: 180 },
    // Logistics (Unit-level)
    { name: 'Dispatch', code: 'DISP', departmentId: departments['LOG'], appliesTo: AppliesTo.UNIT, requiresVerification: true, requiresChecklist: false, weight: 1.0, defaultEstimatedMinutes: 30 },
  ];

  const processes: Record<string, string> = {};
  for (const p of processData) {
    const created = await prisma.processDefinition.upsert({
      where: { code: p.code },
      update: p,
      create: { ...p, defaultPriorityLevelId: priorities['Normal'] },
    });
    processes[p.code] = created.id;
  }

  // ─── Unit Types ─────────────────────────────────────────────────────────────
  console.log('Creating unit types...');

  const unitTypeData = [
    { name: 'Rooftop Unit', code: 'RTU' },
    { name: 'Make-Up Air Unit', code: 'MUA' },
    { name: 'Air Handling Unit', code: 'AHU' },
    { name: 'Energy Recovery Ventilator', code: 'ERV' },
    { name: 'Split System', code: 'SS' },
    { name: 'Fan Coil Unit', code: 'FCU' },
    { name: 'Custom Unit', code: 'CUSTOM' },
  ];

  const unitTypes: Record<string, string> = {};
  for (const ut of unitTypeData) {
    const created = await prisma.unitType.upsert({
      where: { code: ut.code },
      update: ut,
      create: ut,
    });
    unitTypes[ut.code] = created.id;
  }

  // ─── Part Types ─────────────────────────────────────────────────────────────
  console.log('Creating part types...');

  const partTypeData = [
    { name: 'Sheet Metal Panel', code: 'PNL' },
    { name: 'Coil Assembly', code: 'COIL' },
    { name: 'Frame', code: 'FRM' },
    { name: 'Electrical Panel', code: 'EPNL' },
    { name: 'Fan Assembly', code: 'FAN' },
    { name: 'Drain Pan', code: 'DRAIN' },
  ];

  const partTypes: Record<string, string> = {};
  for (const pt of partTypeData) {
    const created = await prisma.partType.upsert({
      where: { code: pt.code },
      update: pt,
      create: pt,
    });
    partTypes[pt.code] = created.id;
  }

  // ─── Unit Type Compositions ─────────────────────────────────────────────────
  console.log('Creating unit type compositions...');

  // RTU composition
  const rtuComposition = [
    { partTypeId: partTypes['PNL'], defaultQuantity: 6, isOptional: false, sortOrder: 1 },
    { partTypeId: partTypes['COIL'], defaultQuantity: 1, isOptional: false, sortOrder: 2 },
    { partTypeId: partTypes['FRM'], defaultQuantity: 1, isOptional: false, sortOrder: 3 },
    { partTypeId: partTypes['EPNL'], defaultQuantity: 1, isOptional: false, sortOrder: 4 },
    { partTypeId: partTypes['FAN'], defaultQuantity: 2, isOptional: false, sortOrder: 5 },
    { partTypeId: partTypes['DRAIN'], defaultQuantity: 1, isOptional: true, sortOrder: 6 },
  ];

  for (const comp of rtuComposition) {
    await prisma.unitTypeComposition.upsert({
      where: {
        unitTypeId_partTypeId: {
          unitTypeId: unitTypes['RTU'],
          partTypeId: comp.partTypeId,
        },
      },
      update: comp,
      create: { unitTypeId: unitTypes['RTU'], ...comp },
    });
  }

  // AHU composition
  const ahuComposition = [
    { partTypeId: partTypes['PNL'], defaultQuantity: 4, isOptional: false, sortOrder: 1 },
    { partTypeId: partTypes['COIL'], defaultQuantity: 2, isOptional: false, sortOrder: 2 },
    { partTypeId: partTypes['FRM'], defaultQuantity: 1, isOptional: false, sortOrder: 3 },
    { partTypeId: partTypes['FAN'], defaultQuantity: 1, isOptional: false, sortOrder: 4 },
    { partTypeId: partTypes['DRAIN'], defaultQuantity: 1, isOptional: false, sortOrder: 5 },
  ];

  for (const comp of ahuComposition) {
    await prisma.unitTypeComposition.upsert({
      where: {
        unitTypeId_partTypeId: {
          unitTypeId: unitTypes['AHU'],
          partTypeId: comp.partTypeId,
        },
      },
      update: comp,
      create: { unitTypeId: unitTypes['AHU'], ...comp },
    });
  }

  // ─── Process Routes ─────────────────────────────────────────────────────────
  console.log('Creating process routes...');

  // Panel route: Cutting → Bending → Punching → Painting
  const panelRoute = [
    { processDefinitionId: processes['CUT'], sequenceOrder: 1, isOptional: false },
    { processDefinitionId: processes['BEND'], sequenceOrder: 2, isOptional: false },
    { processDefinitionId: processes['PUNCH'], sequenceOrder: 3, isOptional: true },
    { processDefinitionId: processes['PAINT'], sequenceOrder: 4, isOptional: false },
  ];

  for (const step of panelRoute) {
    await prisma.processRoute.create({
      data: {
        targetType: RouteTargetType.PART_TYPE,
        partTypeId: partTypes['PNL'],
        ...step,
      },
    }).catch(() => {}); // Skip if already exists (idempotent)
  }

  // Coil route: Sub-Assembly → Foaming → Assembly
  const coilRoute = [
    { processDefinitionId: processes['SUBASSY'], sequenceOrder: 1, isOptional: false },
    { processDefinitionId: processes['FOAM'], sequenceOrder: 2, isOptional: false },
    { processDefinitionId: processes['ASSY'], sequenceOrder: 3, isOptional: false },
  ];

  for (const step of coilRoute) {
    await prisma.processRoute.create({
      data: {
        targetType: RouteTargetType.PART_TYPE,
        partTypeId: partTypes['COIL'],
        ...step,
      },
    }).catch(() => {});
  }

  // Electrical Panel route: Electrical Wiring
  await prisma.processRoute.create({
    data: {
      targetType: RouteTargetType.PART_TYPE,
      partTypeId: partTypes['EPNL'],
      processDefinitionId: processes['ELEC'],
      sequenceOrder: 1,
      isOptional: false,
    },
  }).catch(() => {});

  // Frame route: Cutting → Bending
  const frameRoute = [
    { processDefinitionId: processes['CUT'], sequenceOrder: 1, isOptional: false },
    { processDefinitionId: processes['BEND'], sequenceOrder: 2, isOptional: false },
  ];
  for (const step of frameRoute) {
    await prisma.processRoute.create({
      data: {
        targetType: RouteTargetType.PART_TYPE,
        partTypeId: partTypes['FRM'],
        ...step,
      },
    }).catch(() => {});
  }

  // Fan Assembly route: Sub-Assembly → Assembly
  const fanRoute = [
    { processDefinitionId: processes['SUBASSY'], sequenceOrder: 1, isOptional: false },
    { processDefinitionId: processes['ASSY'], sequenceOrder: 2, isOptional: false },
  ];
  for (const step of fanRoute) {
    await prisma.processRoute.create({
      data: {
        targetType: RouteTargetType.PART_TYPE,
        partTypeId: partTypes['FAN'],
        ...step,
      },
    }).catch(() => {});
  }

  // RTU unit-level route: Testing → Dispatch
  const rtuUnitRoute = [
    { processDefinitionId: processes['TEST'], sequenceOrder: 1, isOptional: false },
    { processDefinitionId: processes['DISP'], sequenceOrder: 2, isOptional: false },
  ];
  for (const step of rtuUnitRoute) {
    await prisma.processRoute.create({
      data: {
        targetType: RouteTargetType.UNIT_TYPE,
        unitTypeId: unitTypes['RTU'],
        ...step,
      },
    }).catch(() => {});
  }

  // AHU unit-level route: Testing → Dispatch
  for (const step of rtuUnitRoute) {
    await prisma.processRoute.create({
      data: {
        targetType: RouteTargetType.UNIT_TYPE,
        unitTypeId: unitTypes['AHU'],
        ...step,
      },
    }).catch(() => {});
  }

  // ─── Checklist Templates ────────────────────────────────────────────────────
  console.log('Creating checklist templates...');

  // Foaming checklist
  const foamingChecklist = await prisma.checklistTemplate.create({
    data: {
      processDefinitionId: processes['FOAM'],
      name: 'Foaming Inspection',
      items: {
        create: [
          { label: 'Foam density within specification (min 38 kg/m³)', sortOrder: 1, isRequired: true },
          { label: 'No voids or air pockets detected', sortOrder: 2, isRequired: true },
          { label: 'Foam flush with panel edges', sortOrder: 3, isRequired: true },
          { label: 'Surface cure complete (no soft spots)', sortOrder: 4, isRequired: true },
          { label: 'Photo documentation attached', sortOrder: 5, isRequired: false },
        ],
      },
    },
  }).catch(() => null);

  // Assembly checklist
  await prisma.checklistTemplate.create({
    data: {
      processDefinitionId: processes['ASSY'],
      name: 'Assembly Quality Check',
      items: {
        create: [
          { label: 'All fasteners torqued to specification', sortOrder: 1, isRequired: true },
          { label: 'Alignment within 1mm tolerance', sortOrder: 2, isRequired: true },
          { label: 'Gaskets seated correctly', sortOrder: 3, isRequired: true },
          { label: 'No sharp edges or burrs', sortOrder: 4, isRequired: true },
          { label: 'Part matches drawing revision', sortOrder: 5, isRequired: true },
        ],
      },
    },
  }).catch(() => null);

  // Electrical checklist
  await prisma.checklistTemplate.create({
    data: {
      processDefinitionId: processes['ELEC'],
      name: 'Electrical Wiring Verification',
      items: {
        create: [
          { label: 'Wiring matches schematic drawing', sortOrder: 1, isRequired: true },
          { label: 'All terminals torqued per spec', sortOrder: 2, isRequired: true },
          { label: 'Wire colours match standard', sortOrder: 3, isRequired: true },
          { label: 'Cable routing clear of sharp edges', sortOrder: 4, isRequired: true },
          { label: 'Continuity test passed', sortOrder: 5, isRequired: true },
          { label: 'Insulation resistance > 1MΩ', sortOrder: 6, isRequired: true },
        ],
      },
    },
  }).catch(() => null);

  // Testing checklist
  await prisma.checklistTemplate.create({
    data: {
      processDefinitionId: processes['TEST'],
      name: 'Final Unit Testing Protocol',
      items: {
        create: [
          { label: 'Power-on test: no fault codes', sortOrder: 1, isRequired: true },
          { label: 'Refrigerant pressure within spec', sortOrder: 2, isRequired: true },
          { label: 'Airflow measured and within ±10%', sortOrder: 3, isRequired: true },
          { label: 'Noise level within tolerance', sortOrder: 4, isRequired: true },
          { label: 'All control functions verified', sortOrder: 5, isRequired: true },
          { label: 'Safety cutout test passed', sortOrder: 6, isRequired: true },
          { label: 'Serial number plate affixed', sortOrder: 7, isRequired: true },
          { label: 'Test data sheet signed', sortOrder: 8, isRequired: true },
        ],
      },
    },
  }).catch(() => null);

  // ─── Admin User ─────────────────────────────────────────────────────────────
  console.log('Creating default admin user...');

  const adminPasswordHash = await bcrypt.hash('Admin@HVACFlow1', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@hvacflow.com' },
    update: {},
    create: {
      email: 'admin@hvacflow.com',
      name: 'System Administrator',
      passwordHash: adminPasswordHash,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  // ─── Role Dashboard Configs ─────────────────────────────────────────────────
  console.log('Creating default dashboard configurations...');

  await prisma.roleDashboardConfig.upsert({
    where: { roleId: adminRole.id },
    update: {},
    create: {
      roleId: adminRole.id,
      config: {
        defaultView: 'kanban',
        defaultDepartmentFilter: 'all',
        showMyTasksToggle: true,
        allowCrossDepartmentView: true,
      },
    },
  });

  await prisma.roleDashboardConfig.upsert({
    where: { roleId: supervisorRole.id },
    update: {},
    create: {
      roleId: supervisorRole.id,
      config: {
        defaultView: 'kanban',
        defaultDepartmentFilter: 'all',
        showMyTasksToggle: true,
        allowCrossDepartmentView: true,
      },
    },
  });

  await prisma.roleDashboardConfig.upsert({
    where: { roleId: operatorRole.id },
    update: {},
    create: {
      roleId: operatorRole.id,
      config: {
        defaultView: 'kanban',
        defaultDepartmentFilter: 'mine',
        showMyTasksToggle: true,
        allowCrossDepartmentView: false,
      },
    },
  });

  console.log('\n✅ Seed complete!');
  console.log('   Admin login: admin@hvacflow.com / Admin@HVACFlow1');
  console.log('   Change the admin password immediately in production.\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

