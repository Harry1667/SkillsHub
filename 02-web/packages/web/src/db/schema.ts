import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 只有一筆 row（id=1）。放 table 方便未來延伸。
export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull().default("admin"),
  passwordHash: text("password_hash").notNull(),
  apiTokenHash: text("api_token_hash").notNull(), // sha256 hex
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: integer("locked_until"), // unix seconds
  // UI 可編輯的 secrets（覆蓋 env 同名 var）。null = 未設定 / 回退 env。
  githubToken: text("github_token"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // session token
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(), // unix seconds
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(), // uuid v4
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(), // markdown
  sourceUrl: text("source_url"),
  sourceType: text("source_type").notNull().default("manual"), // github|gist|url|manual
  snapshotAt: integer("snapshot_at"),
  category: text("category").notNull().default("uncategorized"),
  tags: text("tags").notNull().default("[]"), // JSON array as text
  summaryZh: text("summary_zh").notNull().default(""),
  summaryEn: text("summary_en").notNull().default(""),
  needsRetry: integer("needs_retry").notNull().default(0), // 0|1
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(), // mcp_search|mcp_get|api_list|api_get|cron_snapshot|login|login_failed
  skillId: text("skill_id"),
  toolName: text("tool_name"), // Claude Code|CLI|Web
  metadata: text("metadata"), // JSON
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
