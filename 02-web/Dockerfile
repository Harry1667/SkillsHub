# ARM64 alpine；better-sqlite3 要 build tools
FROM node:22-alpine AS base
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app

# ──────────────── deps ────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/cli/package.json packages/cli/package.json
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

# ──────────────── build ────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 本地 packages/web/.env 是 symlink → 清掉避免 Next 讀到 broken
RUN rm -f packages/web/.env
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm -w @skillshub/web run build

# ──────────────── runner ────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3003

# 帶齊執行期需要的檔
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/web/.next ./packages/web/.next
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/web/drizzle ./packages/web/drizzle
COPY --from=builder /app/packages/web/drizzle.config.ts ./packages/web/drizzle.config.ts
COPY --from=builder /app/packages/web/src/db ./packages/web/src/db
COPY --from=builder /app/packages/shared ./packages/shared

EXPOSE 3003
# 啟動前跑 migration（冪等）
CMD ["sh", "-c", "npm -w @skillshub/web run db:migrate && npm -w @skillshub/web run start"]
