import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * 取 GitHub token。DB 優先，fallback env var。
 * DB 是使用者在 /settings UI 填的；env 是部署時 bootstrap 用。
 */
export function getGithubToken(): string | undefined {
  const row = db.select({ t: users.githubToken }).from(users).where(eq(users.id, 1)).get();
  const fromDb = row?.t?.trim();
  if (fromDb) return fromDb;
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  return fromEnv || undefined;
}

export function setGithubToken(token: string | null) {
  const clean = token?.trim() || null;
  db.update(users).set({ githubToken: clean }).where(eq(users.id, 1)).run();
}

export function getSettings(): {
  githubToken: { set: boolean; lastFour: string | null; source: "db" | "env" | "none" };
} {
  const row = db.select({ t: users.githubToken }).from(users).where(eq(users.id, 1)).get();
  const fromDb = row?.t?.trim() || null;
  const fromEnv = process.env.GITHUB_TOKEN?.trim() || null;
  const effective = fromDb || fromEnv;
  return {
    githubToken: {
      set: !!effective,
      lastFour: effective ? effective.slice(-4) : null,
      source: fromDb ? "db" : fromEnv ? "env" : "none",
    },
  };
}
