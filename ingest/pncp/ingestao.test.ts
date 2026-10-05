import { beforeEach, describe, expect, it } from "vitest";
import dispensaFx from "../__fixtures__/pncp/contratacoes-publicacao-dispensa.json";
import inexigibilidadeFx from "../__fixtures__/pncp/contratacoes-publicacao-inexigibilidade.json";
import pregaoFx from "../__fixtures__/pncp/contratacoes-publicacao-pregao.json";
import contratosFx from "../__fixtures__/pncp/contratos.json";
import contratosAtualizacaoFx from "../__fixtures__/pncp/contratos-atualizacao.json";
import modalidadesFx from "../__fixtures__/pncp/dominio-modalidades.json";
import itensFx from "../__fixtures__/pncp/integracao-itens.json";
import resultadosFx from "../__fixtures__/pncp/integracao-resultados.json";
import { criarClienteHttp } from "../http";
import { criarRepositorioMemoria } from "../repositorio-memoria";
import { criarClientePncp } from "./client";
import { ingerirPncp } from "./ingestao";

const PREFEITURA = "45699626000176";
const INSTITUTO_FEDERAL = "10882594000165";
const CPF_FICTICIO = "12345678909";

type Json = Record<string, unknown> & { data?: Json[] };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Página única: as fixtures guardam uma amostra, então zeramos as páginas restantes. */
const paginaUnica = (fx: Json, data = fx.data) => ({ ...fx, data, totalPaginas: 1, paginasRestantes: 0 });

/** Contratação do Instituto Federal (esfera F) no município: precisa ficar de fora. */
function contratacaoFederal() {
  const c = clone(pregaoFx.data[0]) as Json;
  c.numeroControlePNCP = `${INSTITUTO_FEDERAL}-1-000001/2025`;
  c.orgaoEntidade = { cnpj: INSTITUTO_FEDERAL, razaoSocial: "INSTITUTO FEDERAL", poderId: "E", esferaId: "F" };
  return c;
}

/** Fixtures guardam CPF mascarado; a API real manda o CPF cru. Simulamos com um CPF fictício. */
function contratosComCpfCru() {
  return contratosFx.data.map((c) =>
    c.tipoPessoa === "PF" ? { ...c, niFornecedor: CPF_FICTICIO, nomeRazaoSocialFornecedor: `FULANO ${CPF_FICTICIO}` } : c,
  );
}

interface Cenario {
  urls: string[];
  contratos: Json[];
  falharResultados?: boolean;
}

function fetchFalso(cenario: Cenario): typeof fetch {
  const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
  const vazio = () => new Response(null, { status: 204 });
  return (async (entrada: RequestInfo | URL) => {
    const url = new URL(String(entrada));
    cenario.urls.push(url.toString());
    const q = url.searchParams;
    const p = url.pathname;
    if (p.endsWith("/v1/modalidades")) return json(modalidadesFx);
    if (p.includes("/v1/contratacoes/")) {
      if (q.get("pagina") !== "1" || !q.get("dataInicial")?.startsWith("2025")) return vazio();
      const m = q.get("codigoModalidadeContratacao");
      if (m === "6") return json(paginaUnica(pregaoFx as Json, [...(pregaoFx.data as Json[]), contratacaoFederal()]));
      if (m === "8") return json(paginaUnica(dispensaFx as Json));
      if (m === "9") return json(paginaUnica(inexigibilidadeFx as Json));
      return vazio();
    }
    if (p.endsWith("/v1/contratos") || p.endsWith("/v1/contratos/atualizacao")) {
      if (q.get("cnpjOrgao") === INSTITUTO_FEDERAL) throw new Error("não deveria buscar contratos do órgão federal");
      if (q.get("cnpjOrgao") !== PREFEITURA || !q.get("dataInicial")?.startsWith("2025")) return vazio();
      if (p.endsWith("/atualizacao")) return json(paginaUnica(contratosAtualizacaoFx as Json));
      return json(paginaUnica(contratosFx as Json, cenario.contratos));
    }
    if (p.endsWith("/resultados")) {
      if (cenario.falharResultados) return new Response("erro", { status: 404 });
      return json(resultadosFx);
    }
    if (p.endsWith("/itens")) return json(q.get("pagina") === "1" ? itensFx : []);
    return new Response("rota não simulada: " + p, { status: 404 });
  }) as typeof fetch;
}

function montar(cenario: Partial<Cenario> = {}) {
  const c: Cenario = { urls: [], contratos: contratosComCpfCru(), ...cenario };
  const http = criarClienteHttp({ fetch: fetchFalso(c), sleep: async () => {}, aleatorio: () => 0 });
  return { cenario: c, pncp: criarClientePncp(http) };
}

const OPCOES = { municipioIbge: "3509700", desde: "2025-01-01", ate: "2025-12-31", salt: "sal" };

