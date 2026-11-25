# mncord server image (works on the Oracle Always Free ARM VM and on x64). Build from the repo root:
#   docker build -f apps/server/Dockerfile -t mncord-server .
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev -w @mncord/server -w @mncord/shared --include-workspace-root=false --ignore-scripts=false

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
WORKDIR /app
RUN addgroup -S mncord && adduser -S mncord -G mncord && mkdir -p /data && chown mncord:mncord /data
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY apps/server/package.json ./apps/server/
COPY apps/server/src ./apps/server/src
COPY apps/server/migrations ./apps/server/migrations
USER mncord
WORKDIR /app/apps/server
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "--experimental-strip-types", "src/index.ts"]
