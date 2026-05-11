import "server-only";
import { createRestClient, type Proxyclient } from "@skillshub/shared/proxycli";

let _client: Proxyclient | null = null;
export function proxy(): Proxyclient {
  if (_client) return _client;
  const url = process.env.PROXYCLI_REST_URL;
  const token = process.env.PROXYCLI_TOKEN;
  if (!url || !token) {
    throw new Error("PROXYCLI_REST_URL / PROXYCLI_TOKEN not set");
  }
  _client = createRestClient({
    url,
    token,
    defaultProject: process.env.PROXYCLI_PROJECT || "skillshub",
    timeoutMs: 60_000,
  });
  return _client;
}
