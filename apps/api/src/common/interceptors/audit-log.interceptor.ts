import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '@hvacflow/shared-types';

// Automatically records one audit row per SUCCESSFUL mutating request
// (POST / PATCH / PUT / DELETE that returns 2xx). Reads are never logged
// (would flood the table and slow every GET), and failed requests aren't
// logged as if they happened. The write is fire-and-forget with its own
// error trap, so auditing can never slow down or break the real request -
// same defensive philosophy as ActivityLogService.
//
// Central by design: because it's a global interceptor, every current and
// FUTURE mutating endpoint is captured with no per-module code, so a new
// route can't silently escape the audit trail.

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Paths we deliberately don't audit: auth (sensitive + high frequency, and
// login isn't a data mutation), and the audit view itself.
const SKIP_PATH_PREFIXES = ['/auth/login', '/auth/refresh', '/auth/logout', '/audit-logs'];

function methodToAction(method: string): string {
  switch (method) {
    case 'POST': return 'CREATE';
    case 'PATCH':
    case 'PUT': return 'UPDATE';
    case 'DELETE': return 'DELETE';
    default: return method;
  }
}

// Derive a human-meaningful entity name and (when present) the affected id
// from the route path. Alternating REST paths look like
// resource/{id}/subresource/{id}. We treat segments as ids when they look
// like one (uuid, cuid, numeric, or any segment containing a digit that
// follows a resource word), and join the remaining resource words as the
// entity. e.g.
//   /departments/{uuid}         -> entity "departments", id "{uuid}"
//   /units/{id}/parts           -> entity "units/parts", id "{id}"
//   /workflow-stages            -> entity "workflow-stages", id null
function parseEntity(path: string): { entity: string; entityId: string | null } {
  const clean = path.split('?')[0].replace(/^\/+|\/+$/g, '');
  const segments = clean.split('/').filter(Boolean);
  const looksLikeId = (s: string) =>
    /^[0-9a-fA-F]{8,}-[0-9a-fA-F-]+$/.test(s) || // uuid
    /^c[a-z0-9]{20,}$/i.test(s) ||               // cuid
    /^\d+$/.test(s) ||                            // numeric id
    /^[a-z0-9]{16,}$/i.test(s);                   // long opaque id

  const nameParts: string[] = [];
  let entityId: string | null = null;
  for (const seg of segments) {
    if (looksLikeId(seg)) {
      entityId = seg; // last id-looking segment wins
    } else {
      nameParts.push(seg);
    }
  }
  return { entity: nameParts.join('/') || clean || 'unknown', entityId };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = req?.method ?? '';
    const path: string = req?.originalUrl ?? req?.url ?? '';

    const isMutating = MUTATING_METHODS.has(method);
    const isSkipped = SKIP_PATH_PREFIXES.some((p) => path.startsWith(p));

    return next.handle().pipe(
      tap({
        next: () => {
          if (!isMutating || isSkipped) return;
          this.write(context, req, method, path);
        },
        // On error we do nothing - a rejected request didn't change data,
        // so it shouldn't appear in the audit trail as an action taken.
      }),
    );
  }

  private write(context: ExecutionContext, req: any, method: string, path: string) {
    try {
      const res = context.switchToHttp().getResponse();
      const statusCode: number = res?.statusCode ?? 200;
      // Belt-and-suspenders: tap.next only fires on success, but guard the
      // status too in case a handler set a non-2xx without throwing.
      if (statusCode < 200 || statusCode >= 300) return;

      const user: JwtPayload | undefined = req?.user;
      const { entity, entityId } = parseEntity(path);

      // Fire-and-forget: never await, never let a failure touch the request.
      this.prisma.auditLog
        .create({
          data: {
            actorId: user?.sub ?? null,
            actorName: user?.name ?? 'Unknown',
            action: methodToAction(method),
            entity,
            entityId,
            method,
            path,
            statusCode,
          },
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Audit log write failed:', err);
        });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Audit log interceptor error:', err);
    }
  }
}
