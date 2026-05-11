import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { getSettings, setGithubToken } from "@/lib/settings";
import { logAudit } from "@/lib/skills";

// Settings 只允許 Web session（非 API token）存取 —— 避免洩漏 UI 設定給第三方
async function authed() {
  const sess = await getSessionFromCookies();
  return sess.ok;
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  return NextResponse.json(getSettings());
}

const patchSchema = z.object({
  githubToken: z
    .string()
    .min(0)
    .max(200)
    .optional(),
});

export async function PATCH(req: Request) {
  if (!(await authed())) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const json = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "bad request", errors: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.githubToken !== undefined) {
    const val = parsed.data.githubToken;
    setGithubToken(val === "" ? null : val);
    logAudit({
      eventType: "settings_update",
      toolName: "Web",
      metadata: { field: "githubToken", cleared: val === "" },
    });
  }
  return NextResponse.json(getSettings());
}
