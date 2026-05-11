import type { Config } from "drizzle-kit";
import { config as dotenv } from "dotenv";
import path from "node:path";

// 吃 02-web/.env（drizzle-kit 從 packages/web 執行，.env 在 02-web/）
dotenv({ path: path.resolve(process.cwd(), "../../.env") });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "../../data/skills.db",
  },
} satisfies Config;
