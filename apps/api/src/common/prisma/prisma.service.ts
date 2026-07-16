import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// Prisma's Decimal type doesn't serialize cleanly through Nest's
// ClassSerializerInterceptor - it copies the decimal.js instance's raw
// internal shape ({s, e, d}) instead of calling its toJSON(), so every
// Decimal field (progressPercentage on Unit/Part, weight on
// ProcessDefinition) arrives on the frontend as an unusable object.
// `Number(thatObject)` then evaluates to NaN - visibly as "NaN×" on the
// Processes page, silently as a broken 0%-or-invalid progress bar
// everywhere else, since an invalid CSS width just gets ignored rather
// than showing text. Converting every Decimal to a plain number right
// after the query runs, globally, fixes this at the source instead of
// requiring every single call site to remember to do it.
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
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    this.$use(async (params, next) => {
      const result = await next(params);
      return convertDecimals(result);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /** Soft-delete aware where clause helper */
  get notDeleted() {
    return { deletedAt: null };
  }
}
