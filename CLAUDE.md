# Skills Hub — 專案 AI 指引

> 單一使用者的 AI Skills 收藏書櫃 + MCP Server。永久只我用。

## 專案硬規則

1. **所有 AI 呼叫走 proxycli**：不直接接 Anthropic SDK。透過 `packages/shared/src/proxycli.ts` 的抽象介面，REST 打 `clip.twloop.com/api/chat`。
2. **proxycli 路由偏好**：主 `provider: "openai"` → fallback `"gemini"`。不要用 `provider: "claude"`（憑證過期）。不要設 `tier` 或 `model` 單獨（會強制走 claude）。
3. **資料庫固定 SQLite**：不要改 Postgres。WAL 模式 + FTS5 + 日後 sqlite-vss。
4. **永久單人使用**：不要加多租戶、is_public、fork 功能（PRD v0.3 已鎖定）。
5. **Secrets 絕不進 `.env.example` 或 git**：真值只在 `.env`（gitignored）；token rotate 時用 `db:seed` 重生。
6. **port 寫死 3003**（`/www/wwwroot/skillshub.looptw.com`，避開 chatcal 的 3002）。

## 架構速覽

```
Cloudflare DNS → Nginx (aaPanel, Let's Encrypt) → 127.0.0.1:3003
                                                       ↓
                      Next.js 15 單 container
                        ├─ Web UI (App Router)
                        ├─ REST API /api/*
                        ├─ MCP Server /mcp（JSON-RPC 2.0）
                        ├─ node-cron（週日 03:00 auto-snapshot）
                        └─ better-sqlite3 → /data/skills.db
                                                       ↓
                              proxycli REST (cli.twloop.com)
                              → openai gpt-4o-mini / gemini-2.5-flash
```

## 三份權威文件

- `01-dev/1-PRD.md` v0.3 — 需求、scope、資料模型、里程碑
- `01-dev/2-UserFlow.md` v0.2 — 11 條使用者流程
- `01-dev/3-TechStack.md` v0.2 — 技術選型細節、Docker compose、Nginx 範本
- `01-dev/0-runset.md` — 全機器基礎設施（不只 skills hub）。新增部署對照 §4.C。

## Dev / Deploy 指令

```bash
# 本機開發（cwd: 02-web）
npm install
npm run db:migrate
npm run db:seed          # 首次跑會 print API token
npm run dev              # http://localhost:3002

# Docker 建置（本機沒 docker 也能推上 server build）
docker compose up -d --build

# 資料庫 migration 新增
# 1. 改 packages/web/src/db/schema.ts
# 2. npm run db:generate
# 3. 檢查 packages/web/drizzle/*.sql
# 4. npm run db:migrate
```

## 常犯錯誤備忘

- **Next.js import 不加 `.js` 副檔名**：ESM 規範要求，但 Next webpack 會炸。只在 `.ts` 原始碼寫 `from "./schema"`，不是 `"./schema.js"`。
- **`.env` 不會被 Next 自動讀到**：專案 root `02-web/.env` 不是 `packages/web/` 的本地，靠 `packages/web/.env` symlink 過去。Docker image 裡由 env_file 注入。
- **Docker Compose `env_file` ≠ 自動 cwd 有 `.env`**：seed 腳本有自己 `dotenv({ path: "../../.env" })` fallback，但 docker exec 跑時 cwd 在 `/app/packages/web/` 剛好對。
- **better-sqlite3 在 ARM64 alpine 需 build tools**：Dockerfile 要 `apk add python3 make g++ libc6-compat`。
- **Nginx proxy_pass 站也要 `root` directive**：Let's Encrypt challenge 靠 aaPanel Lua 讀 `$document_root`。

## 測試規範

- **新 API endpoint**：至少一個 integration 測（session cookie + Bearer token 兩條認證路徑）
- **LLM 改 prompt / model**：跑 categorize eval（還沒建，M3 之後補）
- **MCP tool 改**：手動 `curl -X POST /mcp` 各 method 一次

## 跟使用者協作

- **繁體中文回覆**，精簡、條列式、先結論再細節
- **重大 scope 變更用 AskUserQuestion 問**，不要靜默擴充或縮減
- **執行破壞性動作前先確認**（遠端 docker 重啟、DB drop、git push）
