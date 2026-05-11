import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyApiToken } from "@/lib/auth";
import { getSkill, listSkills, logAudit, searchSkills } from "@/lib/skills";
import { SKILL_CATEGORIES } from "@skillshub/shared/schemas";

// ──────────────────────────────────────────────
// 純 JSON-RPC 2.0 MCP endpoint（不用 SDK，手刻更輕）
// 支援 tools/list、tools/call、initialize
// 參考 spec: https://modelcontextprotocol.io
// ──────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_skills",
    description:
      "Full-text search the user's personal skill library (SKILL.md files). Returns skill summaries — call get_skill(id) to get full content.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "search keywords" },
        category: {
          type: "string",
          enum: SKILL_CATEGORIES as unknown as string[],
          description: "(optional) filter by category",
        },
        limit: { type: "number", description: "max results (default 20)", default: 20 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_skill",
    description: "Fetch the full content (SKILL.md markdown) of a specific skill by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "skill id (uuid)" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_skills",
    description: "List the user's skills (most recent first). Supports category filter.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: SKILL_CATEGORIES as unknown as string[] },
        limit: { type: "number", default: 50 },
      },
    },
  },
];

const searchArgs = z.object({
  query: z.string().min(1),
  category: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});
const getArgs = z.object({ id: z.string().min(1) });
const listArgs = z.object({
  category: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

type JsonRpcReq = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
};

function rpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: any, code: number, message: string, data?: any) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function toolText(text: string) {
  return { content: [{ type: "text", text }] };
}

function skillLite(s: any) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    tags: safeJson(s.tags) ?? [],
    source_url: s.sourceUrl,
    summary_zh: s.summaryZh,
    summary_en: s.summaryEn,
  };
}
function safeJson(s: any) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function handle(req: JsonRpcReq, toolName: string): Promise<any> {
  switch (req.method) {
    case "initialize": {
      return rpcResult(req.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "skillshub", version: "0.1.0" },
      });
    }
    case "tools/list": {
      return rpcResult(req.id, { tools: TOOLS });
    }
    case "tools/call": {
      const { name, arguments: args } = req.params ?? {};
      if (name === "search_skills") {
        const p = searchArgs.safeParse(args);
        if (!p.success) return rpcError(req.id, -32602, "invalid params", p.error.flatten());
        const items = searchSkills(p.data.query, p.data.limit ?? 20);
        const filtered = p.data.category ? items.filter((s) => s.category === p.data.category) : items;
        logAudit({ eventType: "mcp_search", toolName, metadata: { query: p.data.query, hits: filtered.length } });
        return rpcResult(req.id, toolText(JSON.stringify(filtered.map(skillLite), null, 2)));
      }
      if (name === "get_skill") {
        const p = getArgs.safeParse(args);
        if (!p.success) return rpcError(req.id, -32602, "invalid params", p.error.flatten());
        const skill = getSkill(p.data.id);
        if (!skill) return rpcError(req.id, -32001, "skill not found");
        logAudit({ eventType: "mcp_get", skillId: skill.id, toolName });
        return rpcResult(
          req.id,
          toolText(
            `# ${skill.name}\n\n${skill.description}\n\n---\n\n${skill.content}\n\n---\nsource: ${skill.sourceUrl ?? "(manual)"}`
          )
        );
      }
      if (name === "list_skills") {
        const p = listArgs.safeParse(args);
        if (!p.success) return rpcError(req.id, -32602, "invalid params", p.error.flatten());
        const { items } = listSkills({ category: p.data.category, limit: p.data.limit ?? 50 });
        logAudit({ eventType: "mcp_list", toolName, metadata: { count: items.length } });
        return rpcResult(req.id, toolText(JSON.stringify(items.map(skillLite), null, 2)));
      }
      return rpcError(req.id, -32601, `unknown tool: ${name}`);
    }
    case "ping":
      return rpcResult(req.id, {});
    default:
      return rpcError(req.id, -32601, `method not found: ${req.method}`);
  }
}

function pickToolName(req: Request): string {
  // Claude Code 在 User-Agent 帶 "claude"；CLI 走別的 UA
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  if (ua.includes("claude")) return "Claude Code";
  if (ua.includes("cursor")) return "Cursor";
  if (ua.includes("codex")) return "Codex";
  if (ua.includes("mcp")) return "MCP Client";
  return "Unknown";
}

async function authed(req: Request): Promise<boolean> {
  const bearer = req.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) return false;
  return verifyApiToken(bearer.slice(7)) !== null;
}

export async function GET(req: Request) {
  // MCP HTTP transport 允許 GET for SSE，但我們用單次 POST request/response 即可
  if (!(await authed(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, server: "skillshub-mcp", tools: TOOLS.map((t) => t.name) });
}

export async function POST(req: Request) {
  if (!(await authed(req))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } }, { status: 401 });
  }
  const toolName = pickToolName(req);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 }
    );
  }

  // JSON-RPC batch
  if (Array.isArray(payload)) {
    const results = await Promise.all(payload.map((r) => handle(r, toolName)));
    return NextResponse.json(results);
  }
  const result = await handle(payload, toolName);
  return NextResponse.json(result);
}
