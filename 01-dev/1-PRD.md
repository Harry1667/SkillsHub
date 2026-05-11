# Skills Hub — 產品需求文件 (PRD)

> 版本：v0.3（CEO Review 後）
> 日期：2026-04-20
> 狀態：scope 已鎖定，可進入實作

---

## 1. 一句話定義

一個**我個人**收藏、分類 AI Skills 的私人書櫃，核心差異化是透過 **MCP Server** 讓 Claude Code 直接取用。

---

## 2. 什麼是 AI Skills？（背景說明）

**Skill = 可重複使用的「專業技能包」**，讓 AI Agent（Claude Code / Cursor / Codex 等）在遇到特定任務時，自動載入對應的指令、工具、知識。

Anthropic Skills 格式：

```
my-skill/
├── SKILL.md          # 技能說明（必要，含 frontmatter）
├── scripts/          # 輔助腳本（可選）
└── references/       # 參考資料（可選）
```

`SKILL.md` 前置 metadata：

```markdown
---
name: pdf-processor
description: 處理 PDF 檔案，提取文字、合併、分割
---
# 使用時機 / 操作步驟 ...
```

### 目前的痛點（僅限我個人）
- 好 skill 散落在 GitHub、Gist、部落格，瀏覽器書籤找不到。
- 手動複製到 `~/.claude/skills/` 很摩擦。
- 跨裝置（Mac + Linux）手動同步。
- Claude Code 無法用到我的私人 skills，每次都要手動貼。

---

## 3. 使用者

- **唯一使用者：我**（Harry, github_id 寫死在 env）
- 不做多租戶、不做 public 分享、不做 social fork。
- 未來若要分享，再單獨加 GitHub OAuth（預估 1 天工）。

---

## 4. 核心功能

### 4.1 簡易認證（單人使用）
- **基本密碼認證**：`.env` 放 `ADMIN_PASSWORD_HASH`（bcrypt）。
- 登入 5 次失敗鎖 IP 15 分鐘（防 brute-force）。
- Session 存 SQLite，cookie httpOnly + secure。
- MCP 端另用 **API token**（隨機 32 bytes）認證，供 Claude Code 掛載。

### 4.2 Skills 收藏（三種新增方式）

| 方式 | 行為 |
|---|---|
| 🔍 自動尋找 | 從 GitHub trending + awesome-claude-skills 抓候選清單供挑選（M4） |
| 🔗 貼網址 | 貼 GitHub repo / gist / 任一 URL → 抓取 → LLM 整理入庫 |
| ✍️ 手動新增 | 表單直接輸入 |
| **💻 CLI** | `skillshub add <url>` 終端機一行收藏 |

### 4.3 Skill 資料儲存策略（Hybrid）

存 metadata + 內容快照 + 原始 URL：

| 欄位 | 用途 |
|---|---|
| `source_url` | 原始連結 |
| `content` | 完整 SKILL.md 內容（markdown 快照） |
| `description / summary_zh / summary_en` | LLM 生成摘要 |
| `category / tags[]` | LLM 生成分類 |
| `snapshot_at` | 快照時間 |
| `needs_retry` | LLM 分類失敗時標記，可手動重試 |

### 4.4 自動分類 + 降級處理
- 收藏時呼叫 Claude API Haiku 產生：分類、tags、中英文摘要。
- **失敗降級**：Claude 回傳非法 JSON → `zod.safeParse` 失敗 → 入庫時 category 設 `uncategorized`、`needs_retry=true`，UI 可手動補 / 重試。
- **429 退避**：指數退避 3 次，仍失敗則 `needs_retry=true`。

### 4.5 自動 snapshot 更新（新增：cron）
- 每週日 03:00 Taipei 時間，`node-cron` 觸發。
- 對所有 skill 重抓 `source_url`，產生新 snapshot。
- **併發安全**：每筆 skill 寫入前檢查 `updated_at`，若 cron 開始後使用者有手動編輯 → skip 該筆。
- Skip 最近 1 小時內已手動 refresh 的 skill。

