# SkillsHub

單人 AI Skills 收藏書櫃 + MCP Server — 用自然語言搜尋、管理你的 AI Prompt 技巧庫，並透過 MCP 協議對接 Claude Code。

## 功能
- Skill 新增 / 編輯 / 分類管理
- 全文搜尋（SQLite FTS5）
- MCP Server（JSON-RPC 2.0），讓 Claude Code 直接呼叫 Skills
- 週日 03:00 自動快照備份
- AI 輔助（proxycli → GPT-4o-mini / Gemini Flash）

## 技術棧
- Next.js 15（App Router）+ TypeScript
- better-sqlite3（FTS5 + WAL 模式）
- MCP Server（`/mcp` 端點）
- 部署：skillshub.looptw.com（port 3003）

## 快速開始
```bash
cd 02-web
cp .env.example .env
npm install
npm run dev
```

---

## English

A single-user library for your AI prompt skills, fronted by an MCP server. Search and manage your skill collection in natural language; Claude Code calls them directly through MCP.

### Features
- Add / edit / categorize skills
- Full-text search (SQLite FTS5)
- MCP server (JSON-RPC 2.0) — Claude Code invokes skills directly
- Auto snapshot backup every Sunday 03:00
- AI assistance via proxycli (GPT-4o-mini / Gemini Flash)

### Tech stack
- Next.js 15 (App Router) + TypeScript
- better-sqlite3 (FTS5 + WAL mode)
- MCP server (`/mcp` endpoint)
- Deployed at skillshub.looptw.com (port 3003)

### Quick start
```bash
cd 02-web
cp .env.example .env
npm install
npm run dev
```