describe("ingerirPncp (fixtures reais, banco em memória)", () => {
  let mem: ReturnType<typeof criarRepositorioMemoria>;
  beforeEach(() => {
    mem = criarRepositorioMemoria();
  });

  it("carga completa: órgãos municipais, contratações, contratos, fornecedores e resultados", async () => {
    const { pncp } = montar();
    const r = await ingerirPncp(pncp, mem.repo, OPCOES);

    expect(r.modalidades).toBe(19);
    expect(r.orgaos.find((o) => o.cnpj === INSTITUTO_FEDERAL)).toMatchObject({ esfera: "F", incluir: false });
    expect(r.orgaos.find((o) => o.cnpj === PREFEITURA)).toMatchObject({ esfera: "M", incluir: true });

    const contratacoes = mem.linhas("contratacoes");
    expect(contratacoes).toHaveLength(1 + 5 + 3); // pregão + dispensas + inexigibilidades, sem o federal
    expect(contratacoes.some((c) => c.orgao_cnpj === INSTITUTO_FEDERAL)).toBe(false);

    expect(mem.linhas("contratos")).toHaveLength(contratosFx.data.length);
    expect(r.contratos.novos).toBe(contratosFx.data.length);

    // 8 contratações diretas na fila; cada uma com 1 item e 1 resultado (mesma fixture)
    expect(r.resultados.contratacoesProcessadas).toBe(8);
    expect(mem.linhas("resultados_itens")).toHaveLength(8);
    expect(mem.linhas("contratacoes").filter((c) => c.resultados_coletados_em == null)).toHaveLength(1); // só o pregão

    const fornecedores = mem.linhas("fornecedores");
    expect(fornecedores.find((f) => f.id === "46628916000191")).toMatchObject({ status_enriquecimento: "pendente" });
    expect(fornecedores.find((f) => f.tipo_pessoa === "PF")).toMatchObject({ status_enriquecimento: "nao_aplicavel" });

    expect(mem.execucoes[0]).toMatchObject({ fonte: "pncp", status: "ok" });
    expect(r.erros).toEqual([]);
  });

  it("nenhum CPF chega ao banco, nem no bruto", async () => {
    const { pncp } = montar();
    await ingerirPncp(pncp, mem.repo, OPCOES);
    const tudo = JSON.stringify([...mem.tabelas].map(([n, t]) => [n, [...t.values()]]));
    expect(tudo).not.toContain(CPF_FICTICIO);
    expect(tudo).toContain("***.456.789-**");
  });

  it("é idempotente: rodar de novo não duplica nem conta como alterado", async () => {
    await ingerirPncp(montar().pncp, mem.repo, OPCOES);
    const tamanhos = () => Object.fromEntries([...mem.tabelas].map(([n, t]) => [n, t.size]));
    const antes = tamanhos();
    const r2 = await ingerirPncp(montar().pncp, mem.repo, OPCOES);
    expect(tamanhos()).toEqual(antes);
    expect(r2.contratacoes).toMatchObject({ novas: 0, alteradas: 0 });
    expect(r2.contratos).toMatchObject({ novos: 0, alterados: 0 });
    expect(r2.resultados.contratacoesProcessadas).toBe(0); // fila vazia
  });

  it("registro alterado na fonte é regravado", async () => {
    await ingerirPncp(montar().pncp, mem.repo, OPCOES);
    const contratos = contratosComCpfCru();
    contratos[0] = { ...contratos[0], valorGlobal: 999.99 };
    const r2 = await ingerirPncp(montar({ contratos }).pncp, mem.repo, OPCOES);
    expect(r2.contratos).toMatchObject({ novos: 0, alterados: 1 });
    const c = mem.linhas("contratos").find((x) => x.numero_controle_pncp === contratos[0].numeroControlePNCP);
    expect(c?.valor_global).toBe(999.99);
  });

  it("incremental usa /atualizacao com janela de 3 dias", async () => {
    await ingerirPncp(montar().pncp, mem.repo, OPCOES); // órgãos conhecidos
    const { pncp, cenario } = montar();
    await ingerirPncp(pncp, mem.repo, { ...OPCOES, incremental: true, ate: "2025-09-03", etapas: ["contratacoes", "contratos"] });
    const consultas = cenario.urls.filter((u) => u.includes("/api/consulta/"));
    expect(consultas.every((u) => u.includes("/atualizacao"))).toBe(true);
    expect(consultas.every((u) => u.includes("dataInicial=20250831") && u.includes("dataFinal=20250903"))).toBe(true);
  });

  it("falha num resultado não para a fila; a contratação volta na próxima execução", async () => {
    const { pncp } = montar({ falharResultados: true });
    const r = await ingerirPncp(pncp, mem.repo, OPCOES);
    expect(r.erros.length).toBe(8);
    expect(r.resultados.contratacoesProcessadas).toBe(0);
    expect(mem.execucoes[0].status).toBe("ok");
    const r2 = await ingerirPncp(montar().pncp, mem.repo, { ...OPCOES, etapas: ["resultados"] });
    expect(r2.resultados.contratacoesProcessadas).toBe(8);
  });

  it("respeita o limite da fila de resultados", async () => {
    const r = await ingerirPncp(montar().pncp, mem.repo, { ...OPCOES, limiteResultados: 3 });
    expect(r.resultados).toMatchObject({ contratacoesProcessadas: 3, pendentesNaFila: true });
  });

  it("sem salt não roda", async () => {
    await expect(ingerirPncp(montar().pncp, mem.repo, { ...OPCOES, salt: "" })).rejects.toThrow(/CPF_HASH_SALT/);
  });
});