### 4.6 瀏覽與搜尋
- 卡片式 / 列表式切換。
- 篩選：分類、tags、來源、日期。
- 全文搜尋（SQLite FTS5）。
- Phase 2：`sqlite-vss` 語意搜尋。

### 4.7 AI Agent 使用（核心差異化）
- **MCP Server**：`skillshub.looptw.com/mcp`
  - Tool：`search_skills(query, category?)`
  - Tool：`get_skill(id)`
  - 認證：`Authorization: Bearer <API_TOKEN>`
  - `search_skills` 查詢 p95 < 50ms（SQLite），整體逾時 5s。
- **REST API**（選配，主要給 CLI 使用）：
  - `GET /api/skills`、`GET /api/skills/:id`、`GET /api/skills/search`

### 4.8 Audit 記錄（新增）
- `audit_events` 表記錄每次 MCP / API 呼叫：`event_type`, `skill_id`, `tool_name`, `metadata`, `created_at`。
- `/admin/stats` 頁面：
  - 本週 top 10 被叫用的 skill
  - 每日 MCP call 量趨勢
  - LLM token 用量累計

---

## 5. 非功能需求

- **回應速度**：列表 / MCP search p95 < 100ms（SQLite + 單機，目標輕易達成）。
- **資料主權**：skills 可匯出 JSON / Markdown。
- **部署**：Oracle（鳳凰城）ARM64 + Docker Compose + aaPanel Nginx。
- **成本上限**：每月 Claude API 花費 < USD 5（個人規模，用 Haiku + prompt caching）。
- **備份**：SQLite 單檔，每日 03:00 `cp` 到 `/backup/` + Litestream 推 Oracle Object Storage。

---

## 6. 技術架構（對齊 Approach D）

詳見 `3-TechStack.md`。核心：

- **前端**：Next.js 15 (App Router) + TailwindCSS + shadcn/ui
- **後端**：Next.js API Routes + `better-sqlite3`
- **DB**：**SQLite（WAL 模式）**
- **Auth**：自刻 basic auth（或 `lucia-auth` 最小封裝）
- **LLM**：Claude Haiku 4.5（主）+ Claude Sonnet 4.6（fallback）
- **抓取**：Octokit + `@mozilla/readability` + `jsdom`
- **MCP**：`@modelcontextprotocol/sdk`（HTTP streamable）
- **Cron**：`node-cron`（同 process，免 Redis）
- **CLI**：pnpm workspace，共用 API client
- **部署**：Docker Compose → Oracle VM（port **3002**）

**明確刪除**（原 PRD v0.2 有，現砍掉）：
- ~~Redis~~（改 node-cron 同 process）
- ~~BullMQ~~（同上）
- ~~Postgres + pgvector~~（改 SQLite + sqlite-vss）
- ~~NextAuth v5~~（單人用太重）
- ~~Rate limit~~（自己叫自己不 DoS）
- ~~is_public / fork / social 分享~~（永久只我用）

---

## 7. 資料模型（Approach D）

```
users (只有一筆 row，但仍用表方便未來延伸)
  - id (default 1)
  - username text
  - password_hash text  -- bcrypt
  - api_token_hash text -- sha256
  - failed_login_count int
  - locked_until timestamptz
  - created_at

skills
  - id uuid PK
  - name, description, content (markdown)
  - source_url text
  - source_type text  -- github | gist | url | manual
  - snapshot_at timestamptz
  - category text
  - tags text (json array as text)
  - summary_zh text, summary_en text
  - needs_retry boolean default 0
  - created_at, updated_at
  - INDEX (created_at DESC)
  - INDEX (category)
  - FTS5 virtual table on (name, description, content)

audit_events                 -- 新增
  - id bigint PK autoincrement
  - event_type text  -- mcp_search | mcp_get | api_list | api_get | cron_snapshot
  - skill_id uuid nullable
  - tool_name text    -- 'Claude Code' / 'CLI' / etc
  - metadata text     -- json
  - created_at timestamptz
  - INDEX (created_at DESC, event_type)

sessions
  - id text PK (session token)
  - user_id, expires_at
```

