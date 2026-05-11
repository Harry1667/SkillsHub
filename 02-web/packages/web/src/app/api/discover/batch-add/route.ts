import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies, verifyApiToken } from "@/lib/auth";
import { fetchFromUrl, SsrfError } from "@/lib/fetcher";
import { categorize } from "@/lib/categorize";
import { createSkill, logAudit } from "@/lib/skills";
import { sqlite } from "@/db/client";
import { normalizeGithubUrl } from "@/lib/discover";

const bodySchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20), // 一次最多 20 個避免 LLM 噴預算
});

async function authed(req: Request): Promise<{ ok: boolean; via: "session" | "api" | null }> {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && verifyApiToken(bearer.slice(7))) {
    return { ok: true, via: "api" };
  }
  const sess = await getSessionFromCookies();
  if (sess.ok) return { ok: true, via: "session" };
  return { ok: false, via: null };
}

/**
 * 批次把候選 URL 走 from-url 流程（抓取 → 分類 → 入庫）。
 * 並行處理但限制 concurrency=3 避免打爆 proxycli。
 */
export async function POST(req: Request) {
  const auth = await authed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "bad request", errors: parsed.error.flatten() }, { status: 400 });
  }

  // dedupe：把已收藏的 URL 踢掉
  const collected = sqlite
    .prepare("SELECT source_url FROM skills WHERE source_url IS NOT NULL")
    .all() as { source_url: string }[];
  const collectedSet = new Set(collected.map((r) => normalizeGithubUrl(r.source_url)));
  const todo = parsed.data.urls.filter((u) => !collectedSet.has(normalizeGithubUrl(u)));

  type Result =
    | { url: string; ok: true; id: string; name: string; categorized: boolean }
    | { url: string; ok: false; error: string };

  const results: Result[] = [];
  const CONCURRENCY = 3;
  const tool = auth.via === "api" ? "API" : "Web";

  async function run(url: string): Promise<Result> {
    try {
      const fetched = await fetchFromUrl(url);
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
      if (!cat.ok) {
        sqlite.prepare("UPDATE skills SET needs_retry = 1, snapshot_at = ? WHERE id = ?").run(nowSec, skill.id);
      } else {
        sqlite.prepare("UPDATE skills SET snapshot_at = ? WHERE id = ?").run(nowSec, skill.id);
      }
      logAudit({
        eventType: "discover_batch_item",
        skillId: skill.id,
        toolName: tool,
        metadata: { url, categorized: cat.ok },
      });
      return { url, ok: true, id: skill.id, name: skill.name, categorized: cat.ok };
    } catch (e: any) {
      const reason = e instanceof SsrfError ? `SSRF: ${e.message}` : e?.message ?? String(e);
      return { url, ok: false, error: reason };
    }
  }

  // concurrency=3 的 worker pool
  const queue = todo.slice();
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const url = queue.shift()!;
          const r = await run(url);
          results.push(r);
        }
      })()
    );
  }
  await Promise.all(workers);

  const added = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const skipped = parsed.data.urls.length - todo.length;

  logAudit({
    eventType: "discover_batch",
    toolName: tool,
    metadata: { requested: parsed.data.urls.length, added, failed, skipped },
  });

  return NextResponse.json({ added, failed, skipped, results });
}
