import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), "../../.env") });

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";

// migrate.ts 直接跑在 Node 下，拿得到 cwd
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "../../data/skills.db");

mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

console.log(`[migrate] target db: ${dbPath}`);
migrate(db, { migrationsFolder: "./drizzle" });

// 建 FTS5 virtual table（Drizzle 尚未原生支援 FTS5）
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
    name, description, content,
    content='skills', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
    INSERT INTO skills_fts(rowid, name, description, content)
    VALUES (new.rowid, new.name, new.description, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
    INSERT INTO skills_fts(skills_fts, rowid, name, description, content)
    VALUES('delete', old.rowid, old.name, old.description, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
    INSERT INTO skills_fts(skills_fts, rowid, name, description, content)
    VALUES('delete', old.rowid, old.name, old.description, old.content);
    INSERT INTO skills_fts(rowid, name, description, content)
    VALUES (new.rowid, new.name, new.description, new.content);
  END;

  CREATE INDEX IF NOT EXISTS idx_skills_created ON skills(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
  CREATE INDEX IF NOT EXISTS idx_audit_time_type ON audit_events(created_at DESC, event_type);
`);

console.log("[migrate] done");
sqlite.close();
