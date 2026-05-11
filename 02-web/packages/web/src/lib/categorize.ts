import "server-only";
import { llmCategorizeSchema, SKILL_CATEGORIES, type LlmCategorizeResult } from "@skillshub/shared/schemas";
import { proxy } from "./proxycli";

const SYSTEM = `你是一個 AI Skills 分類助手。

我會給你一段 skill 的原始內容（SKILL.md / README / 網頁）。請產出 JSON，欄位如下：

{
  "name": string（1-100 字，skill 的簡潔名稱，優先用原文標題）,
  "description": string（0-500 字，一句話說明這 skill 解決什麼問題）,
  "category": 下列其一："dev-tools" | "testing" | "design" | "security" | "data" | "devops" | "docs" | "ai-ml" | "productivity" | "uncategorized",
  "tags": string[]（最多 10 個，小寫 kebab-case，例如 "playwright", "web-scraping"）,
  "summary_zh": string（≤ 200 字繁體中文摘要）,
  "summary_en": string（≤ 200 chars English summary）
}

只回傳 JSON，不要加 code fence、不要多餘文字。`;

export interface CategorizeOk {
  ok: true;
  value: LlmCategorizeResult;
  tokens: { input: number; output: number };
  actualProvider: string;
  actualModel: string;
}
export interface CategorizeFail {
  ok: false;
  reason: "llm_error" | "parse_fail" | "invalid_json";
  raw: string | null;
  error?: string;
}

export async function categorize(rawContent: string): Promise<CategorizeOk | CategorizeFail> {
  // 內容過長（>8000 字）裁掉末端，避免超過 context
  const content = rawContent.length > 8000 ? rawContent.slice(0, 8000) + "\n...[truncated]" : rawContent;
  const prompt = `${SYSTEM}\n\n─── 原始內容 ───\n${content}`;

  // 主路：openai（gpt-4o-mini，便宜穩定）；openai 失敗再試 gemini
  const project = process.env.PROXYCLI_PROJECT || "skillshub";
  const providers: ("openai" | "gemini")[] = ["openai", "gemini"];

  let resp;
  let lastErr: any = null;
  for (const provider of providers) {
    try {
      resp = await proxy().chat(prompt, { project, group: "categorize", provider });
      break;
    } catch (e: any) {
      lastErr = e;
      console.warn(`[categorize] provider=${provider} failed: ${e?.message ?? e}`);
    }
  }
  if (!resp) {
    return {
      ok: false,
      reason: "llm_error",
      raw: null,
      error: String(lastErr?.message ?? lastErr),
    };
  }

  const raw = resp.content.trim();
  // 有些模型會包 ```json ... ``` 清掉
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let obj: any;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: "invalid_json", raw };
  }

  const parsed = llmCategorizeSchema.safeParse(obj);
  if (!parsed.success) {
    // category 不合法 → 強制 uncategorized，其他欄位保留
    if (obj && typeof obj === "object") {
      const fallback = llmCategorizeSchema.safeParse({
        name: typeof obj.name === "string" ? obj.name.slice(0, 100) : "Untitled",
        description: typeof obj.description === "string" ? obj.description.slice(0, 500) : "",
        category: SKILL_CATEGORIES.includes(obj.category) ? obj.category : "uncategorized",
        tags: Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string").slice(0, 10) : [],
        summary_zh: typeof obj.summary_zh === "string" ? obj.summary_zh.slice(0, 200) : "",
        summary_en: typeof obj.summary_en === "string" ? obj.summary_en.slice(0, 200) : "",
      });
      if (fallback.success) {
        return {
          ok: true,
          value: fallback.data,
          tokens: { input: resp.inputTokens, output: resp.outputTokens },
          actualProvider: resp.actualProvider,
          actualModel: resp.actualModel,
        };
      }
    }
    return { ok: false, reason: "parse_fail", raw };
  }

  return {
    ok: true,
    value: parsed.data,
    tokens: { input: resp.inputTokens, output: resp.outputTokens },
    actualProvider: resp.actualProvider,
    actualModel: resp.actualModel,
  };
}
