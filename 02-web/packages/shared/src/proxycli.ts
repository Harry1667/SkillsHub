// 抽象介面：未來切 gRPC 只改這一個檔的實作。
export interface ProxyclientOptions {
  project: string;
  group: string;
  tier?: "fast" | "smart";
  effort?: "minimal" | "low" | "medium" | "high";
  model?: string;
  /** 指定 provider 比 model 優先。不設則走 proxycli auto_router。 */
  provider?: "openai" | "gemini" | "claude" | "deepseek" | (string & {});
}

export interface ChatResult {
  ok: boolean;
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  actualProvider: string;
  actualModel: string;
  actualSource: string;
}

export interface Proxyclient {
  chat(prompt: string, opts: ProxyclientOptions): Promise<ChatResult>;
}

// ============ REST 實作（M2）============
export interface RestConfig {
  url: string; // e.g. https://clip.twloop.com
  token: string;
  timeoutMs?: number;
  defaultProject?: string;
}

export function createRestClient(cfg: RestConfig): Proxyclient {
  const timeoutMs = cfg.timeoutMs ?? 60_000;
  return {
    async chat(prompt, opts) {
      const body = {
        prompt,
        project: opts.project || cfg.defaultProject,
        group: opts.group,
        ...(opts.tier ? { tier: opts.tier } : {}),
        ...(opts.effort ? { effort: opts.effort } : {}),
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.provider ? { provider: opts.provider } : {}),
      };
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(`${cfg.url}/api/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.token}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const data: any = await res.json();
        if (!res.ok || data.ok === false) {
          throw new ProxycliError(
            data?.error || `HTTP ${res.status}`,
            res.status,
            data
          );
        }
        return {
          ok: true,
          content: String(data.content ?? ""),
          inputTokens: Number(data.input_tokens ?? 0),
          outputTokens: Number(data.output_tokens ?? 0),
          latencyMs: Number(data.latency_ms ?? 0),
          actualProvider: String(data.actual_provider ?? ""),
          actualModel: String(data.actual_model ?? ""),
          actualSource: String(data.actual_source ?? ""),
        };
      } finally {
        clearTimeout(t);
      }
    },
  };
}

export class ProxycliError extends Error {
  constructor(
    message: string,
    public status: number,
    public raw: unknown
  ) {
    super(message);
    this.name = "ProxycliError";
  }
}
