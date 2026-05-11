import { NextResponse } from "next/server";
import { getSessionFromCookies, verifyApiToken } from "@/lib/auth";
import { discoverGithubSearch, discoverAwesome } from "@/lib/discover";
import { logAudit } from "@/lib/skills";

async function authed(req: Request): Promise<{ ok: boolean; via: "session" | "api" | null }> {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && verifyApiToken(bearer.slice(7))) {
    return { ok: true, via: "api" };
  }
  const sess = await getSessionFromCookies();
  if (sess.ok) return { ok: true, via: "session" };
  return { ok: false, via: null };
}

export async function GET(req: Request) {
  const auth = await authed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const source = url.searchParams.get("source") || "github-search";
  const force = url.searchParams.get("force") === "1";

  try {
    if (source === "github-search") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100);
      const items = await discoverGithubSearch({ limit, force });
      logAudit({
        eventType: "discover_github",
        toolName: auth.via === "api" ? "API" : "Web",
        metadata: { count: items.length, force },
      });
      return NextResponse.json({ source, items, total: items.length });
    }
    if (source === "awesome") {
      const repoUrl = url.searchParams.get("url");
      if (!repoUrl) {
        return NextResponse.json({ message: "awesome 來源需要 ?url=..." }, { status: 400 });
      }
      const items = await discoverAwesome(repoUrl, { force });
      logAudit({
        eventType: "discover_awesome",
        toolName: auth.via === "api" ? "API" : "Web",
        metadata: { repoUrl, count: items.length, force },
      });
      return NextResponse.json({ source, repoUrl, items, total: items.length });
    }
    return NextResponse.json({ message: `未知 source: ${source}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { message: `探索失敗：${e?.message ?? String(e)}` },
      { status: e?.status === 404 ? 404 : 502 }
    );
  }
}
