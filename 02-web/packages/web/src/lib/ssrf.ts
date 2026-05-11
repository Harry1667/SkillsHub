import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

const DENY_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./, // link-local + cloud metadata
  /^0\./,
  /^100\.(6[4-9]|7[0-9]|8[0-9]|9[0-9]|1[0-1][0-9]|12[0-7])\./, // CGNAT
];
const DENY_V6 = [
  /^::1$/,
  /^::$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe8[0-9a-f]:/i, // link-local
  /^ff/i, // multicast
];

export class SsrfError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SsrfError";
  }
}

function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) return DENY_V4.some((p) => p.test(ip));
  if (net.isIPv6(ip)) return DENY_V6.some((p) => p.test(ip));
  return true; // 未知就拒絕
}

/**
 * 在 fetch 前呼叫，拒絕內部網段 URL。
 * - scheme 只允許 http/https
 * - hostname 做 DNS 解析，每個 IP 都要非私網
 * - 阻擋明顯 alias（localhost, *.local）
 */
export async function assertSafeUrl(urlStr: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new SsrfError("URL 格式錯誤");
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new SsrfError("只允許 http(s)");
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") {
    throw new SsrfError("不允許 localhost / .local");
  }

  // 本來就是 IP literal
  if (net.isIP(host)) {
    if (isPrivate(host)) throw new SsrfError(`目標 IP 在私網段: ${host}`);
    return u;
  }

  // DNS resolve 所有 A/AAAA（防 DNS rebinding）
  const [a, aaaa] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ]);
  const ips = [...a, ...aaaa];
  if (ips.length === 0) throw new SsrfError(`無法解析 hostname: ${host}`);
  for (const ip of ips) {
    if (isPrivate(ip)) throw new SsrfError(`目標解析到私網段 IP: ${ip}`);
  }
  return u;
}
