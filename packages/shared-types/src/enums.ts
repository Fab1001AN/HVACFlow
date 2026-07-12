/**
 * Fixed engine-level values shared across the API and web application.
 * Const objects preserve TaskStatus.Pending-style access while their
 * associated types remain compatible with Prisma string-union enums.
 */

export const TaskStatus = {
  Pending: 'Pending',
  Ready: 'Ready',
  InProgress: 'InProgress',
  PendingVerification: 'PendingVerification',
  Completed: 'Completed',
  OnHold: 'OnHold',
  Rejected: 'Rejected',
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

export const OrderStatus = {
  Draft: 'Draft',
  Confirmed: 'Confirmed',
  InProduction: 'InProduction',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
} as const;

export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

export const UnitStatus = {
  Planned: 'Planned',
  InProgress: 'InProgress',
  Completed: 'Completed',
  OnHold: 'OnHold',
  Dispatched: 'Dispatched',
} as const;

export type UnitStatus = typeof UnitStatus[keyof typeof UnitStatus];

export const PartStatus = {
  Pending: 'Pending',
  InProgress: 'InProgress',
  Completed: 'Completed',
  OnHold: 'OnHold',
  Rejected: 'Rejected',
} as const;

export type PartStatus = typeof PartStatus[keyof typeof PartStatus];

export const AppliesTo = {
  PART: 'PART',
  UNIT: 'UNIT',
} as const;

export type AppliesTo = typeof AppliesTo[keyof typeof AppliesTo];

export const RouteTargetType = {
  UNIT_TYPE: 'UNIT_TYPE',
  PART_TYPE: 'PART_TYPE',
} as const;

export type RouteTargetType =
  typeof RouteTargetType[keyof typeof RouteTargetType];
