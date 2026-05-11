import "server-only";
import { Octokit } from "@octokit/rest";
import { assertSafeUrl } from "./ssrf";
import { getGithubToken } from "./settings";

function octokit() {
  return new Octokit({ auth: getGithubToken(), userAgent: "skillshub/0.1" });
}

export interface AwesomeCandidate {
  url: string;                 // 絕對 URL（通常是 github.com/xxx/yyy）
  title: string | null;        // markdown link label
  description: string | null;  // link 所在行的剩餘文字
  section: string | null;      // 最近一個 H2 / H3 heading
}

/**
 * 抓一個 awesome-* GitHub repo 的 README.md，萃取所有 https://github.com/ 連結。
 * 支援：
 *   https://github.com/<owner>/<repo>
 *   https://github.com/<owner>/<repo>/tree/<branch>/<path>
 *   /<branch>  或不帶 branch
 */
export async function parseAwesomeList(repoUrl: string): Promise<AwesomeCandidate[]> {
  const u = await assertSafeUrl(repoUrl);
  if (u.hostname !== "github.com") throw new Error("只支援 github.com 的 awesome 清單");
  const [owner, repo] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new Error("URL 格式錯誤（缺 owner/repo）");

  const ok = octokit();
  // 抓預設 branch 的 README（跟一般 fetchGithubFile 不一樣：這裡只抓 README，不 fallback）
  let readme: string;
  try {
    const r = await ok.repos.getReadme({ owner, repo, mediaType: { format: "raw" } });
    readme = r.data as unknown as string;
  } catch {
    throw new Error(`無法抓 ${owner}/${repo} 的 README`);
  }

  return extractMarkdownLinks(readme);
}

/**
 * 從 markdown 萃取所有 [title](url) 連結，僅保留 github.com 的。
 * 記錄該連結出現前最近的 heading 當作 section。
 */
export function extractMarkdownLinks(md: string): AwesomeCandidate[] {
  const lines = md.split("\n");
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const out: AwesomeCandidate[] = [];
  const seen = new Set<string>();

  let currentSection: string | null = null;

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      currentSection = headingMatch[2].trim();
      continue;
    }

    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(line)) !== null) {
      const [, label, url] = m;
      // 正規化：砍 fragment 跟 trailing )
      const clean = url.replace(/[),.]+$/, "").split("#")[0];
      if (!/^https?:\/\/github\.com\//i.test(clean)) continue;
      // 跳過 badges（shields.io 等）
      if (/\/(?:badge|shield|workflows)\b/i.test(clean)) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);

      // 描述：link 之後到行尾的文字（通常 awesome 清單格式是 `- [title](url) - description`）
      const afterLink = line.slice(m.index + m[0].length).replace(/^[\s\-—:]+/, "").trim();

      out.push({
        url: clean,
        title: label.trim(),
        description: afterLink || null,
        section: currentSection,
      });
    }
    // reset regex lastIndex for next line
    linkRe.lastIndex = 0;
  }

  return out;
}
