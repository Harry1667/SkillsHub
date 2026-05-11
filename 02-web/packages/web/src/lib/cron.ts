import "server-only";
import cron from "node-cron";
import { db, sqlite } from "@/db/client";
import { skills, auditEvents } from "@/db/schema";
import { eq, and, gt, isNotNull, lt, or } from "drizzle-orm";
import { fetchFromUrl } from "./fetcher";
import { categorize } from "./categorize";

let _started = false;

/**
 * 每週日 03:00（預設 Asia/Taipei）重抓所有 skill 的 source_url。
 * 流程：
 *   1. scan_start = now
 *   2. for each skill with source_url and (updated_at < scan_start - 1h)
 *      a. fetch + categorize
 *      b. 寫入前再檢查 updated_at 沒變過（使用者沒剛編輯）
 *      c. 更新 content + snapshot_at；保留 name/description/category（使用者編輯優先）
 *   3. log audit_events(cron_snapshot)
 */
export function startCron() {
  if (_started) return;
  _started = true;
  const schedule = process.env.CRON_SCHEDULE || "0 3 * * 0";
  const timezone = process.env.CRON_TIMEZONE || "Asia/Taipei";

  if (!cron.validate(schedule)) {
    console.warn(`[cron] invalid CRON_SCHEDULE: ${schedule}`);
    return;
  }

  cron.schedule(schedule, () => runSnapshotSweep().catch((e) => console.error("[cron] error", e)), {
    timezone,
  } as any);

  console.log(`[cron] auto-snapshot scheduled: ${schedule} (${timezone})`);
}

export async function runSnapshotSweep(): Promise<{
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - 3600; // 近 1 小時內手動改過的 skip

  const targets = db
    .select()
    .from(skills)
    .where(and(isNotNull(skills.sourceUrl), lt(skills.updatedAt, cutoff)))
    .all();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of targets) {
    if (!s.sourceUrl) continue;
    try {
      const fetched = await fetchFromUrl(s.sourceUrl);
      // 寫入前二次檢查
      const fresh = db.select({ updatedAt: skills.updatedAt }).from(skills).where(eq(skills.id, s.id)).get();
      if (!fresh || fresh.updatedAt !== s.updatedAt) {
        skipped++;
        continue;
      }
      // 內容沒變 → skip
      if (fetched.content === s.content) {
        sqlite.prepare("UPDATE skills SET snapshot_at = ? WHERE id = ?").run(nowSec, s.id);
        skipped++;
        continue;
      }
      // 更新 content + snapshot_at（不動 name/description/category/tags）
      sqlite
        .prepare("UPDATE skills SET content = ?, snapshot_at = ?, updated_at = ? WHERE id = ?")
        .run(fetched.content, nowSec, nowSec, s.id);
      updated++;
    } catch (e: any) {
      failed++;
      db.insert(auditEvents)
        .values({
          eventType: "cron_snapshot_fail",
          skillId: s.id,
          toolName: "cron",
          metadata: JSON.stringify({ error: String(e?.message ?? e) }),
        })
        .run();
    }
  }

  db.insert(auditEvents)
    .values({
      eventType: "cron_snapshot",
      toolName: "cron",
      metadata: JSON.stringify({ scanned: targets.length, updated, skipped, failed }),
    })
    .run();

  console.log(
    `[cron] snapshot sweep: scanned=${targets.length} updated=${updated} skipped=${skipped} failed=${failed}`
  );
  return { scanned: targets.length, updated, skipped, failed };
}
