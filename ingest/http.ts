// Cliente HTTP para as APIs públicas (CLAUDE.md, regra 6):
// rate limit por host, retry com backoff exponencial + jitter, timeout, User-Agent e HTTP 204 = vazio.

export interface OpcoesHttp {
  /** Requisições por segundo por host. Padrão 2. */
  reqPorSegundo?: number;
  /** Sobrescreve `reqPorSegundo` para hosts específicos (ex.: BrasilAPI a 1 req/s). */
  reqPorSegundoPorHost?: Record<string, number>;
  maxTentativas?: number;
  timeoutMs?: number;
  backoffBaseMs?: number;
  contatoEmail?: string;
  // Injetáveis para teste
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  agora?: () => number;
  aleatorio?: () => number;
}

export class ErroHttp extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    readonly corpo?: string,
  ) {
    super(message);
    this.name = "ErroHttp";
  }
}

const sleepPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function deveTentarDeNovo(status: number): boolean {
  return status === 429 || status >= 500;
}

export function criarClienteHttp(opcoes: OpcoesHttp = {}) {
  const {
    reqPorSegundo = 2,
    reqPorSegundoPorHost = {},
    maxTentativas = 5,
    timeoutMs = 30_000,
    backoffBaseMs = 1_000,
    contatoEmail = process.env.CONTATO_EMAIL ?? "",
    fetch: fetchImpl = fetch,
    sleep = sleepPadrao,
    agora = Date.now,
    aleatorio = Math.random,
  } = opcoes;

  const userAgent = `LupaMunicipal/0.1 (+contato: ${contatoEmail || "não informado"})`;
  // Próximo instante liberado por host. Reservar o horário de forma síncrona
  // garante o espaçamento mesmo com chamadas concorrentes.
  const proximoSlot = new Map<string, number>();

  async function aguardarVez(host: string) {
    const intervalo = 1000 / (reqPorSegundoPorHost[host] ?? reqPorSegundo);
    const t = agora();
    const slot = Math.max(t, proximoSlot.get(host) ?? 0);
    proximoSlot.set(host, slot + intervalo);
    if (slot > t) await sleep(slot - t);
  }

  function atrasoRetry(tentativa: number, retryAfter: string | null): number {
    const segundos = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000;
    const exp = backoffBaseMs * 2 ** (tentativa - 1);
    return exp + aleatorio() * exp; // jitter: entre 1x e 2x
  }

  /** Faz GET e devolve o texto do corpo, ou `null` se HTTP 204. */
  async function getTexto(url: string, headers: Record<string, string> = {}): Promise<string | null> {
    const host = new URL(url).host;
    let ultimoErro: unknown;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      await aguardarVez(host);
      let resposta: Response;
      try {
        resposta = await fetchImpl(url, {
          headers: { "User-Agent": userAgent, Accept: "application/json", ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (erro) {
        // Erro de rede ou timeout: tenta de novo.
        ultimoErro = erro;
        if (tentativa < maxTentativas) await sleep(atrasoRetry(tentativa, null));
        continue;
      }

      if (resposta.status === 204) return null;
      if (resposta.ok) return await resposta.text();

      const corpo = await resposta.text().catch(() => "");
      ultimoErro = new ErroHttp(`HTTP ${resposta.status} em ${url}`, url, resposta.status, corpo);
      if (!deveTentarDeNovo(resposta.status)) throw ultimoErro;
      if (tentativa < maxTentativas) {
        await sleep(atrasoRetry(tentativa, resposta.headers.get("retry-after")));
      }
    }

    if (ultimoErro instanceof ErroHttp) throw ultimoErro;
    throw new ErroHttp(
      `Falha após ${maxTentativas} tentativas em ${url}: ${String(ultimoErro)}`,
      url,
    );
  }

  /** GET de JSON. HTTP 204 (sem resultados, comum no PNCP) vira `null`. */
  async function getJson<T = unknown>(url: string, headers?: Record<string, string>): Promise<T | null> {
    const texto = await getTexto(url, headers);
    if (texto === null || texto.trim() === "") return null;
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new ErroHttp(`Resposta não é JSON em ${url}`, url, 200, texto.slice(0, 500));
    }
  }

  return { getJson, getTexto, userAgent };
}

export type ClienteHttp = ReturnType<typeof criarClienteHttp>;
