import { NextResponse } from "next/server";
import { skillInputSchema } from "@skillshub/shared/schemas";
import { getSessionFromCookies, verifyApiToken } from "@/lib/auth";
import { createSkill, listSkills, logAudit, searchSkills } from "@/lib/skills";

async function isAuthed(req: Request): Promise<{ ok: boolean; via: "session" | "api" | null }> {
  // API token 優先（給 CLI / MCP 用）
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const token = bearer.slice(7);
    const uid = verifyApiToken(token);
    if (uid) return { ok: true, via: "api" };
  }
  const sess = await getSessionFromCookies();
  if (sess.ok) return { ok: true, via: "session" };
  return { ok: false, via: null };
}

export async function GET(req: Request) {
  const auth = await isAuthed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category") || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  if (q) {
    const items = searchSkills(q, limit);
    logAudit({ eventType: "api_search", toolName: auth.via === "api" ? "API" : "Web", metadata: { q } });
    return NextResponse.json({ items, total: items.length, query: q });
  }

  const { items, total } = listSkills({ category, limit, offset });
  logAudit({ eventType: "api_list", toolName: auth.via === "api" ? "API" : "Web" });
  return NextResponse.json({ items, total });
}

export async function POST(req: Request) {
  const auth = await isAuthed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = skillInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "bad request", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const skill = createSkill(parsed.data);
  logAudit({
    eventType: "skill_create",
    skillId: skill.id,
    toolName: auth.via === "api" ? "API" : "Web",
  });
  return NextResponse.json(skill, { status: 201 });
}
