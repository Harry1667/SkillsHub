# Skills Hub — 技術棧 (TechStack)

> 版本：v0.2（對應 PRD v0.3 / Approach D — Personal-Scale）
> 日期：2026-04-20
> 部署環境對齊：`0-runset.md`

---

## 0. 一圖看懂（Approach D）

```
                    Cloudflare DNS (灰色雲朵, DNS Only)
                                │
                                ▼
              skillshub.looptw.com → 137.131.7.230
                                │
                                ▼
                  ┌────────────────────────────┐
                  │  Nginx (aaPanel + L.E.)    │
                  │  反向代理 → 127.0.0.1:3002 │
                  └────────────────────────────┘
                                │
                                ▼
            ┌───────────────────────────────────┐
            │  Next.js 15 單一 container        │
            │  ─────────────────────────────    │
            │  Web UI | REST API | MCP /mcp     │
            │  node-cron (in-process)           │
            │  better-sqlite3 → skills.db (WAL) │
            └───────────────────────────────────┘
                                │
                                ▼
                         Claude Haiku API
                         (prompt caching)
```

**單 container、單 DB 檔、單 process**。沒有 Redis、沒有 BullMQ、沒有另一個 auth server。

---

## 1. 前端

| 項目 | 選型 |
|---|---|
| Framework | **Next.js 15** (App Router, React 19) |
| 樣式 | **TailwindCSS 4** |
| UI 元件 | **shadcn/ui** |
| 表單 | **react-hook-form + zod**（schema 與後端共用） |
| 資料取得 | **SWR** |
| Markdown | **react-markdown + remark-gfm + rehype-highlight** |
| Icon | **lucide-react** |

---

## 2. 後端

| 項目 | 選型 | 備註 |
|---|---|---|
| Runtime | **Node.js 22 LTS** | ARM64 |
| API | **Next.js API Routes** | 與前端同 process |
| DB 驅動 | **`better-sqlite3`** | 同步 API，輕量快速 |
| ORM | **Drizzle ORM**（SQLite dialect） | |
| Auth | **自刻 basic auth**（bcrypt + session table） | 或 `lucia-auth` 最小封裝 |
| Validation | **zod** | |
| Logger | **pino** | JSON 輸出 |
| Cron | **`node-cron`**（同 process） | 每週 auto-snapshot |

**明確刪除**：~~NextAuth.js~~、~~BullMQ + Redis~~、~~@upstash/ratelimit~~。

---

## 3. 資料層

| 項目 | 選型 | 備註 |
|---|---|---|
| 主資料庫 | **SQLite**（單檔 `skills.db`） | `PRAGMA journal_mode=WAL`；`PRAGMA foreign_keys=ON` |
| 全文搜尋 | **SQLite FTS5** virtual table | 涵蓋 name + description + content |
| 語意搜尋（M5） | **`sqlite-vss`** extension | ARM 有 pre-built binary |
| 備份 | 每日 03:00 `cp skills.db skills.db.$(date +%F)` + **Litestream** 推 Oracle Object Storage |
| 監控 | DB 大小 > 1GB 時告警（個人用不該到） |

### Schema（Drizzle 定義摘要）

```typescript
// users（只有 id=1 一筆 row）
id           integer primary key
username     text
password_hash text   -- bcrypt
api_token_hash text  -- sha256
failed_login_count integer default 0
locked_until integer  -- unix timestamp，brute-force lock
created_at   integer

// skills
id            text primary key (uuid v4)
name          text not null
description   text
content       text  -- markdown
source_url    text
source_type   text  -- github | gist | url | manual
snapshot_at   integer
category      text
tags          text  -- json array as text
summary_zh    text
summary_en    text
needs_retry   integer default 0  -- LLM 分類失敗時 = 1
created_at    integer
updated_at    integer

CREATE INDEX idx_skills_created ON skills(created_at DESC);
CREATE INDEX idx_skills_category ON skills(category);
CREATE VIRTUAL TABLE skills_fts USING fts5(name, description, content, content=skills, content_rowid=rowid);

// audit_events（新增）
id           integer primary key autoincrement
event_type   text not null  -- mcp_search | mcp_get | api_list | api_get | cron_snapshot
skill_id     text
tool_name    text            -- 'Claude Code' / 'CLI' / 'Web'
metadata     text            -- json
created_at   integer

CREATE INDEX idx_audit_time_type ON audit_events(created_at DESC, event_type);

// sessions
id         text primary key  -- session token
user_id    integer
expires_at integer
```

---

## 4. LLM / 外部服務（走 proxycli）

> **全專案 AI 呼叫統一走 proxycli**（`cli.twloop.com:443` gRPC，NAS 上的 AI Proxy 服務）。
> 不直接接 Anthropic SDK。理由：統一配額管理、多 provider fallback、actual_provider tracking。

| 服務 | 用途 | 走法 |
|---|---|---|
| **proxycli gRPC** | skill 分類、摘要、URL 解析 | `@grpc/grpc-js` + proto loader，TLS 443 |
| **GitHub API (Octokit)** | 抓 repo / gist / trending | 使用者 PAT（`GITHUB_TOKEN` env）|

