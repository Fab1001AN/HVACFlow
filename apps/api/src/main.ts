import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DecimalTransformInterceptor } from './common/interceptors/decimal-transform.interceptor';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const port = configService.get<number>('API_PORT', 4000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');

  // ─── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix);

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: nodeEnv === 'production'
      ? configService.get<string>('CORS_ORIGIN', 'https://app.hvacflow.com')
      : true,
    credentials: true,
  });

  // ─── Global validation pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,        // auto-transform to DTO class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Global serializer (excludes @Exclude() fields like passwordHash) ───────
  // DecimalTransformInterceptor MUST come after ClassSerializerInterceptor
  // in this array - Nest runs later-registered interceptors' response
  // transforms first (closer to the raw handler output), so this
  // ordering makes Decimal->number conversion happen BEFORE
  // ClassSerializerInterceptor's instanceToPlain() ever sees a Decimal
  // instance to mangle. Swapping this order would silently undo the fix.
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new DecimalTransformInterceptor(),
  );

  // ─── Global exception filter ────────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ─── Swagger (development only) ─────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HVACFlow API')
      .setDescription('Manufacturing Workflow Platform — API Reference')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    console.log(`📖 Swagger: http://localhost:${port}/${apiPrefix}/docs`);
  }

  await app.listen(port);
  console.log(`🚀 HVACFlow API running on http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
