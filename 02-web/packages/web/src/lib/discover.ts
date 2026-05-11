import "server-only";
import { sqlite } from "@/db/client";
import { searchSkillRepos, type RepoCandidate } from "./github-search";
import { parseAwesomeList, type AwesomeCandidate } from "./awesome-parser";

export interface DiscoverItem {
  url: string;              // 唯一 key
  source: "github-search" | "awesome";
  title: string;
  description: string | null;
  stars?: number;
  topics?: string[];
  section?: string | null;  // awesome 來源才有
  collected: boolean;       // 已在書櫃？
}

// ──────────────── in-memory cache（同 process）────────────────
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const TTL_MS = 6 * 60 * 60 * 1000; // 6 小時
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return e.value;
}
function setCached<T>(key: string, value: T) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

// ──────────────── dedupe：與書櫃已有的 skill 比對 source_url ────────────────
function collectedUrlSet(): Set<string> {
  const rows = sqlite.prepare("SELECT source_url FROM skills WHERE source_url IS NOT NULL").all() as {
    source_url: string | null;
  }[];
  return new Set(rows.map((r) => normalizeGithubUrl(r.source_url ?? "")).filter(Boolean));
}

function normalizeGithubUrl(url: string): string {
  // 統一 github URL 比對：去 trailing slash、去 fragment、小寫 host
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url.replace(/\/$/, "").toLowerCase();
  }
}

// ──────────────── 公開 API ────────────────

export async function discoverGithubSearch(opts: { limit?: number; force?: boolean } = {}): Promise<DiscoverItem[]> {
  const cacheKey = `github-search:${opts.limit ?? 50}`;
  if (!opts.force) {
    const hit = getCached<RepoCandidate[]>(cacheKey);
    if (hit) return toItems(hit, "github-search");
  }
  const repos = await searchSkillRepos({ limit: opts.limit ?? 50, sort: "stars" });
  setCached(cacheKey, repos);
  return toItems(repos, "github-search");
}

export async function discoverAwesome(repoUrl: string, opts: { force?: boolean } = {}): Promise<DiscoverItem[]> {
  const normalized = normalizeGithubUrl(repoUrl);
  const cacheKey = `awesome:${normalized}`;
  if (!opts.force) {
    const hit = getCached<AwesomeCandidate[]>(cacheKey);
    if (hit) return awesomeToItems(hit);
  }
  const items = await parseAwesomeList(repoUrl);
  setCached(cacheKey, items);
  return awesomeToItems(items);
}

function toItems(repos: RepoCandidate[], source: DiscoverItem["source"]): DiscoverItem[] {
  const collected = collectedUrlSet();
  return repos.map((r) => ({
    url: r.url,
    source,
    title: r.name,
    description: r.description,
    stars: r.stars,
    topics: r.topics,
    collected: collected.has(normalizeGithubUrl(r.url)),
  }));
}

function awesomeToItems(items: AwesomeCandidate[]): DiscoverItem[] {
  const collected = collectedUrlSet();
  return items.map((it) => ({
    url: it.url,
    source: "awesome",
    title: it.title ?? it.url,
    description: it.description,
    section: it.section,
    collected: collected.has(normalizeGithubUrl(it.url)),
  }));
}

export { normalizeGithubUrl };
