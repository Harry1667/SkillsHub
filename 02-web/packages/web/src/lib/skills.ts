import "server-only";
import { v4 as uuidv4 } from "uuid";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, sqlite } from "@/db/client";
import { skills, auditEvents, type Skill } from "@/db/schema";
import type { SkillInput } from "@skillshub/shared/schemas";

export function createSkill(input: SkillInput): Skill {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const row = {
    id,
    name: input.name,
    description: input.description,
    content: input.content,
    sourceUrl: input.source_url || null,
    sourceType: input.source_type,
    category: input.category,
    tags: JSON.stringify(input.tags),
    summaryZh: input.summary_zh,
    summaryEn: input.summary_en,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(skills).values(row).run();
  return db.select().from(skills).where(eq(skills.id, id)).get()!;
}

export function getSkill(id: string): Skill | undefined {
  return db.select().from(skills).where(eq(skills.id, id)).get();
}

export function listSkills(opts: {
  category?: string;
  limit?: number;
  offset?: number;
}): { items: Skill[]; total: number } {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const where = opts.category ? eq(skills.category, opts.category) : undefined;

  const items = db
    .select()
    .from(skills)
    .where(where)
    .orderBy(desc(skills.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(skills)
    .where(where)
    .get();

  return { items, total: totalRow?.count ?? 0 };
}

export function searchSkills(query: string, limit = 20): Skill[] {
  // SQLite FTS5 search。用 sanitized MATCH query（escape 特殊字元）。
  const safe = query.replace(/["']/g, " ").trim();
  if (!safe) return [];
  const ftsQuery = safe
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"`) // 完全比對單詞，避免 FTS5 syntax 衝突
    .join(" ");

  const stmt = sqlite.prepare(`
    SELECT s.*
    FROM skills_fts f
    JOIN skills s ON s.rowid = f.rowid
    WHERE skills_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  const rows = stmt.all(ftsQuery, limit) as any[];
  // drizzle 不在這裡介入；手動把 snake_case 欄位轉成 Skill shape
  return rows.map(mapRow);
}

function mapRow(r: any): Skill {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    content: r.content,
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    snapshotAt: r.snapshot_at,
    category: r.category,
    tags: r.tags,
    summaryZh: r.summary_zh,
    summaryEn: r.summary_en,
    needsRetry: r.needs_retry,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function deleteSkill(id: string) {
  db.delete(skills).where(eq(skills.id, id)).run();
}

export function logAudit(event: {
  eventType: string;
  skillId?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}) {
  db.insert(auditEvents)
    .values({
      eventType: event.eventType,
      skillId: event.skillId,
      toolName: event.toolName,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    })
    .run();
}
