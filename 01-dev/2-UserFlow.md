# Skills Hub — 使用者流程 (UserFlow)

> 版本：v0.2（對應 PRD v0.3 / Approach D）
> 日期：2026-04-20
工作日誌上傳
---

## 0. 流程總覽（Approach D — 單人使用）

| 代號 | 流程名稱 | 頻率 |
|---|---|---|
| F1 | 首次登入（basic auth） | 一次 |
| F2 | 手動新增 skill（Web） | 中 |
| F3 | 貼網址自動抓取（Web） | 高 |
| F4 | CLI 收藏（`skillshub add <url>`） | **高（終端機用戶）** |
| F5 | 自動尋找熱門 skills（M4） | 中 |
| F6 | 瀏覽與搜尋 | 高 |
| F7 | 編輯 / 刪除 / 手動 refresh | 中 |
| F8 | `/admin/stats` 觀察 MCP 使用 | 低 |
| F9 | Auto-snapshot cron（背景） | **每週自動** |
| F10 | Claude Code 透過 MCP 取用 | 極高 |
| F11 | 匯出 / 匯入 | 極低 |

**已刪除**：~~GitHub OAuth~~、~~fork~~、~~public 分享~~、~~API Token 管理頁~~（改 env 設定）。

---

## F1. 首次登入

```
使用者 → https://skillshub.looptw.com → /login
  → 輸入密碼（對應 .env 的 ADMIN_PASSWORD_HASH，bcrypt 驗證）
  → 成功 → 寫 session 到 SQLite → cookie → /dashboard
  → 失敗 → 錯誤訊息；5 次內連續失敗 → lock IP 15 分鐘
  → 首次進 /dashboard 顯示 onboarding：
    1. 「你的書櫃是空的，要從 awesome-claude-skills 挑幾個？」
    2. 「或貼 URL 開始收藏？」
    3. 「或用 CLI 快速匯入？」（附 CLI 安裝指令複製按鈕）
```

**API token**：首次啟動時若 `API_TOKEN` 未設定，自動產生並寫回 `.env`。使用者去 `/settings` 看即可（顯示原值一次，之後只顯示 hash）。

---

## F2. 手動新增（Web）

```
/add → Tab「✍️ 手動」
  表單：name, description, content (markdown textarea), source_url (optional), tags
  提交 → 立即入庫（不等 LLM）
  背景呼叫 Claude Haiku 補 category + summary
  UI 用 SWR revalidation 更新卡片（LLM 完成後顯示 category badge）
  LLM 失敗 → needs_retry=true，UI 卡片右上角出現「重試」icon
```

---

## F3. 貼網址（Web）

```
/add → Tab「🔗 從網址」→ 貼 URL → 「解析」
  路由判斷 source_type：
    - github.com/<owner>/<repo>          → Octokit 抓 SKILL.md / skill.md / README.md
    - github.com/.../tree/<branch>/<path>→ 抓該路徑 SKILL.md
    - gist.github.com/...                → fetch raw
    - 其他 URL                           → **SSRF 檢查** → fetch + Readability
  抓到原始 markdown → Claude Haiku 解析：
    { name, description, category, tags[], summary_zh, summary_en, content }
  → 預覽頁 → 使用者微調 → 儲存（snapshot_at = now()）
```

### F3 錯誤路徑
| 錯誤 | 使用者看到 |
|---|---|
| URL 抓取 timeout / 404 | 「抓取失敗：[reason]，改用手動新增？」+ 連結到 F2 |
| LLM 回傳非法 JSON | 「自動分類失敗，已先存草稿，稍後可重試」（入庫但 needs_retry=true） |
| Claude 429 | 指數退避 3 次，仍失敗則同上 |
| GitHub 429 | 顯示 `X-RateLimit-Reset` 時間，提示何時重試 |
| SSRF 命中 deny-list | 「不允許私有網段 URL」 |

---

## F4. CLI 收藏（新增）

```
# 安裝
$ pnpm add -g @skillshub/cli
$ skillshub config --url https://skillshub.looptw.com --token <API_TOKEN>
  （token 寫入 ~/.skillshub/config.json）

# 使用
$ skillshub add https://github.com/xxx/yyy
→ CLI 打 POST /api/skills/from-url
→ 伺服器走 F3 流程
→ CLI 顯示：
  ✓ fetched (SKILL.md from github.com/xxx/yyy)
  ✓ categorized (dev-tools)
  ✓ saved (id: 8f3a-...)
  View: https://skillshub.looptw.com/skills/8f3a...

$ skillshub list --category=testing
$ skillshub list --tag=playwright
$ skillshub search "爬蟲"
$ skillshub show <id>      # 直接輸出 SKILL.md 到 stdout
$ skillshub rm <id>
```

**實作**：pnpm workspace 下 `packages/cli/`，共用 `packages/api-client/`（zod schema 共用）。

