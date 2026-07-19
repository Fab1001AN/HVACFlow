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

import { PrismaClient, AppliesTo, RouteTargetType, PartSourceType } from '@prisma/client';
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
    { code: 'unit:plan', category: 'Units', description: 'Assign parts to a unit and release it to the Production Manager' },
    { code: 'vendor-part:manage', category: 'Units', description: 'Track vendor-supplied parts on a unit (received status, arrival dates)' },
    { code: 'rework:manage', category: 'Units', description: 'Create and update rework records for completed units' },
    { code: 'qc:manage', category: 'Units', description: 'Test units and send them back to any department with notes if something needs fixing' },
    { code: 'shipment:manage', category: 'Units', description: 'Log shipment/carrier details for a unit' },
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
    { code: 'director:view', category: 'Dashboard', description: 'View director-level summary dashboards' },
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

  // Item 11 of the original punch list asked for separate Sales Director
  // and Manufacturing Director accounts. Both get read-level visibility
  // into the Director Dashboard; Sales Director is scoped toward the
  // customer/order/commercial side, Manufacturing Director toward
  // production/department load. NOTE: the Director Dashboard itself
  // currently shows one unified view - these two roles are wired up with
  // distinct permission sets so access can be properly gated, but whether
  // the dashboard *content* should actually differ between them (e.g. a
  // Sales Director probably doesn't need per-department task counts, a
  // Manufacturing Director probably doesn't need customer/order details)
  // is a product decision, not something to guess at silently. Flagged
  // for the user rather than inventing two different dashboard layouts.
  const salesDirectorRole = await prisma.role.upsert({
    where: { name: 'Sales Director' },
    update: {},
    create: { name: 'Sales Director', description: 'Commercial oversight: customers, orders, delivery timelines', isSystem: true },
  });

  const manufacturingDirectorRole = await prisma.role.upsert({
    where: { name: 'Manufacturing Director' },
    update: {},
    create: { name: 'Manufacturing Director', description: 'Production oversight: department load, blocked units, capacity', isSystem: true },
  });

  // Planner sits between Engineering's release and the Production
  // Manager's release-to-Fabrication step: owns assigning parts to a
  // unit before handing it off.
  const plannerRole = await prisma.role.upsert({
    where: { name: 'Planner' },
    update: {},
    create: { name: 'Planner', description: 'Assigns parts to engineering-released units before handing off to the Production Manager', isSystem: true },
  });

  // Purchasing tracks vendor-supplied parts (coils, motors, fans bought
  // from a supplier) against units. If the Purchasing department is
  // toggled off, Assembly takes over this responsibility directly.
  const purchasingRole = await prisma.role.upsert({
    where: { name: 'Purchasing' },
    update: {},
    create: { name: 'Purchasing', description: 'Tracks vendor-supplied parts and their arrival/receipt status against units', isSystem: true },
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
    'unit:view', 'unit:manage', 'part:view', 'part:manage', 'vendor-part:manage',
    'rework:manage', 'shipment:manage', 'qc:manage',
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

  // Sales Director permissions - commercial/customer-facing visibility
  const salesDirectorPerms = [
    'director:view', 'customer:view', 'project:view', 'order:view',
    'unit:view', 'part:view', 'report:view', 'dashboard:configure',
    'department:view',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: salesDirectorRole.id } });
  await prisma.rolePermission.createMany({
    data: salesDirectorPerms.map((code) => ({
      roleId: salesDirectorRole.id,
      permissionId: permissions[code],
    })),
  });

  // Manufacturing Director permissions - production/floor oversight
  const manufacturingDirectorPerms = [
    'director:view', 'unit:view', 'unit:manage', 'part:view',
    'task:view', 'task:view-all', 'report:view', 'dashboard:configure',
    'department:view', 'process:view', 'machine:view',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: manufacturingDirectorRole.id } });
  await prisma.rolePermission.createMany({
    data: manufacturingDirectorPerms.map((code) => ({
      roleId: manufacturingDirectorRole.id,
      permissionId: permissions[code],
    })),
  });

  // Planner permissions - needs to see engineering-released units and
  // build out their parts (which needs process/part-type visibility to
  // pick from), then release to the Production Manager.
  const plannerPerms = [
    'unit:view', 'unit:plan', 'part:view', 'part:manage', 'vendor-part:manage',
    'department:view', 'process:view', 'dashboard:configure',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: plannerRole.id } });
  await prisma.rolePermission.createMany({
    data: plannerPerms.map((code) => ({
      roleId: plannerRole.id,
      permissionId: permissions[code],
    })),
  });

  // Purchasing permissions
  const purchasingPerms = [
    'unit:view', 'vendor-part:manage', 'department:view', 'dashboard:configure',
  ];
  await prisma.rolePermission.deleteMany({ where: { roleId: purchasingRole.id } });
  await prisma.rolePermission.createMany({
    data: purchasingPerms.map((code) => ({
      roleId: purchasingRole.id,
      permissionId: permissions[code],
    })),
  });

  // ─── Configurable defaults: seed ONCE, then the customer owns them ──────────
  // Everything from here down to the Admin User section is default business
  // configuration (priority levels, departments, processes, unit/part types,
  // routes, checklists, workflow stages). On a fresh install we populate
  // sensible defaults; on every subsequent boot we leave it all untouched so
  // a customer's own edits, renames and deletions are never clobbered or
  // resurrected by a re-seed. (Each deployment is a separate company's own
  // instance, so "their configuration" is the whole point.) New defaults for
  // an already-live customer ship as migrations, not via re-seeding.
  // Permissions, roles, role-permissions and the admin user above/below this
  // block are always re-ensured every boot - losing those would lock the
  // customer out, so they are intentionally NOT gated.
  const existingDepartmentCount = await prisma.department.count();
  const isFreshInstance = existingDepartmentCount === 0;
  if (!isFreshInstance) {
    console.log('Existing configuration detected — skipping default business-data seed (customer-owned).');
  }

  if (isFreshInstance) {
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
    { name: 'Detailing', code: 'ENG', color: '#0ea5e9', sortOrder: 1 },
    { name: 'Fabrication', code: 'FAB', color: '#6366f1', sortOrder: 3 },
    { name: 'Purchasing', code: 'PURCH', color: '#f59e0b', sortOrder: 4 },
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

  // Vendor-supplied parts (bought from a supplier, not built in-house) -
  // no process routing, just tracked as received/pending with dates via
  // VendorPart. Dragged onto a unit from the Purchasing Dashboard (or
  // added directly by Assembly if Purchasing is toggled off).
  const vendorPartTypeData: { name: string; code: string; sourceType: PartSourceType }[] = [
    { name: 'HX Coil', code: 'HXCOIL', sourceType: PartSourceType.Vendor },
    { name: 'DX Coil', code: 'DXCOIL', sourceType: PartSourceType.Vendor },
    { name: 'Fan', code: 'VFAN', sourceType: PartSourceType.Vendor },
    { name: 'Motor', code: 'MOTOR', sourceType: PartSourceType.Vendor },
    { name: 'Heat Exchanger', code: 'HTEXCH', sourceType: PartSourceType.Vendor },
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
  for (const pt of vendorPartTypeData) {
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
  } // end if (isFreshInstance) — configurable defaults block

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

  if (isFreshInstance) {
  // ─── Workflow Stages (Step 3a: shadow mode) ────────────────────────────────
  // These 5 stages mirror the 5 EXISTING pipeline functions
  // (advanceEngineering/markPlanned/releaseToProduction/
  // startManufacturing/startAssembly) - each of those now ALSO stamps
  // currentWorkflowStageId to the matching stage here, purely as a
  // parallel record, alongside its real existing behavior which is
  // completely unchanged. Nothing user-facing reads from these yet.
  // Deliberately NOT seeding QC/Unit-Completed/Shipping stages here -
  // those are genuinely new concepts with no existing function to
  // mirror, so they can't be shadow-written the same way; they'll be
  // added properly once the real cutover happens.
  console.log('Seeding workflow stages (shadow mode)...');
  // Look up department IDs directly rather than relying on the departments
  // map (scoped to the priority/department seed block above) - keeps this
  // block self-contained and independently guardable.
  const deptRows = await prisma.department.findMany({ select: { id: true, code: true } });
  const deptByCode: Record<string, string> = {};
  for (const d of deptRows) deptByCode[d.code] = d.id;
  const workflowStageData = [
    { name: 'Detailing', sortOrder: 1, departmentId: deptByCode['ENG'], requiredPermission: 'unit:manage', actionLabel: 'Advance Detailing' },
    { name: 'Planning', sortOrder: 2, departmentId: null, requiredPermission: 'unit:plan', actionLabel: 'Release to Production Manager' },
    { name: 'Manager Release', sortOrder: 3, departmentId: null, requiredPermission: 'unit:manage', actionLabel: 'Release to Fabrication' },
    { name: 'Fabrication Started', sortOrder: 4, departmentId: deptByCode['FAB'], requiredPermission: 'task:start', actionLabel: 'Start Entire Unit' },
    { name: 'Assembly Started', sortOrder: 5, departmentId: deptByCode['ASSY'], requiredPermission: 'task:start', actionLabel: 'Start Building Unit', isManagerBoundary: true },
    // These three are genuinely new stages, not shadow-written from any
    // existing function - a unit only ever reaches them by being
    // advanced through the workflow engine directly, starting from
    // Assembly Started. "Unit Completed" carries the gatesOnPartsComplete
    // flag: advance() blocks entry here while any part is unfinished. The
    // flag (not the stage name) drives that rule now, so a deployment can
    // move the quality gate elsewhere.
    { name: 'Unit Completed', sortOrder: 6, departmentId: deptByCode['ASSY'], requiredPermission: 'task:start', actionLabel: 'Mark Unit Completed', allowsBackward: true, gatesOnPartsComplete: true },
    { name: 'Testing', sortOrder: 7, departmentId: deptByCode['QA'], requiredPermission: 'qc:manage', actionLabel: 'Unit Tested', allowsBackward: true },
    { name: 'Dispatch', sortOrder: 8, departmentId: deptByCode['LOG'], requiredPermission: 'shipment:manage', actionLabel: 'Dispatched' },
    // Genuine terminal stage. Dispatch used to be the last stage, which
    // meant a shipped unit had nowhere to advance into and sat on the
    // Dispatch "Ready to Ship" list forever. Same permission as Dispatch
    // since reaching this stage is an automatic consequence of logging a
    // shipment (ShipmentService.create()), not a separate manual action -
    // whoever can log the shipment can trigger the advance.
    { name: 'Shipped', sortOrder: 9, departmentId: null, requiredPermission: 'shipment:manage', actionLabel: 'Mark Shipped', allowsBackward: false, isTerminal: true },
  ];
  for (const stage of workflowStageData) {
    await prisma.workflowStage.upsert({
      where: { name: stage.name },
      update: { sortOrder: stage.sortOrder, departmentId: stage.departmentId, requiredPermission: stage.requiredPermission, actionLabel: stage.actionLabel, isTerminal: (stage as any).isTerminal ?? false, gatesOnPartsComplete: (stage as any).gatesOnPartsComplete ?? false, isManagerBoundary: (stage as any).isManagerBoundary ?? false },
      create: stage,
    });
  }
  } // end if (isFreshInstance) — workflow stages

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

