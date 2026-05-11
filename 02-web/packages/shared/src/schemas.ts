import { z } from "zod";

// Skill 分類：LLM 從這份固定清單挑一個
export const SKILL_CATEGORIES = [
  "dev-tools",
  "testing",
  "design",
  "security",
  "data",
  "devops",
  "docs",
  "ai-ml",
  "productivity",
  "uncategorized",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SOURCE_TYPES = ["github", "gist", "url", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// 手動新增 / 編輯 skill 的輸入驗證
export const skillInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  content: z.string().min(1),
  source_url: z.string().url().nullish().or(z.literal("")),
  source_type: z.enum(SOURCE_TYPES).default("manual"),
  category: z.enum(SKILL_CATEGORIES).default("uncategorized"),
  tags: z.array(z.string()).default([]),
  summary_zh: z.string().default(""),
  summary_en: z.string().default(""),
});
export type SkillInput = z.infer<typeof skillInputSchema>;

// LLM 分類結果（由 proxycli 回傳後 safeParse）
export const llmCategorizeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  category: z.enum(SKILL_CATEGORIES),
  tags: z.array(z.string()).max(10),
  summary_zh: z.string().max(200),
  summary_en: z.string().max(200),
});
export type LlmCategorizeResult = z.infer<typeof llmCategorizeSchema>;
