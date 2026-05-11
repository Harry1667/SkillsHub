import Link from "next/link";
import { statsOverview, recentEvents } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default function AdminStatsPage() {
  const s = statsOverview();
  const events = recentEvents(30);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <nav className="mb-4">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← 回到 dashboard
        </Link>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold">/admin/stats</h1>

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="總 skill 數" value={s.totalSkills} />
        <Card label="待重試分類" value={s.needsRetry} tone={s.needsRetry > 0 ? "warn" : undefined} />
        <Card label="本週 Agent 呼叫" value={s.weekCalls} />
        <Card label="今日 Agent 呼叫" value={s.dayCalls} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">本週 top 被 Agent 叫用</h2>
        {s.topSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">（還沒有 MCP/API 取用紀錄）</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {s.topSkills.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3">
                <span className="w-6 text-muted-foreground">#{i + 1}</span>
                <Link href={`/skills/${t.id}`} className="flex-1 truncate hover:underline">
                  {t.name}
                </Link>
                <span className="text-xs text-muted-foreground">{t.category}</span>
                <span className="w-12 text-right font-mono">{t.calls}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">近 30 天 MCP 呼叫量</h2>
        {s.dailyCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">（還沒資料）</p>
        ) : (
          <div className="flex items-end gap-1 rounded border p-3 text-xs" style={{ height: 120 }}>
            {s.dailyCalls.map((d) => {
              const max = Math.max(...s.dailyCalls.map((x) => x.c), 1);
              const h = Math.round((d.c / max) * 96);
              return (
                <div key={d.day} className="flex flex-col items-center gap-1" style={{ minWidth: 18 }}>
                  <div className="w-full bg-primary" style={{ height: h }} title={`${d.day}: ${d.c}`} />
                  <span className="text-[10px] text-muted-foreground">{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">系統</h2>
        <dl className="text-sm">
          <InfoRow label="DB 大小" value={humanBytes(s.dbSizeBytes)} />
          <InfoRow
            label="最近 auto-snapshot"
            value={
              s.recentSnapshot
                ? `${new Date(s.recentSnapshot.created_at * 1000).toLocaleString("zh-Hant-TW")} · ${s.recentSnapshot.metadata ?? ""}`
                : "（還沒跑過）"
            }
          />
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">近 30 筆 audit 事件</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b text-left">
              <tr>
                <th className="py-1 pr-3">time</th>
                <th className="py-1 pr-3">event</th>
                <th className="py-1 pr-3">tool</th>
                <th className="py-1 pr-3">skill</th>
                <th className="py-1 pr-3">metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-muted">
                  <td className="py-1 pr-3 text-muted-foreground">
                    {new Date(e.created_at * 1000).toLocaleString("zh-Hant-TW", { hour12: false })}
                  </td>
                  <td className="py-1 pr-3 font-mono">{e.event_type}</td>
                  <td className="py-1 pr-3">{e.tool_name ?? "-"}</td>
                  <td className="py-1 pr-3 max-w-48 truncate">
                    {e.skill_id ? (
                      <Link href={`/skills/${e.skill_id}`} className="hover:underline">
                        {e.skill_name ?? e.skill_id.slice(0, 8)}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-1 pr-3 max-w-md truncate text-muted-foreground">
                    {e.metadata ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Card({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === "warn" ? "border-destructive/30" : ""}`}>
      <div className={`text-xs ${tone === "warn" ? "text-destructive" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-0.5">
      <dt className="w-32 text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
