import { NextResponse } from "next/server";
import { sqlite } from "@/db/client";

export function GET() {
  try {
    const row = sqlite.prepare("SELECT 1 as ok").get() as { ok: number };
    return NextResponse.json({ ok: row.ok === 1, db: "up", ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: (e as Error).message },
      { status: 503 }
    );
  }
}
