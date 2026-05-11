import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".skillshub");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface CliConfig {
  url: string;
  token: string;
}

export function loadConfig(): CliConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    const txt = fs.readFileSync(CONFIG_FILE, "utf8");
    const cfg = JSON.parse(txt);
    if (typeof cfg.url !== "string" || typeof cfg.token !== "string") return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: CliConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function requireConfig(): CliConfig {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("尚未設定。先跑：skillshub config --url <url> --token <token>");
    process.exit(1);
  }
  return cfg;
}
