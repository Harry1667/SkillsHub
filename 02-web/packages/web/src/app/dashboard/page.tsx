"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Compass, LineChart, Plus, Settings } from "lucide-react";

type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string;
  sourceType: string;
  needsRetry: number;
  createdAt: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const url = debounced ? `/api/skills?q=${encodeURIComponent(debounced)}` : "/api/skills";
  const { data, isLoading } = useSWR<{ items: Skill[]; total: number }>(url, fetcher, {
    revalidateOnFocus: false,
  });

  const items = data?.items ?? [];

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Skills Hub</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `共 ${data.total} 個 skill` : "載入中…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/discover">
              <Compass className="h-4 w-4" /> 探索
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/stats">
              <LineChart className="h-4 w-4" /> Stats
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">
              <Settings className="h-4 w-4" /> 設定
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            登出
          </Button>
          <Button asChild>
            <Link href="/skills/new">
              <Plus className="h-4 w-4" /> 新增
            </Link>
          </Button>
        </div>
      </header>

      <div className="mb-6">
        <Input
          placeholder="搜尋（name / description / content 全文）…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">載入中…</p>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="mb-2 text-lg font-medium">
            {debounced ? "沒有符合的 skill" : "書櫃是空的"}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {debounced ? "試試別的關鍵字" : "開始收藏你的第一個 skill 吧"}
          </p>
          {!debounced && (
            <Button asChild>
              <Link href="/skills/new">
                <Plus className="h-4 w-4" /> 新增 skill
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => {
          const tags: string[] = safeJson(s.tags) ?? [];
          return (
            <Link
              key={s.id}
              href={`/skills/${s.id}`}
              className="group rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 font-medium group-hover:underline">{s.name}</h3>
                {s.needsRetry === 1 && (
                  <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                    待重試
                  </span>
                )}
              </div>
              {s.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1 text-xs">
                <span className="rounded bg-secondary px-2 py-0.5">{s.category}</span>
                <span className="text-muted-foreground">· {s.sourceType}</span>
                {tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded bg-muted px-2 py-0.5">
                    #{t}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
