import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Declares which permission codes are required to access an endpoint.
 * The PermissionsGuard reads these and checks against the JWT payload.
 *
 * Permission codes are strings read from the Permission table — not enums.
 * This keeps RBAC fully data-driven.
 *
 * @example
 *   @RequirePermissions('task:complete', 'task:verify')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
