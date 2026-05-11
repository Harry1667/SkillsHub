// Next.js 15 會在 server 啟動時自動呼叫此函式
// .env 由 Next.js 原生讀取（packages/web/.env → symlink 到 02-web/.env）
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCron } = await import("./lib/cron");
    startCron();
  }
}
