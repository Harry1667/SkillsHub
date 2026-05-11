import { config as dotenv } from "dotenv";
import path from "node:path";
dotenv({ path: path.resolve(process.cwd(), "../../.env") });

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { users } from "./schema";

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "../../data/skills.db");

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

const passwordHash = process.env.ADMIN_PASSWORD_HASH;
if (!passwordHash) {
  console.error("[seed] ADMIN_PASSWORD_HASH is not set in .env");
  console.error("[seed] 產生方式：");
  console.error('  node -e "console.log(require(\'bcryptjs\').hashSync(\'YOUR_PASSWORD\', 12))"');
  process.exit(1);
}

// 首次啟動產生 API token（原值顯示一次，hash 存 DB）
let apiToken = process.env.API_TOKEN;
let newToken = false;
if (!apiToken) {
  apiToken = crypto.randomBytes(32).toString("hex");
  newToken = true;
}
const apiTokenHash = crypto.createHash("sha256").update(apiToken).digest("hex");

const existing = db.select().from(users).where(eq(users.id, 1)).all();

if (existing.length === 0) {
  db.insert(users)
    .values({ id: 1, username: "admin", passwordHash, apiTokenHash })
    .run();
  console.log("[seed] created admin user (id=1)");
} else {
  db.update(users)
    .set({ passwordHash, apiTokenHash })
    .where(eq(users.id, 1))
    .run();
  console.log("[seed] updated admin user (id=1)");
}

if (newToken) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  API TOKEN（只顯示這一次，記下來）：");
  console.log(`  ${apiToken}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
} else {
  console.log("[seed] 使用 .env 裡的 API_TOKEN，hash 已更新");
}

sqlite.close();
