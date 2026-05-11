"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github, Link as LinkIcon, RefreshCw, Star } from "lucide-react";

type Tab = "github" | "awesome";

interface DiscoverItem {
  url: string;
  source: string;
  title: string;
  description: string | null;
  stars?: number;
  topics?: string[];
  section?: string | null;
  collected: boolean;
}

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("github");

  return (
    <main className="mx-auto max-w-6xl p-6">
      <nav className="mb-4">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← 回到 dashboard
        </Link>
      </nav>

      <h1 className="mb-6 text-2xl font-semibold">探索 skills</h1>

      <div className="mb-6 flex gap-1 rounded-md bg-muted p-1 text-sm">
        <button
          onClick={() => setTab("github")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 transition-colors",
            tab === "github" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Github className="h-4 w-4" /> GitHub topic:claude-skill
        </button>
        <button
          onClick={() => setTab("awesome")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 transition-colors",
            tab === "awesome" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LinkIcon className="h-4 w-4" /> 從 awesome 清單
        </button>
      </div>

      {tab === "github" ? <GithubTab /> : <AwesomeTab />}
    </main>
  );
}

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ───────────────────── GitHub Search tab ─────────────────────
function GithubTab() {
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discover?source=github-search${force ? "&force=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setItems(data.items);
    } catch (e: any) {
      setError(e.message || "抓取失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <DiscoverList
      items={items}
      loading={loading}
      error={error}
      onRefresh={() => load(true)}
      emptyHint="還沒找到候選。可能是 topic 沒被 tag，或 GitHub 限流。"
      header={
        <p className="text-sm text-muted-foreground">
          搜 GitHub 上 topic 是 <code className="text-xs">claude-skill / claude-skills / anthropic-skills / mcp-skill</code> 的 repos，按 star 排序。
        </p>
      }
    />
  );
}

// ───────────────────── Awesome tab ─────────────────────
function AwesomeTab() {
  const [url, setUrl] = useState("");
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    setItems(null);
    try {
      const res = await fetch(`/api/discover?source=awesome&url=${encodeURIComponent(url)}${force ? "&force=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setItems(data.items);
    } catch (e: any) {
      setError(e.message || "抓取失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-4 space-y-2"
      >
        <Label htmlFor="awesome-url">awesome-* repo URL</Label>
        <div className="flex gap-2">
          <Input
            id="awesome-url"
            type="url"
            placeholder="https://github.com/xxx/awesome-claude-skills"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading || !url}>
            {loading ? "解析中…" : "解析 README"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          會抓該 repo 的 README.md 並抽出所有 github.com 連結。快取 6 小時。
        </p>
      </form>

      <DiscoverList
        items={items}
        loading={loading}
        error={error}
        onRefresh={url ? () => load(true) : undefined}
        emptyHint="貼一個 awesome-* repo URL，按「解析 README」。"
      />
    </div>
  );
}

// ───────────────────── 通用清單 + 批次加 ─────────────────────
function DiscoverList({
  items,
  loading,
  error,
  onRefresh,
  emptyHint,
  header,
}: {
  items: DiscoverItem[] | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
  emptyHint: string;
  header?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<{ added: number; failed: number; skipped: number } | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setBatchResult(null);
  }, [items]);

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function selectAllUncollected() {
    if (!items) return;
    setSelected(new Set(items.filter((i) => !i.collected).slice(0, 20).map((i) => i.url)));
  }

  async function batchAdd() {
    if (selected.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/discover/batch-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setBatchResult({ added: data.added, failed: data.failed, skipped: data.skipped });
    } catch (e: any) {
      alert(`批次加入失敗：${e.message}`);
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div>
      {header && <div className="mb-3">{header}</div>}

      {error && (
        <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {batchResult && (
        <div className="mb-3 rounded border bg-green-50 p-3 text-sm">
          ✓ 加入 {batchResult.added} · 失敗 {batchResult.failed} · 已收藏跳過 {batchResult.skipped}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!loading && items !== null && items.length === 0 && (
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyHint}</div>
      )}

      {!loading && items && items.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>共 {items.length} 個候選</span>
              <span>·</span>
              <span>已收藏 {items.filter((i) => i.collected).length}</span>
              <span>·</span>
              <span>已勾選 {selected.size}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={selectAllUncollected}>
                全勾未收藏（最多 20）
              </Button>
              {onRefresh && (
                <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
                  <RefreshCw className="h-3 w-3" /> 刷新
                </Button>
              )}
              <Button size="sm" disabled={selected.size === 0 || batchBusy} onClick={batchAdd}>
                {batchBusy ? "加入中…" : `批次加入 (${selected.size})`}
              </Button>
            </div>
          </div>

          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.url}
                className={cn(
                  "rounded border p-3 transition-colors",
                  it.collected && "bg-muted/40 text-muted-foreground"
                )}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    disabled={it.collected}
                    checked={selected.has(it.url)}
                    onChange={() => toggle(it.url)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{it.title}</span>
                      {typeof it.stars === "number" && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Star className="h-3 w-3" /> {it.stars}
                        </span>
                      )}
                      {it.collected && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">已收藏</span>
                      )}
                      {it.section && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{it.section}</span>
                      )}
                    </div>
                    {it.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.description}</p>
                    )}
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block break-all text-xs text-blue-600 hover:underline"
                    >
                      {it.url}
                    </a>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