### proxycli 呼叫參數
- `model`：通常不指定，交由 proxycli `routing.auto` 判斷
- `tier`：`fast`（分類用）/ `smart`（fallback 複雜網頁用）
- `effort`：標準任務留空，複雜解析設 `medium`
- `project`: `skillshub`、`group`: `categorize|summarize|scrape`（便於 dashboard 統計）

### Prompt Caching 策略
- 分類 prompt 的 system 部分（固定分類清單、zod schema 指引）送到 proxycli 時標記 cache-breakpoint。
- 目標 cache hit rate > 80%。
- 月預算上限：**USD 5**（從 proxycli dashboard 監控；超過則暫停自動分類、`needs_retry=true`）。

### 降級與重試（zod 配合）
```ts
const skillSchema = z.object({ name: z.string(), category: z.enum([...]), ... });
const resp = await proxyclient.chat({ prompt, project: 'skillshub', group: 'categorize' });
const parsed = skillSchema.safeParse(JSON.parse(resp.content));
if (!parsed.success) {
  // 降級：存原始 content，category='uncategorized'，needs_retry=true
  await db.insert(skills).values({ ..., category: 'uncategorized', needsRetry: 1 });
}
```

### proxycli 失效備援
- gRPC 連不上（`cli.twloop.com:443`）→ 改走 REST 備援 `POST clip.twloop.com/api/chat`（debug only，觸發警示）
- 兩條都失敗 → 入庫時 `needs_retry=true`，不擋使用者流程

---

## 5. MCP Server

| 項目 | 選型 |
|---|---|
| SDK | `@modelcontextprotocol/sdk` |
| Transport | **HTTP streamable** |
| 端點 | `https://skillshub.looptw.com/mcp` |
| 認證 | `Authorization: Bearer <API_TOKEN>` → 對照 `users.api_token_hash` |
| Tools | `search_skills(query, category?, limit?=20)`、`get_skill(id)` |
| 逾時 | search 5s、get 2s |

實作位置：`app/mcp/route.ts`（Next.js route handler）。每次呼叫寫 `audit_events`。

---

## 6. CLI Package（新增）

**結構**（npm workspaces）：

```
02-web/
├── package.json             # root，workspaces: ["packages/*"]
├── packages/
│   ├── web/                 # Next.js 主應用
│   ├── cli/                 # @skillshub/cli（M2 才做）
│   └── shared/              # zod schema + proxycli client 共用
└── .env.example
```

**CLI 依賴**：`commander` + `ora`（spinner）+ `chalk`。

**指令**：
```
skillshub config --url <url> --token <token>
skillshub add <url>
skillshub list [--category <c>] [--tag <t>]
skillshub search <query>
skillshub show <id>
skillshub rm <id>
```

config 存 `~/.skillshub/config.json`（chmod 600）。

---

## 7. 抓取 / 解析

| 來源 | 工具 |
|---|---|
| GitHub repo | **Octokit** |
| Gist | `fetch` → raw URL |
| 一般網頁 | `fetch` + **`@mozilla/readability`** + **`jsdom`** |
| Markdown 清理 | `remark` + `remark-parse` |

**SKILL.md 偵測順序**：`SKILL.md` → `skill.md` → `README.md`。

### SSRF 防護（新增）
```ts
function isSafeUrl(urlStr: string): boolean {
  const u = new URL(urlStr);
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  const host = u.hostname;
  const denyPatterns = [
    /^127\./, /^10\./, /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^169\.254\./,       // link-local + cloud metadata
    /^::1$/, /^fc[0-9a-f]{2}:/, /^fe80:/,
    /^localhost$/i, /\.local$/i, /^0\.0\.0\.0$/
  ];
  return !denyPatterns.some(p => p.test(host));
}
```

DNS rebinding 防護：抓取前先 resolve，解析後再次檢查 IP 是否在 deny-list。

---

## 8. 開發工具

| 項目 | 工具 |
|---|---|
| 套件管理 | **npm workspaces**（原生內建、免 sudo 安裝 pnpm） |
| TypeScript | v5.6+，strict |
| Lint | **Biome** |
| Test | **Vitest** + **Playwright**（MCP integration 測試）|
| Git Hook | **lefthook** |
| CI | **GitHub Actions**（lint + typecheck + test + docker build） |

**關鍵測試**：
- MCP integration：模擬 Claude Code 呼叫，斷言 search/get 回應格式
- LLM 分類 eval：20 個已知 skill 的金標準資料集，每次 prompt 改動跑一次
- SSRF：攻擊測試（確保 deny-list 有效）

---

## 9. 環境變數（`.env`）

