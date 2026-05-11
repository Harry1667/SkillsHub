import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

const bodySchema = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "bad request" }, { status: 400 });
  }
  const result = await login(parsed.data.password);
  if (!result.ok) {
    db.insert(auditEvents)
      .values({ eventType: result.reason === "locked" ? "login_locked" : "login_failed", toolName: "Web" })
      .run();
    if (result.reason === "locked") {
      return NextResponse.json(
        { message: `登入鎖定中，${Math.ceil(result.retryAfter! / 60)} 分鐘後再試` },
        { status: 429 }
      );
    }
    return NextResponse.json({ message: "密碼錯誤" }, { status: 401 });
  }
  db.insert(auditEvents).values({ eventType: "login", toolName: "Web" }).run();
  return NextResponse.json({ ok: true });
}