**明確刪除**：~~api_logs~~（合併進 audit_events）、~~forked_from~~、~~is_public~~、~~star_count~~、~~collections~~。

---

## 8. 使用者流程（核心三條）

> 完整流程寫在 `2-UserFlow.md`。

### 流程 A：貼網址收藏
1. `/add` → 貼 GitHub URL → Octokit 抓 SKILL.md/README.md → Claude Haiku 分類 → 預覽 → 儲存
2. LLM 失敗時降級：`needs_retry=true`，UI 顯示「重試」按鈕

### 流程 B：CLI 收藏
```
$ skillshub add https://github.com/.../awesome-thing
✓ fetched (README.md)
✓ categorized (dev-tools)
✓ saved (id: 8f3a...)
```

### 流程 C：Claude Code 透過 MCP 取用
```
Claude Code (設定 MCP url + token)
  → 對話：「我要寫 playwright 爬蟲」
  → Claude 呼叫 search_skills("playwright scraping")
  → MCP 回傳候選 → get_skill(id) → 拿到完整 content
  → Claude 套用 skill
```

---

## 9. 里程碑（Approach D）

| 階段 | 內容 | 預估 |
|---|---|---|
| **M1** | 基本密碼 auth + 手動新增 skills + 列表 / 搜尋 + SQLite 設定 | 1 週（CC 2-3 天） |
| **M2（合併）** | 貼網址抓取 + LLM 自動分類 + **MCP Server** + **audit_events** + **API token** + **CLI 工具** + **cron auto-snapshot** | 2 週（CC 5-7 天） |
| **M3** | 匯出 JSON/Markdown + `/admin/stats` 頁完善 | 2-3 天 |
| **M4** | 自動尋找熱門 skills（GitHub trending 整合） | 1 週 |
| **M5** | `sqlite-vss` 語意搜尋 | 3-4 天 |

**明確刪除**：~~M5 原 fork + public~~（永久只我用）。

---

## 10. 決策紀錄

### PRD v0.2 → v0.3 的重大變更（本次 CEO Review）

| # | 決議 | 影響 |
|---|---|---|
| 1 | 採 Approach D（Personal-Scale） | 砍 Postgres / Redis / BullMQ / NextAuth / fork |
| 2 | scope 永久單人 | 不埋多租戶伸縮空間（YAGNI） |
| 3 | 加 `audit_events` 表 | 每次 MCP call 可追蹤 |
| 4 | 加 CLI 工具 | `skillshub add <url>` |
| 5 | 加 auto-snapshot cron | 每週重新抓 source_url（WAL + updated_at 檢查防併發衝突） |
| 6 | 加 SSRF deny-list | 防 VM 內部網段洩漏（同機還有 Mentora / MathBox / SurvivalWallet） |
| 7 | M2 保持合併 | 模組互相耗用，拆開反而重複工 |
| 8 | LLM 降級策略 | zod 解析失敗 → `needs_retry=true` 不擋入庫 |
| 9 | Claude 成本上限 | 每月 < USD 5，用 Haiku + prompt caching |

---

## 11. 成功指標（個人使用，重新定義）

**刪除**：~~50 註冊使用者~~、~~10 位 MCP 使用者~~（偽目標）。

**新定義**：
- 我累計收藏 skills ≥ 30（表示真的在用）
- Claude Code 每週主動呼叫 MCP ≥ 20 次（audit_events 可觀測）
- 3 個月內零 silent data loss（SQLite 備份正確）
- Claude API 月花費 < USD 5
- 自己每天主動打開 `/admin/stats` 或透過 CLI 用 ≥ 1 次
