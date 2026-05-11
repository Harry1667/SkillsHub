import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies, verifyApiToken } from "@/lib/auth";
import { fetchFromUrl, SsrfError } from "@/lib/fetcher";
import { categorize } from "@/lib/categorize";
import { createSkill, logAudit } from "@/lib/skills";

const bodySchema = z.object({ url: z.string().url() });

async function isAuthed(req: Request): Promise<{ ok: boolean; via: "session" | "api" | null }> {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const uid = verifyApiToken(bearer.slice(7));
    if (uid) return { ok: true, via: "api" };
  }
  const sess = await getSessionFromCookies();
  if (sess.ok) return { ok: true, via: "session" };
  return { ok: false, via: null };
}

export async function POST(req: Request) {
  const auth = await isAuthed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "bad request", errors: parsed.error.flatten() }, { status: 400 });
  }

  // 1. 抓
  let fetched;
  try {
    fetched = await fetchFromUrl(parsed.data.url);
  } catch (e: any) {
    const ssrf = e instanceof SsrfError;
    return NextResponse.json(
      {
        message: ssrf ? `SSRF 防護：${e.message}` : `抓取失敗：${e?.message ?? String(e)}`,
      },
      { status: ssrf ? 400 : 502 }
    );
  }

  // 2. 分類（失敗就降級，不擋入庫）
  const cat = await categorize(fetched.content);

  const nowSec = Math.floor(Date.now() / 1000);
  const input = cat.ok
    ? {
        name: cat.value.name,
        description: cat.value.description,
        content: fetched.content,
        source_url: fetched.sourceUrl,
        source_type: fetched.sourceType,
        category: cat.value.category,
        tags: cat.value.tags,
        summary_zh: cat.value.summary_zh,
        summary_en: cat.value.summary_en,
      }
    : {
        name: fetched.title || "Untitled",
        description: "",
        content: fetched.content,
        source_url: fetched.sourceUrl,
        source_type: fetched.sourceType,
        category: "uncategorized" as const,
        tags: [],
        summary_zh: "",
        summary_en: "",
      };

  const skill = createSkill(input);

  // needs_retry 預設是 0，若分類失敗改為 1 並更新 snapshot_at
  if (!cat.ok) {
    const { sqlite } = await import("@/db/client");
    sqlite
      .prepare("UPDATE skills SET needs_retry = 1, snapshot_at = ? WHERE id = ?")
      .run(nowSec, skill.id);
  } else {
    const { sqlite } = await import("@/db/client");
    sqlite.prepare("UPDATE skills SET snapshot_at = ? WHERE id = ?").run(nowSec, skill.id);
  }

  logAudit({
    eventType: "skill_from_url",
    skillId: skill.id,
    toolName: auth.via === "api" ? "API" : "Web",
    metadata: {
      url: parsed.data.url,
      categorized: cat.ok,
      ...(cat.ok
        ? {
            tokens: cat.tokens,
            provider: cat.actualProvider,
            model: cat.actualModel,
          }
        : { reason: cat.reason }),
    },
  });

  return NextResponse.json(
    { ...skill, categorized: cat.ok, reason: cat.ok ? undefined : cat.reason },
    { status: 201 }
  );
}
