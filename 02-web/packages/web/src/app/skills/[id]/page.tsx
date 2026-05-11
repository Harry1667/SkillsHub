import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { getSkill } from "@/lib/skills";
import { DeleteButton } from "./delete-button";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const skill = getSkill(id);
  if (!skill) notFound();

  const tags: string[] = safeJson(skill.tags) ?? [];

  return (
    <main className="mx-auto max-w-4xl p-6">
      <nav className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← 回到 dashboard
        </Link>
      </nav>

      <header className="mb-6 space-y-2 border-b pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{skill.name}</h1>
            {skill.description && (
              <p className="mt-2 text-muted-foreground">{skill.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <DeleteButton id={skill.id} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-secondary px-2 py-0.5">{skill.category}</span>
          <span>來源：{skill.sourceType}</span>
          {tags.map((t) => (
            <span key={t} className="rounded bg-muted px-2 py-0.5">
              #{t}
            </span>
          ))}
          {skill.needsRetry === 1 && (
            <span className="rounded bg-destructive/10 px-2 py-0.5 text-destructive">待重試分類</span>
          )}
        </div>
        {skill.sourceUrl && (
          <a
            href={skill.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {skill.sourceUrl}
          </a>
        )}
      </header>

      <article className="markdown-body space-y-3 text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {skill.content}
        </ReactMarkdown>
      </article>
    </main>
  );
}

function safeJson(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
