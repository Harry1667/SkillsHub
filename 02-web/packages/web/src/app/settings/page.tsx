"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsState {
  githubToken: { set: boolean; lastFour: string | null; source: "db" | "env" | "none" };
}

export default function SettingsPage() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/settings");
    if (res.ok) setState(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function save(value: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ githubToken: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setState(data);
      setTokenInput("");
      setMsg({ type: "ok", text: value ? "已更新 GitHub token" : "已清除 GitHub token（回退至 env）" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "更新失敗" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <nav className="mb-4">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← 回到 dashboard
        </Link>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold">設定</h1>

      {msg && (
        <div
          className={`mb-4 rounded border p-3 text-sm ${
            msg.type === "ok" ? "border-green-500/30 bg-green-50 text-green-900" : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {msg.text}
        </div>
      )}

      <section className="space-y-4 rounded-lg border p-5">
        <div>
          <h2 className="text-lg font-semibold">GitHub Token</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            用於 GitHub Search / awesome 清單 / URL 抓取。{" "}
            <a
              href="https://github.com/settings/tokens?type=beta"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              產生 fine-grained PAT
            </a>（scope 只要 public repo read 即可）。
          </p>
        </div>

        <div className="rounded bg-muted p-3 text-sm">
          <span className="text-muted-foreground">目前狀態：</span>
          {state === null ? (
            "載入中…"
          ) : state.githubToken.set ? (
            <>
              <span className="font-medium">✓ 已設定</span>
              {" · "}
              末 4 碼 <code className="text-xs">{state.githubToken.lastFour}</code>
              {" · "}
              來源 <code className="text-xs">{state.githubToken.source === "db" ? "UI（本頁）" : ".env"}</code>
            </>
          ) : (
            <span className="text-destructive">✗ 未設定（GitHub API 每小時 60 次限流，很容易卡）</span>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(tokenInput);
          }}
          className="space-y-2"
        >
          <Label htmlFor="token">新 token</Label>
          <Input
            id="token"
            type="password"
            placeholder="ghp_... 或 github_pat_..."
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            autoComplete="off"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy || !tokenInput}>
              {busy ? "儲存中…" : "儲存"}
            </Button>
            {state?.githubToken.set && state.githubToken.source === "db" && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (confirm("確定要清除？之後會回退到 .env 的 GITHUB_TOKEN（可能是空的）")) save("");
                }}
              >
                清除
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            儲存後存進 DB，覆蓋 env 同名變數。只有登入後的 web session 能讀寫，API token 路徑不開放。
          </p>
        </form>
      </section>

      <section className="mt-6 space-y-2 rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        <h3 className="font-semibold text-foreground">其他設定（TODO）</h3>
        <ul className="list-disc pl-5">
          <li>修改登入密碼</li>
          <li>重新產生 API token（目前要在伺服器跑 db:seed）</li>
          <li>proxycli token</li>
          <li>LLM 月預算上限</li>
        </ul>
      </section>
    </main>
  );
}
