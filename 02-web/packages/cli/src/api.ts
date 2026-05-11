import type { CliConfig } from "./config.js";

async function api(cfg: CliConfig, pathPart: string, init?: RequestInit): Promise<any> {
  const res = await fetch(cfg.url.replace(/\/$/, "") + pathPart, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.token}`,
      "user-agent": "skillshub-cli/0.1",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }
  return data;
}

export function addFromUrl(cfg: CliConfig, url: string) {
  return api(cfg, "/api/skills/from-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function listSkills(cfg: CliConfig, opts: { category?: string; limit?: number }) {
  const sp = new URLSearchParams();
  if (opts.category) sp.set("category", opts.category);
  if (opts.limit) sp.set("limit", String(opts.limit));
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return api(cfg, `/api/skills${qs}`);
}

export function searchSkills(cfg: CliConfig, q: string, limit = 20) {
  return api(cfg, `/api/skills?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function getSkill(cfg: CliConfig, id: string) {
  return api(cfg, `/api/skills/${encodeURIComponent(id)}`);
}

export function deleteSkill(cfg: CliConfig, id: string) {
  return api(cfg, `/api/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
}
