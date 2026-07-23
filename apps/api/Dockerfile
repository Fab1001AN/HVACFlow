# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

# OpenSSL is required by Prisma's engines on Alpine.
RUN apk add --no-cache openssl

# Copy only manifests first so dependency install is cached and doesn't
# re-run every time application source changes.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Prisma schema is needed before generate.
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma

# Now the sources, then build shared types followed by the API.
COPY tsconfig*.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build:shared \
 && npm run build --workspace=@hvacflow/api \
 && npx tsc --project tsconfig.seed.json

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

# Production dependencies only - no application dev tooling in the image.
# bcrypt is a native module and compiles from source on Alpine, so the build
# toolchain is installed just long enough to do that, then removed.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --omit=dev \
 && apk del .build-deps

# The generated Prisma client and compiled output from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Compiled seed, so a brand-new install can create the default admin user
# and starter configuration without needing TypeScript in the image.
COPY --from=build /app/dist-seed ./dist-seed

# Schema and migrations, so migrate deploy can run at startup.
COPY prisma ./prisma

EXPOSE 4000
WORKDIR /app/apps/api
CMD ["node", "dist/main"]
