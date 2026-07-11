/**
 * Fixed engine-level enums.
 *
 * These are the ONLY hardcoded values in HVACFlow.
 * Everything else (departments, processes, priorities, parts,
 * unit types, checklists, roles, permissions) is configurable data.
 *
 * These enums represent structural states the workflow engine
 * uses to reason about task lifecycle — they cannot be made
 * configurable without rewriting the engine itself.
 */

/** Core task lifecycle states managed by the Production Task Engine */
export enum TaskStatus {
  Pending = 'Pending',
  Ready = 'Ready',
  InProgress = 'InProgress',
  PendingVerification = 'PendingVerification',
  Completed = 'Completed',
  OnHold = 'OnHold',
  Rejected = 'Rejected',
}

/** Order-level lifecycle — drives engine rules (e.g. blocks unit creation on Cancelled) */
export enum OrderStatus {
  Draft = 'Draft',
  Confirmed = 'Confirmed',
  InProduction = 'InProduction',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

/** Derived unit status — computed by workflow-progress service, never set directly */
export enum UnitStatus {
  Planned = 'Planned',
  InProgress = 'InProgress',
  Completed = 'Completed',
  OnHold = 'OnHold',
  Dispatched = 'Dispatched',
}

/** Derived part status — computed by workflow-progress service, never set directly */
export enum PartStatus {
  Pending = 'Pending',
  InProgress = 'InProgress',
  Completed = 'Completed',
  OnHold = 'OnHold',
  Rejected = 'Rejected',
}

/**
 * Determines whether a ProcessDefinition generates tasks attached
 * to Parts (most manufacturing ops) or directly to Units (Testing, Dispatch)
 */
export enum AppliesTo {
  PART = 'PART',
  UNIT = 'UNIT',
}

/** Determines whether a ProcessRoute entry applies to a UnitType or PartType */
export enum RouteTargetType {
  UNIT_TYPE = 'UNIT_TYPE',
  PART_TYPE = 'PART_TYPE',
}
