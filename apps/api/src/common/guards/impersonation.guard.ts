import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '@hvacflow/shared-types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces that "view as" preview sessions (tokens minted via
 * POST /auth/impersonate/:userId) are strictly read-only.
 *
 * An admin previewing another user's dashboard must never be able to
 * create/update/delete data while wearing that user's identity — this
 * guard blocks every non-safe HTTP method for such tokens, independent
 * of whatever permissions the impersonated user happens to have.
 */
@Injectable()
export class ImpersonationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (user?.impersonatedBy && !SAFE_METHODS.has(request.method)) {
      throw new ForbiddenException(
        "This is a read-only preview of another user's dashboard. Exit preview to make changes.",
      );
    }

    return true;
  }
}
