import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Prisma } from '@prisma/client';

// Prisma's Decimal type doesn't survive Nest's ClassSerializerInterceptor
// cleanly - class-transformer walks the Decimal instance's own enumerable
// properties instead of calling its toJSON(), so it arrives on the wire
// as the raw decimal.js internal shape ({s, e, d}) instead of a number
// or numeric string. Every Decimal field (Unit/Part.progressPercentage,
// ProcessDefinition.weight) was affected - visibly as "NaN×" wherever
// the frontend did Number(x) directly on it, silently as a broken
// progress bar everywhere else (an invalid CSS width just gets dropped).
//
// The first fix attempt used PrismaService's $use() middleware to
// convert Decimal -> number right after every query. That API was
// removed entirely in this Prisma version (6.x) - it was a real,
// confirmed compile error, not just an emulator gap. Middleware isn't
// the right layer for this anyway; converting at the HTTP response
// boundary via an interceptor is a stable, non-deprecated Nest API and
// doesn't care what Prisma version is in use.
function convertDecimals(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convertDecimals);
  if (typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      (value as Record<string, unknown>)[key] = convertDecimals((value as Record<string, unknown>)[key]);
    }
    return value;
  }
  return value;
}

@Injectable()
export class DecimalTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => convertDecimals(data)));
  }
}
