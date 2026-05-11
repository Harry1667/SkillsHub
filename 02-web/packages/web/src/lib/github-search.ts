import "server-only";
import { Octokit } from "@octokit/rest";
import { getGithubToken } from "./settings";

// 每次都重建（token 可能剛被 UI 改過）。Octokit 本身輕量。
function octokit() {
  return new Octokit({ auth: getGithubToken(), userAgent: "skillshub/0.1" });
}

export interface RepoCandidate {
  id: number;
  name: string;           // owner/repo
  url: string;            // html_url
  description: string | null;
  stars: number;
  updatedAt: string;
  topics: string[];
  language: string | null;
}

const DEFAULT_TOPICS = [
  "claude-skill",
  "claude-skills",
  "anthropic-skills",
  "mcp-skill",
] as const;

/**
 * 搜 GitHub 上貼了 Claude / Anthropic skill 相關 topic 的 repos。
 * GitHub Search 不支援 OR 組合 qualifier，改成每 topic 各查一次再合併 dedupe。
 */
export async function searchSkillRepos(opts: {
  topics?: readonly string[];
  sort?: "stars" | "updated";
  limit?: number;
} = {}): Promise<RepoCandidate[]> {
  const topics = opts.topics ?? DEFAULT_TOPICS;
  const sort = opts.sort ?? "stars";
  const limit = opts.limit ?? 50;
  const perTopic = Math.max(10, Math.ceil(limit / topics.length));

  const perQuery = Math.min(perTopic, 100);
  const ok = octokit();

  const results = await Promise.all(
    topics.map((t) =>
      ok.search
        .repos({ q: `topic:${t}`, sort, order: "desc", per_page: perQuery })
        .then((r) => r.data.items)
        .catch((e) => {
          console.warn(`[github-search] topic:${t} 失敗：${e?.message ?? e}`);
          return [];
        })
    )
  );

  // 依 repo id dedupe
  const seen = new Map<number, RepoCandidate>();
  for (const items of results) {
    for (const r of items) {
      if (seen.has(r.id)) continue;
      seen.set(r.id, {
        id: r.id,
        name: r.full_name,
        url: r.html_url,
        description: r.description,
        stars: r.stargazers_count,
        updatedAt: r.updated_at ?? "",
        topics: r.topics ?? [],
        language: r.language ?? null,
      });
    }
  }

  // 按 star 排序、取 limit
  const all = Array.from(seen.values()).sort((a, b) =>
    sort === "stars" ? b.stars - a.stars : b.updatedAt.localeCompare(a.updatedAt)
  );
  return all.slice(0, limit);
}
