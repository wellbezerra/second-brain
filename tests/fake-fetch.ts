export interface Call {
  url: URL;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

export type Handler = (call: Call, index: number) => Response | Promise<Response>;

/** fetch falso: registra cada chamada e responde com o handler. Nunca toca a rede. */
export function fakeFetch(handler: Handler) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: Call = {
      url: new URL(String(input)),
      headers,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export const networkDown = () => {
  throw new TypeError("fetch failed", {
    cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
  });
};

/** Vetor determinístico e não normalizado para um texto. */
export const vectorFor = (text: string) => [text.length, 1, 2];
