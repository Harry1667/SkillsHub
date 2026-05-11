import { NextResponse } from "next/server";
import { getSessionFromCookies, verifyApiToken } from "@/lib/auth";
import { deleteSkill, getSkill, logAudit } from "@/lib/skills";

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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await isAuthed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const skill = getSkill(id);
  if (!skill) return NextResponse.json({ message: "not found" }, { status: 404 });
  logAudit({ eventType: "api_get", skillId: id, toolName: auth.via === "api" ? "API" : "Web" });
  return NextResponse.json(skill);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await isAuthed(req);
  if (!auth.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const { id } = await params;
  deleteSkill(id);
  logAudit({ eventType: "skill_delete", skillId: id, toolName: auth.via === "api" ? "API" : "Web" });
  return NextResponse.json({ ok: true });
}
