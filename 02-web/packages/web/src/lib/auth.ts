import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { users, sessions } from "@/db/schema";

const SESSION_COOKIE = "skillshub_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_SECONDS = 60 * 15; // 15 min

export type AuthCheckResult =
  | { ok: true; userId: number }
  | { ok: false; reason: "no_session" | "expired" | "invalid" };

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export async function getSessionFromCookies(): Promise<AuthCheckResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, reason: "no_session" };

  const now = nowSec();
  const rows = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, now)))
    .all();
  if (rows.length === 0) return { ok: false, reason: "expired" };
  return { ok: true, userId: rows[0].userId };
}

export async function login(
  password: string
): Promise<{ ok: true } | { ok: false; reason: "locked" | "invalid"; retryAfter?: number }> {
  const user = db.select().from(users).where(eq(users.id, 1)).get();
  if (!user) return { ok: false, reason: "invalid" };

  const now = nowSec();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "locked", retryAfter: user.lockedUntil - now };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const nextFailCount = user.failedLoginCount + 1;
    const shouldLock = nextFailCount >= LOCK_THRESHOLD;
    db.update(users)
      .set({
        failedLoginCount: shouldLock ? 0 : nextFailCount,
        lockedUntil: shouldLock ? now + LOCK_DURATION_SECONDS : null,
      })
      .where(eq(users.id, 1))
      .run();
    return { ok: false, reason: "invalid" };
  }

  // 成功 → 重置計數，寫 session
  db.update(users)
    .set({ failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, 1))
    .run();

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = now + SESSION_TTL_SECONDS;
  db.insert(sessions).values({ id: token, userId: 1, expiresAt }).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return { ok: true };
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    db.delete(sessions).where(eq(sessions.id, token)).run();
    cookieStore.delete(SESSION_COOKIE);
  }
}

// 驗證 API token（Bearer header）
export function verifyApiToken(rawToken: string | null): number | null {
  if (!rawToken) return null;
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const user = db.select().from(users).where(eq(users.apiTokenHash, hash)).get();
  return user?.id ?? null;
}
