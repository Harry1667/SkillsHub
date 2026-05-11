import "server-only";
import { sqlite } from "@/db/client";

export function statsOverview() {
  const nowSec = Math.floor(Date.now() / 1000);
  const weekAgo = nowSec - 7 * 86400;
  const dayAgo = nowSec - 86400;

  const totalSkills = (sqlite.prepare("SELECT COUNT(*) as c FROM skills").get() as { c: number }).c;
  const needsRetry = (sqlite.prepare("SELECT COUNT(*) as c FROM skills WHERE needs_retry = 1").get() as { c: number }).c;

  const weekCalls = (
    sqlite
      .prepare(
        `SELECT COUNT(*) as c FROM audit_events
         WHERE created_at > ? AND event_type IN ('mcp_search','mcp_get','mcp_list','api_list','api_get','api_search')`
      )
      .get(weekAgo) as { c: number }
  ).c;

  const dayCalls = (
    sqlite
      .prepare(
        `SELECT COUNT(*) as c FROM audit_events
         WHERE created_at > ? AND event_type IN ('mcp_search','mcp_get','mcp_list','api_list','api_get','api_search')`
      )
      .get(dayAgo) as { c: number }
  ).c;

  const topSkills = sqlite
    .prepare(
      `SELECT s.id, s.name, s.category, COUNT(a.id) as calls
         FROM audit_events a JOIN skills s ON s.id = a.skill_id
        WHERE a.event_type IN ('mcp_get','api_get')
          AND a.created_at > ?
        GROUP BY s.id
        ORDER BY calls DESC
        LIMIT 10`
    )
    .all(weekAgo) as { id: string; name: string; category: string; calls: number }[];

  const dailyCalls = sqlite
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at, 'unixepoch', 'localtime') as day, COUNT(*) as c
         FROM audit_events
        WHERE created_at > ? AND event_type LIKE 'mcp_%'
        GROUP BY day
        ORDER BY day ASC`
    )
    .all(nowSec - 30 * 86400) as { day: string; c: number }[];

  const recentSnapshot = sqlite
    .prepare(
      `SELECT created_at, metadata FROM audit_events
        WHERE event_type = 'cron_snapshot'
        ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { created_at: number; metadata: string | null } | undefined;

  const dbSize =
    (sqlite.prepare("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()").get() as {
      size: number;
    }).size;

  return {
    totalSkills,
    needsRetry,
    weekCalls,
    dayCalls,
    topSkills,
    dailyCalls,
    recentSnapshot,
    dbSizeBytes: dbSize,
  };
}

export function recentEvents(limit = 50) {
  return sqlite
    .prepare(
      `SELECT e.id, e.event_type, e.skill_id, e.tool_name, e.metadata, e.created_at, s.name as skill_name
         FROM audit_events e
         LEFT JOIN skills s ON s.id = e.skill_id
        ORDER BY e.created_at DESC
        LIMIT ?`
    )
    .all(limit) as {
    id: number;
    event_type: string;
    skill_id: string | null;
    tool_name: string | null;
    metadata: string | null;
    created_at: number;
    skill_name: string | null;
  }[];
}