```bash
# ─── App ───
NODE_ENV=production
APP_URL=https://skillshub.looptw.com
PORT=3002

# ─── Auth ───
ADMIN_PASSWORD_HASH=$2b$12$...       # bcrypt hash
API_TOKEN_HASH=<sha256 of raw>        # 首次啟動自動產生
SESSION_SECRET=<openssl rand -base64 32>

# ─── Database ───
DATABASE_PATH=/data/skills.db          # SQLite 檔案位置（mounted volume）

# ─── proxycli（所有 AI 走這）───
PROXYCLI_GRPC_URL=cli.twloop.com:443
PROXYCLI_REST_URL=https://clip.twloop.com
PROXYCLI_TOKEN=<你填>
PROXYCLI_PROJECT=skillshub
LLM_MONTHLY_USD_CAP=5

# ─── GitHub ───
GITHUB_TOKEN=<personal access token>   # read:public repos，for Octokit

# ─── Cron ───
CRON_TIMEZONE=Asia/Taipei
CRON_SCHEDULE=0 3 * * 0                # 每週日 03:00
```

---

## 10. Docker Compose（精簡版）

```yaml
services:
  app:
    build: .
    restart: always
    ports: ["127.0.0.1:3002:3002"]
    env_file: .env
    volumes:
      - ./data:/data                   # SQLite 檔案持久化
      - ./backup:/backup
```

**就這樣**。沒有 postgres、沒有 redis。單一 image、單一 volume。

Dockerfile 關鍵：
```dockerfile
FROM node:22-alpine
RUN apk add --no-cache python3 make g++  # better-sqlite3 ARM 編譯需要
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter web build
CMD ["pnpm", "--filter", "web", "start"]
```

---

## 11. 部署到 Oracle（對齊 0-runset.md）

| 項目 | 值 |
|---|---|
| 子域名 | `skillshub.looptw.com` |
| 內部 Port | **3002** |
| 路徑 | `/www/wwwroot/skillshub.looptw.com` |

### 部署步驟
1. Cloudflare → A 記錄 `skillshub` → `137.131.7.230`（灰色雲朵）
2. aaPanel → 新增站點 `skillshub.looptw.com`（靜態型）
3. `mkdir -p /www/wwwroot/skillshub.looptw.com/{data,backup}`
4. `chown -R www:www /www/wwwroot/skillshub.looptw.com`
5. 建立 `.env`（§9 模板）
6. `docker compose up -d`
7. 首次啟動：從 container log 撈 `API_TOKEN` 原值（只顯示一次），存好
8. Nginx 設定（覆蓋 aaPanel 產生的 location /）：
   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3002;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }

   # MCP streaming 長連線
   location /mcp {
       proxy_pass http://127.0.0.1:3002;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_buffering off;
       proxy_read_timeout 3600s;
   }
   ```
9. aaPanel → SSL → Let's Encrypt 申請
10. 驗證：`curl https://skillshub.looptw.com/api/health`

---

## 12. 監控 / 維運

| 項目 | 方案 |
|---|---|
| 應用 log | `docker logs -f skillshub-app-1` |
| 錯誤追蹤 | **Sentry** 免費 tier |
| Uptime | **Better Stack** 免費 tier → `/api/health` |
| DB 檢查 | 每日 cron：檔案大小、integrity check (`PRAGMA integrity_check`)、備份成功 |
| LLM 成本 | `audit_events` 統計每日 token 用量 + 月總計，超 USD 5 告警 |
| 自動備份 | 每日 03:00 `cp` + Litestream 持續同步到 Oracle Object Storage |

---

## 13. 安全性

### 認證與授權
- 密碼：bcrypt cost 12，`ADMIN_PASSWORD` 要求 ≥ 16 字（.env 前檢查）
- 登入：5 次失敗 lock IP 15 分鐘（`users.failed_login_count` + `locked_until`）
- Session cookie：`httpOnly=true, secure=true, sameSite=strict`
- API Token：sha256 hash 存 DB，原值只在首次啟動顯示

### URL 抓取安全
- SSRF deny-list（§7），拒絕 RFC1918 私網、cloud metadata、非 http(s)
- DNS rebinding 防護：resolve 後重檢查 IP
- fetch timeout：10s；body size 上限 500KB

### LLM 安全
- Prompt injection：已接受風險（MCP 本來就是把 skill content 注入 Claude，這是 by design）
- API key：只存 .env，不回傳前端
- 月花費硬性上限：超過即停止 Haiku call

### CORS
- REST API 預設關閉跨域（MCP / CLI 都是 server-to-server）

---

## 14. 里程碑對應的技術交付

| 里程碑 | 新增技術模組 |
|---|---|
| **M1** | Next.js + SQLite + basic auth + shadcn UI + Drizzle migration + Docker |
| **M2（合併）** | Octokit + Readability + SSRF + Claude API + **MCP Server** + **audit_events** + **CLI package** + **node-cron auto-snapshot** |
| **M3** | 匯出 / 匯入 + `/admin/stats` 完整化 |
| **M4** | GitHub trending 抓取（in-process worker） |
| **M5** | `sqlite-vss` 語意搜尋 |

---

## 15. 還沒定的事（刻意延後）

- [ ] MCP resource subscription（skill 更新時推播給 Claude）
- [ ] 瀏覽器擴充（GitHub 頁面「★ 收藏到 Skills Hub」）
- [ ] 多裝置密碼 sync（目前靠瀏覽器自己記）
- [ ] i18n（目前中英文混用即可）
- [ ] skill 版本歷史（snapshot diff view）
