import {
  AppliesTo,
  OrderStatus,
  PartStatus,
  RouteTargetType,
  TaskStatus,
  UnitStatus,
} from './enums';

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;        // userId
  email: string;
  name: string;
  permissions: string[];   // flat merged permission code list
  departmentIds: string[]; // for department-scope filtering
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roles: Role[];
  departments: DepartmentMembership[];
  permissions: string[];   // flat merged list for convenience
}

// ─── Configuration entities ──────────────────────────────────────────────────

export interface PriorityLevel {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface DepartmentMembership {
  departmentId: string;
  department: Department;
  isPrimary: boolean;
}

export interface ProcessDefinition {
  id: string;
  departmentId: string;
  department?: Department;
  name: string;
  code: string;
  appliesTo: AppliesTo;
  requiresChecklist: boolean;
  requiresVerification: boolean;
  defaultEstimatedMinutes: number | null;
  defaultPriorityLevelId: string | null;
  defaultPriorityLevel?: PriorityLevel | null;
  weight: number;
  isActive: boolean;
}

export interface ProcessRoute {
  id: string;
  targetType: RouteTargetType;
  unitTypeId: string | null;
  partTypeId: string | null;
  processDefinitionId: string;
  processDefinition?: ProcessDefinition;
  sequenceOrder: number;
  isOptional: boolean;
  isActive: boolean;
}

export interface UnitType {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface PartType {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface UnitTypeComposition {
  id: string;
  unitTypeId: string;
  partTypeId: string;
  partType?: PartType;
  defaultQuantity: number;
  isOptional: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface Machine {
  id: string;
  departmentId: string;
  department?: Department;
  name: string;
  code: string;
  isActive: boolean;
}

export interface ChecklistTemplate {
  id: string;
  processDefinitionId: string;
  processDefinition?: ProcessDefinition;
  name: string;
  isActive: boolean;
  items?: ChecklistItemTemplate[];
}

export interface ChecklistItemTemplate {
  id: string;
  checklistTemplateId: string;
  label: string;
  sortOrder: number;
  isRequired: boolean;
}

export interface ChecklistResponse {
  id: string;
  productionTaskId: string;
  checklistItemTemplateId: string;
  checklistItemTemplate?: ChecklistItemTemplate;
  isChecked: boolean;
  completedByUserId: string | null;
  completedAt: string | null;
}

// ─── Identity & Access ───────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  code: string;
  description: string | null;
  category: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles?: Role[];
  departments?: DepartmentMembership[];
}

// ─── Manufacturing Hierarchy ─────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  code: string;
  contactInfo: Record<string, string> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  customerId: string;
  customer?: Customer;
  name: string;
  code: string;
  startDate: string | null;
  targetEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  projectId: string;
  project?: Project;
  orderNumber: string;
  priorityLevelId: string;
  priorityLevel?: PriorityLevel;
  status: OrderStatus;
  requestedDeliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  orderId: string;
  order?: Order;
  unitTypeId: string;
  unitType?: UnitType;
  serialNumber: string;
  specifications: Record<string, unknown> | null;
  progressPercentage: number;  // derived, read-only
  status: UnitStatus;           // derived, read-only
  createdAt: string;
  updatedAt: string;
}

export interface Part {
  id: string;
  unitId: string;
  unit?: Unit;
  partTypeId: string;
  partType?: PartType;
  identifier: string;
  quantity: number;
  specifications: Record<string, unknown> | null;
  progressPercentage: number;  // derived, read-only
  status: PartStatus;           // derived, read-only
  createdAt: string;
  updatedAt: string;
}

// ─── Production Task Engine ──────────────────────────────────────────────────

export interface ProductionTask {
  id: string;
  partId: string | null;
  part?: Part | null;
  unitId: string | null;
  unit?: Unit | null;
  departmentId: string;
  department?: Department;
  processDefinitionId: string;
  processDefinition?: ProcessDefinition;
  sequenceOrder: number;
  parentTaskId: string | null;
  nextTaskId: string | null;
  status: TaskStatus;
  priorityLevelId: string;
  priorityLevel?: PriorityLevel;
  assignedUserId: string | null;
  assignedUser?: User | null;
  verifiedByUserId: string | null;
  verifiedByUser?: User | null;
  machineId: string | null;
  machine?: Machine | null;
  estimatedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  checklistResponses?: ChecklistResponse[];
}

export interface TaskStatusHistory {
  id: string;
  productionTaskId: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedByUserId: string;
  changedByUser?: User;
  changedAt: string;
  note: string | null;
}

// ─── Mission Control ─────────────────────────────────────────────────────────

export interface KanbanColumn {
  department: Department;
  taskCount: number;
  tasks: ProductionTask[];
}

export interface MissionControlBoard {
  columns: KanbanColumn[];
}

export interface MissionControlSummary {
  totalVisible: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Array<{ priorityLevel: PriorityLevel; count: number }>;
  overdueCount: number;
}

// ─── Dashboard Preferences ───────────────────────────────────────────────────

export interface DashboardPreferences {
  defaultView: 'kanban' | 'list';
  visibleDepartmentIds: string[];
  defaultDepartmentFilter: 'mine' | 'all';
  defaultPriorityFilter: string | null;
  taskCardFields: string[];
  missionControlLayout: Record<string, unknown>;
}

// ─── WebSocket Events ────────────────────────────────────────────────────────

export interface WsTaskCreated {
  task: ProductionTask;
}

export interface WsTaskStatusChanged {
  taskId: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  task: ProductionTask;
}

export interface WsTaskUpdated {
  taskId: string;
  task: ProductionTask;
}

export interface WsPartProgressChanged {
  partId: string;
  progressPercentage: number;
  status: PartStatus;
}

export interface WsUnitProgressChanged {
  unitId: string;
  progressPercentage: number;
  status: UnitStatus;
}

export interface WsChecklistUpdated {
  taskId: string;
  checklistResponseId: string;
  isChecked: boolean;
  completionSummary: {
    total: number;
    required: number;
    checkedRequired: number;
    allRequiredComplete: boolean;
  };
}
