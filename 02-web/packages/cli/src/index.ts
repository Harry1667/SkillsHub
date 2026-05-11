#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, saveConfig, requireConfig } from "./config.js";
import * as api from "./api.js";

const program = new Command();
program
  .name("skillshub")
  .description("Skills Hub CLI — 收藏 AI skills，給 Claude Code 用")
  .version("0.1.0");

program
  .command("config")
  .description("設定 server URL 與 API token")
  .option("--url <url>", "Skills Hub URL（如 https://skillshub.looptw.com）")
  .option("--token <token>", "API token（從 /settings 取得）")
  .action((opts) => {
    const current = loadConfig() ?? { url: "", token: "" };
    const next = {
      url: opts.url ?? current.url,
      token: opts.token ?? current.token,
    };
    if (!next.url || !next.token) {
      console.error(chalk.red("url 和 token 都要設"));
      process.exit(1);
    }
    saveConfig(next);
    console.log(chalk.green("✓ 設定已存到 ~/.skillshub/config.json（chmod 600）"));
  });

program
  .command("add <url>")
  .description("貼網址，自動抓取 + LLM 分類 + 入庫")
  .action(async (url) => {
    const cfg = requireConfig();
    const spinner = ora(`抓取 ${url}…`).start();
    try {
      const skill = await api.addFromUrl(cfg, url);
      spinner.succeed(chalk.green("✓ 儲存完成"));
      console.log();
      console.log(`  id:       ${chalk.cyan(skill.id)}`);
      console.log(`  name:     ${skill.name}`);
      console.log(`  category: ${skill.category}`);
      if (skill.categorized === false) {
        console.log(chalk.yellow(`  ⚠ 自動分類失敗（${skill.reason}），需手動補`));
      }
      console.log(`  view:     ${cfg.url}/skills/${skill.id}`);
    } catch (e: any) {
      spinner.fail(chalk.red(`✗ ${e.message}`));
      if (e.data?.errors) console.error(JSON.stringify(e.data.errors, null, 2));
      process.exit(1);
    }
  });

program
  .command("list")
  .description("列出 skills")
  .option("--category <c>", "篩選分類")
  .option("--limit <n>", "最多幾筆", (v) => parseInt(v, 10), 20)
  .action(async (opts) => {
    const cfg = requireConfig();
    const { items } = await api.listSkills(cfg, { category: opts.category, limit: opts.limit });
    if (items.length === 0) {
      console.log(chalk.dim("(空)"));
      return;
    }
    for (const s of items) {
      console.log(
        `${chalk.cyan(s.id.slice(0, 8))}  ${chalk.bold(s.name.padEnd(30))}  ${chalk.dim(s.category.padEnd(14))}  ${chalk.dim(s.sourceType)}`
      );
    }
  });

program
  .command("search <query>")
  .description("FTS5 全文搜尋")
  .option("--limit <n>", "最多幾筆", (v) => parseInt(v, 10), 20)
  .action(async (query, opts) => {
    const cfg = requireConfig();
    const { items } = await api.searchSkills(cfg, query, opts.limit);
    if (items.length === 0) {
      console.log(chalk.dim("(無命中)"));
      return;
    }
    for (const s of items) {
      console.log(`${chalk.cyan(s.id.slice(0, 8))}  ${chalk.bold(s.name)}`);
      if (s.description) console.log(`           ${chalk.dim(s.description)}`);
    }
  });

program
  .command("show <id>")
  .description("輸出完整 SKILL.md 內容到 stdout")
  .action(async (id) => {
    const cfg = requireConfig();
    const s = await api.getSkill(cfg, id);
    console.log(s.content);
  });

program
  .command("rm <id>")
  .description("刪除 skill")
  .action(async (id) => {
    const cfg = requireConfig();
    await api.deleteSkill(cfg, id);
    console.log(chalk.green("✓ 已刪除"));
  });

program.parseAsync().catch((e) => {
  console.error(chalk.red(e.message || e));
  process.exit(1);
});
