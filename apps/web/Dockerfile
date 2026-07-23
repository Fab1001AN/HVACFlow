# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

# IMPORTANT: Next.js bakes NEXT_PUBLIC_* values into the built JavaScript at
# BUILD time, not runtime. So the address staff will use must be supplied
# here as a build argument. Setting it later as an environment variable has
# no effect - the value is already compiled in.
#
# Leave the defaults for a single-machine install. If other computers on the
# network will use HVACFlow, pass this machine's address instead, e.g.
#   --build-arg NEXT_PUBLIC_API_URL=http://192.168.1.50:4000/api/v1
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_WS_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig*.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build:shared \
 && npm run build --workspace=@hvacflow/web

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/next.config.* ./apps/web/

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npx", "next", "start"]
