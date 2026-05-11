"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { skillInputSchema, SKILL_CATEGORIES, type SkillInput } from "@skillshub/shared/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link as LinkIcon, PenLine } from "lucide-react";

type Tab = "url" | "manual";

export default function NewSkillPage() {
  const [tab, setTab] = useState<Tab>("url");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">新增 Skill</h1>

      <div className="mb-6 flex gap-1 rounded-md bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab("url")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 transition-colors",
            tab === "url" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LinkIcon className="h-4 w-4" /> 從網址
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 transition-colors",
            tab === "manual" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <PenLine className="h-4 w-4" /> 手動新增
        </button>
      </div>

      {tab === "url" ? <UrlForm /> : <ManualForm />}
    </main>
  );
}

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ============ URL ============
function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/skills/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "抓取失敗");
        setLoading(false);
        return;
      }
      router.push(`/skills/${data.id}`);
    } catch {
      setError("網路錯誤");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        貼 GitHub repo、gist、部落格文章連結，系統會自動抓 SKILL.md / README / 主內容 → LLM 分類。
      </p>
      <div className="space-y-2">
        <Label htmlFor="url">URL</Label>
        <Input
          id="url"
          type="url"
          required
          placeholder="https://github.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={loading || !url}>
          {loading ? "抓取中（可能 10-30 秒）…" : "抓取並分類"}
        </Button>
      </div>
    </form>
  );
}

// ============ 手動 ============
function ManualForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SkillInput>({
    resolver: zodResolver(skillInputSchema),
    defaultValues: {
      name: "",
      description: "",
      content: "",
      source_url: "",
      source_type: "manual",
      category: "uncategorized",
      tags: [],
      summary_zh: "",
      summary_en: "",
    },
  });

  async function onSubmit(values: SkillInput) {
    setSubmitting(true);
    setError(null);
    values.tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "新增失敗");
        setSubmitting(false);
        return;
      }
      router.push(`/skills/${data.id}`);
    } catch {
      setError("網路錯誤");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">名稱 *</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">一句話描述</Label>
        <Input id="description" {...register("description")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">SKILL.md 內容（Markdown）*</Label>
        <Textarea id="content" rows={14} {...register("content")} className="font-mono text-xs" />
        {errors.content && <p className="text-sm text-destructive">{errors.content.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="source_url">原始連結（可選）</Label>
        <Input id="source_url" type="url" placeholder="https://..." {...register("source_url")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">分類</Label>
          <select
            id="category"
            {...register("category")}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            {SKILL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags-input">Tags（逗號分隔）</Label>
          <Input
            id="tags-input"
            placeholder="ai, testing, playwright"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "儲存中…" : "儲存"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </form>
  );
}
