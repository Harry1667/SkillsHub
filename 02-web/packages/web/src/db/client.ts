import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "../../data/skills.db");

// Ensure dir exists
import { mkdirSync } from "node:fs";
mkdirSync(path.dirname(dbPath), { recursive: true });

// 同一個 process 只開一次
const globalForDb = globalThis as unknown as { sqlite?: Database.Database };
const sqlite =
  globalForDb.sqlite ??
  (() => {
    const s = new Database(dbPath);
    s.pragma("journal_mode = WAL");
    s.pragma("foreign_keys = ON");
    s.pragma("synchronous = NORMAL");
    return s;
  })();
if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { sqlite };
