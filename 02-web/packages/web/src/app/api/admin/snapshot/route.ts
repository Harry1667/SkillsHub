import { NextResponse } from "next/server";
import { getSessionFromCookies, verifyApiToken } from "@/lib/auth";
import { runSnapshotSweep } from "@/lib/cron";

// 手動觸發 snapshot sweep（給 debug / 急需更新時用）
export async function POST(req: Request) {
  const bearer = req.headers.get("authorization");
  const byApi = bearer?.startsWith("Bearer ") && verifyApiToken(bearer.slice(7)) !== null;
  const sess = await getSessionFromCookies();
  if (!byApi && !sess.ok) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const result = await runSnapshotSweep();
  return NextResponse.json(result);
}