---

## F5. 自動尋找熱門（M4）

```
/discover → 顯示候選來源：
  - GitHub trending（topic: claude-skill）
  - awesome-claude-skills 最新更新
勾選 → 「抓取」→ 背景 job（同 process，非 Redis queue）
輸出候選清單 → 使用者勾選要收藏 → 批次入庫
（已收藏項目灰階 + 「已收藏」badge）
快取：trending 結果 6 小時
```

---

## F6. 瀏覽與搜尋

```
/dashboard
  左側：分類樹（category + tags 聚合）
  主區：skill 卡片 / 列表切換
  頂部：
    - 搜尋框（debounce 300ms → /api/skills/search，打 SQLite FTS5）
    - 排序（最新 / 最舊 / 最常被 Claude 叫用）← 後者來自 audit_events
    - 篩選（來源、需重試）
  卡片：name、description、category badge、tags、source_type icon、**本週被叫用次數**
  點卡片 → /skills/:id
```

**/skills/:id**：
- Markdown 渲染 content
- 右側：metadata、source_url 連結、「手動刷新 snapshot」、「編輯」、「刪除」、「重試分類」（若 needs_retry）
- 下方：最近 7 天此 skill 被叫用的 event log（來自 audit_events）

---

## F7. 編輯 / 刪除 / 手動 refresh

```
/skills/:id → 「編輯」→ 表單 → PUT /api/skills/:id
              → 「刪除」→ confirm → DELETE /api/skills/:id
              → 「手動刷新 snapshot」→ 若 source_url 存在，重跑 F3 抓取
```

---

## F8. `/admin/stats` 觀察頁

```
/admin/stats
  看板：
    - 本週 top 10 被 Claude 叫用的 skill（from audit_events）
    - 每日 MCP search_skills + get_skill 呼叫量（line chart，近 30 天）
    - LLM token 用量（累計，換算成 USD）
    - 待重試分類（needs_retry=true）數量
    - SQLite 檔大小 + 最近備份時間
```

---

## F9. Auto-Snapshot Cron（背景，新增）

```
每週日 03:00 Taipei → node-cron 觸發 → 背景 worker：
  1. SELECT skills WHERE source_url IS NOT NULL
  2. 對每筆 skill：
     a. 記錄 scan_start_time
     b. 查 updated_at < scan_start_time - 1h？（近 1h 手動改過的 skip）
     c. 重跑 F3 抓取 → 拿到新 content
     d. 寫入前檢查：SELECT updated_at WHERE id = ?
        若 updated_at > scan_start_time → skip（使用者剛編輯）
     e. 寫入 content, snapshot_at；不改 name/description/category（尊重使用者編輯）
  3. 結果寫 audit_events (event_type='cron_snapshot')
  4. 失敗清單 email 通知（或 /admin/stats 顯示）
```

**SQLite WAL 模式**避免寫入 block 讀取。

---

## F10. Claude Code 透過 MCP 取用（核心）

### 一次性設定
```json
// ~/.claude.json
{
  "mcpServers": {
    "skillshub": {
      "type": "http",
      "url": "https://skillshub.looptw.com/mcp",
      "headers": { "Authorization": "Bearer <API_TOKEN>" }
    }
  }
}
```

### 每次使用
```
我：「幫我寫 playwright 爬蟲」
Claude Code 內部：
  1. 判斷需要 skill → search_skills(q="playwright scraping")
  2. MCP server：
     a. 驗證 token
     b. SQLite FTS5 查詢
     c. 寫 audit_events (event_type='mcp_search', tool_name='Claude Code')
     d. 回傳 top 5 候選（不含完整 content，只有 id + summary）
  3. Claude 選一個 → get_skill(id="abc")
  4. MCP 回完整 content + 寫 audit_events (event_type='mcp_get')
  5. Claude 把 content 當 context → 照 skill 步驟執行
```

---

## F11. 匯出 / 匯入

```
/settings → 「匯出全部」→ zip：
  skills/<slug>/SKILL.md
  skills/<slug>/meta.json
  audit_events.jsonl
  index.json

「匯入」→ 上傳 zip → 預覽 → 勾選 → 批次入庫
```

---

## 附錄：頁面地圖（Approach D）

```
/                   首頁（未登入導向 /login；已登入 → /dashboard）
/login              密碼登入
/dashboard          我的 skills 書櫃
/skills/:id         單一 skill 詳細
/skills/new         新增（3 tab）
/discover           自動尋找熱門（M4）
/settings           API token + 匯入 / 匯出
/admin/stats        觀察頁
/api/*              REST API（給 CLI）
/mcp                MCP Server endpoint

已刪除：
  ~~/u/:username~~        公開頁（不做 public）
  ~~/u/:username/:slug~~  同上
  ~~/explore~~            公開探索頁
  ~~/settings/api~~       併入 /settings
```
