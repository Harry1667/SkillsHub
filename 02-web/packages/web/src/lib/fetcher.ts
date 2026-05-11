import "server-only";
import { Octokit } from "@octokit/rest";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { assertSafeUrl, SsrfError } from "./ssrf";
import { getGithubToken } from "./settings";

export type SourceKind = "github" | "gist" | "url";

export interface FetchResult {
  sourceType: SourceKind;
  sourceUrl: string;
  title: string | null;
  content: string; // markdown（github/gist）或 cleaned-up text（一般網頁）
}

const BODY_SIZE_LIMIT = 500 * 1024; // 500KB
const FETCH_TIMEOUT_MS = 10_000;

function octokit() {
  return new Octokit({ auth: getGithubToken(), userAgent: "skillshub/0.1" });
}

export async function fetchFromUrl(urlStr: string): Promise<FetchResult> {
  const u = await assertSafeUrl(urlStr);
  const host = u.hostname.toLowerCase();

  if (host === "github.com") return fetchGithub(u);
  if (host === "gist.github.com") return fetchGist(u);
  return fetchGeneric(u);
}

// ============ GitHub repo ============
async function fetchGithub(u: URL): Promise<FetchResult> {
  // URL 形式：
  //   github.com/<owner>/<repo>
  //   github.com/<owner>/<repo>/blob/<branch>/<path>
  //   github.com/<owner>/<repo>/tree/<branch>/<path>
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("GitHub URL 格式錯誤（缺 owner/repo）");
  const [owner, repo] = parts;
  let ref: string | undefined;
  let subPath = "";
  if (parts[2] === "blob" || parts[2] === "tree") {
    ref = parts[3];
    subPath = parts.slice(4).join("/");
  }

  const ok = octokit();

  // 如果 URL 直接指到檔案，就抓那個
  if (subPath && /\.md$/i.test(subPath)) {
    const md = await fetchGithubFile(ok, owner, repo, subPath, ref);
    return {
      sourceType: "github",
      sourceUrl: u.toString(),
      title: subPath.split("/").pop() ?? null,
      content: md,
    };
  }

  // 否則依序試 SKILL.md / skill.md / README.md
  const tryPaths = [
    subPath ? `${subPath}/SKILL.md` : "SKILL.md",
    subPath ? `${subPath}/skill.md` : "skill.md",
    subPath ? `${subPath}/README.md` : "README.md",
  ];
  for (const p of tryPaths) {
    try {
      const md = await fetchGithubFile(ok, owner, repo, p, ref);
      return {
        sourceType: "github",
        sourceUrl: u.toString(),
        title: `${owner}/${repo}`,
        content: md,
      };
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }
  }
  throw new Error(`找不到 SKILL.md / skill.md / README.md（${owner}/${repo}）`);
}

async function fetchGithubFile(
  ok: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string
): Promise<string> {
  const r = await ok.repos.getContent({ owner, repo, path: filePath, ref });
  // 檔案情況：r.data 是 object，type=file，content base64
  const d = r.data as any;
  if (Array.isArray(d)) throw new Error(`${filePath} 是目錄，不是檔案`);
  if (d.type !== "file" || typeof d.content !== "string") {
    throw new Error(`${filePath} 不是檔案`);
  }
  const buf = Buffer.from(d.content, "base64");
  if (buf.byteLength > BODY_SIZE_LIMIT) throw new Error("檔案超過 500KB 上限");
  return buf.toString("utf8");
}

// ============ Gist ============
async function fetchGist(u: URL): Promise<FetchResult> {
  const parts = u.pathname.split("/").filter(Boolean);
  // gist.github.com/<user>/<id>
  const id = parts[parts.length - 1]?.split("#")[0];
  if (!id) throw new Error("Gist URL 缺 id");
  const ok = octokit();
  const r = await ok.gists.get({ gist_id: id });
  const files = Object.values(r.data.files ?? {});
  // 挑 .md 優先，再挑第一個
  const md = files.find((f) => f?.filename?.endsWith(".md")) ?? files[0];
  if (!md?.content) throw new Error("Gist 無內容");
  return {
    sourceType: "gist",
    sourceUrl: u.toString(),
    title: md.filename ?? null,
    content: md.content,
  };
}

// ============ 一般網頁 ============
async function fetchGeneric(u: URL): Promise<FetchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "skillshub/0.1 (+https://skillshub.looptw.com)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > BODY_SIZE_LIMIT) throw new Error("內容超過 500KB 上限");
    const html = buf.toString("utf8");

    if (/text\/plain|text\/markdown/.test(ct) || u.pathname.endsWith(".md")) {
      return {
        sourceType: "url",
        sourceUrl: u.toString(),
        title: null,
        content: html,
      };
    }

    const dom = new JSDOM(html, { url: u.toString() });
    const article = new Readability(dom.window.document as any).parse();
    if (!article) throw new Error("無法萃取網頁主內容");
    return {
      sourceType: "url",
      sourceUrl: u.toString(),
      title: article.title || null,
      content: `# ${article.title ?? ""}\n\n${article.textContent?.trim() ?? ""}`,
    };
  } finally {
    clearTimeout(t);
  }
}

export { SsrfError };
