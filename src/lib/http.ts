export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serializa chamadas garantindo um intervalo mínimo entre elas. */
export function createLimiter(minIntervalMs: number | (() => number)) {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const interval = typeof minIntervalMs === "function" ? minIntervalMs() : minIntervalMs;
      const wait = last + interval - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    chain = run.catch(() => {});
    return run.then(fn);
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body: string,
  ) {
    super(`HTTP ${status} em ${url}: ${body.slice(0, 200)}`);
  }
}

/** fetch + JSON com retry em 429/5xx. 404 vira null. */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  opts: { retries?: number; allow404?: boolean } = {},
): Promise<T | null> {
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": "poachnomic3000 (uso pessoal)", ...init?.headers },
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404 && opts.allow404 !== false) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1));
      continue;
    }
    throw new HttpError(res.status, url, await res.text().catch(() => ""));
  }
}
