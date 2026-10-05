import { describe, expect, it, vi } from "vitest";
import { criarClienteHttp, ErroHttp } from "./http";

/** Relógio falso: `sleep` só avança o tempo e registra quanto esperou. */
function relogio() {
  let t = 0;
  const esperas: number[] = [];
  return {
    agora: () => t,
    sleep: async (ms: number) => {
      esperas.push(ms);
      t += ms;
    },
    esperas,
  };
}

function resposta(status: number, corpo = "", headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : corpo, { status, headers });
}

function cliente(fetchImpl: typeof fetch, extra = {}) {
  const r = relogio();
  const c = criarClienteHttp({
    fetch: fetchImpl,
    sleep: r.sleep,
    agora: r.agora,
    aleatorio: () => 0,
    contatoEmail: "contato@exemplo.org",
    ...extra,
  });
  return { c, r };
}

describe("criarClienteHttp", () => {
  it("envia User-Agent com e-mail de contato e devolve JSON", async () => {
    const f = vi.fn().mockResolvedValue(resposta(200, '{"ok":true}'));
    const { c } = cliente(f);
    expect(await c.getJson("https://pncp.gov.br/x")).toEqual({ ok: true });
    const headers = f.mock.calls[0][1].headers;
    expect(headers["User-Agent"]).toBe("LupaMunicipal/0.1 (+contato: contato@exemplo.org)");
  });

  it("HTTP 204 vira null", async () => {
    const { c } = cliente(vi.fn().mockResolvedValue(resposta(204)));
    expect(await c.getJson("https://pncp.gov.br/x")).toBeNull();
  });

  it("tenta de novo em 503 e 429 com backoff exponencial", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(resposta(503))
      .mockResolvedValueOnce(resposta(429))
      .mockResolvedValueOnce(resposta(200, "[]"));
    const { c, r } = cliente(f);
    expect(await c.getJson("https://pncp.gov.br/x")).toEqual([]);
    expect(f).toHaveBeenCalledTimes(3);
    // backoff 1s, 2s (jitter zerado); esperas de rate limit somam o resto
    expect(r.esperas).toContain(1000);
    expect(r.esperas).toContain(2000);
  });

  it("respeita Retry-After", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(resposta(429, "", { "Retry-After": "7" }))
      .mockResolvedValueOnce(resposta(200, "{}"));
    const { c, r } = cliente(f);
    await c.getJson("https://pncp.gov.br/x");
    expect(r.esperas).toContain(7000);
  });

  it("não tenta de novo em 404", async () => {
    const f = vi.fn().mockResolvedValue(resposta(404, "não achei"));
    const { c } = cliente(f);
    await expect(c.getJson("https://pncp.gov.br/x")).rejects.toMatchObject({
      name: "ErroHttp",
      status: 404,
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("desiste depois do máximo de tentativas em erro de rede", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const { c } = cliente(f, { maxTentativas: 3 });
    await expect(c.getJson("https://pncp.gov.br/x")).rejects.toBeInstanceOf(ErroHttp);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("espaça requisições ao mesmo host, inclusive concorrentes", async () => {
    const f = vi.fn().mockImplementation(async () => resposta(200, "{}"));
    const { c, r } = cliente(f); // 2 req/s → 500 ms
    await Promise.all([
      c.getJson("https://pncp.gov.br/a"),
      c.getJson("https://pncp.gov.br/b"),
      c.getJson("https://pncp.gov.br/c"),
    ]);
    expect(r.esperas.filter((ms) => ms > 0).length).toBe(2);
  });

  it("hosts diferentes não esperam um pelo outro; limite por host é configurável", async () => {
    const f = vi.fn().mockImplementation(async () => resposta(200, "{}"));
    const { c, r } = cliente(f, { reqPorSegundoPorHost: { "brasilapi.com.br": 1 } });
    await c.getJson("https://pncp.gov.br/a");
    await c.getJson("https://brasilapi.com.br/a");
    expect(r.esperas).toEqual([]);
    await c.getJson("https://brasilapi.com.br/b");
    expect(r.esperas).toEqual([1000]);
  });

  it("erro claro quando a resposta não é JSON", async () => {
    const { c } = cliente(vi.fn().mockResolvedValue(resposta(200, "<html>")));
    await expect(c.getJson("https://pncp.gov.br/x")).rejects.toThrow("não é JSON");
  });
});
