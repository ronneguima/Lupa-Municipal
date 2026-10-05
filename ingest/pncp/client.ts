// Cliente do PNCP (API de consulta + API de integração). Só rede e validação; nada de banco.
import type { z } from "zod";
import type { ClienteHttp } from "../http";
import {
  contratacao,
  contrato,
  envelopePagina,
  item,
  modalidade,
  resultado,
  type Contratacao,
  type Contrato,
  type Item,
  type Modalidade,
  type Resultado,
} from "./dto";
import type { Periodo } from "./periodos";

export const PNCP_CONSULTA = "https://pncp.gov.br/api/consulta";
export const PNCP_INTEGRACAO = "https://pncp.gov.br/api/pncp";

/** Registro como veio da API (para raw_registros) + versão validada, ou o erro de validação. */
export interface Registro<T> {
  bruto: unknown;
  dto: T | null;
  erro?: string;
}

type TipoConsulta = "publicacao" | "atualizacao";

function validar<T>(schema: z.ZodType<T>, bruto: unknown): Registro<T> {
  const r = schema.safeParse(bruto);
  return r.success
    ? { bruto, dto: r.data }
    : { bruto, dto: null, erro: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export function criarClientePncp(http: ClienteHttp) {
  /** Percorre todas as páginas de um endpoint de consulta paginado. HTTP 204 = fim. */
  async function* paginar<T>(
    montarUrl: (pagina: number) => string,
    schema: z.ZodType<T>,
  ): AsyncGenerator<Registro<T>> {
    for (let n = 1; ; n++) {
      const json = await http.getJson(montarUrl(n));
      if (json === null) return;
      // Registros validados um a um: um registro fora do formato não derruba a página.
      const { data, paginasRestantes } = envelopePagina.parse(json);
      for (const bruto of data) yield validar(schema, bruto);
      if (paginasRestantes <= 0 || data.length === 0) return;
    }
  }

  async function modalidades(): Promise<Modalidade[]> {
    const json = await http.getJson<unknown[]>(`${PNCP_INTEGRACAO}/v1/modalidades`);
    return (json ?? []).map((m) => modalidade.parse(m));
  }

  function contratacoes(p: {
    tipo: TipoConsulta;
    periodo: Periodo;
    modalidadeId: number;
    municipioIbge: string;
  }): AsyncGenerator<Registro<Contratacao>> {
    const q = new URLSearchParams({
      dataInicial: p.periodo.dataInicial,
      dataFinal: p.periodo.dataFinal,
      codigoModalidadeContratacao: String(p.modalidadeId),
      codigoMunicipioIbge: p.municipioIbge,
      tamanhoPagina: "50", // máximo deste endpoint
    });
    return paginar(
      (n) => `${PNCP_CONSULTA}/v1/contratacoes/${p.tipo}?${q}&pagina=${n}`,
      contratacao,
    );
  }

  function contratos(p: {
    tipo: TipoConsulta;
    periodo: Periodo;
    cnpjOrgao: string;
  }): AsyncGenerator<Registro<Contrato>> {
    const q = new URLSearchParams({
      dataInicial: p.periodo.dataInicial,
      dataFinal: p.periodo.dataFinal,
      cnpjOrgao: p.cnpjOrgao,
      tamanhoPagina: "500", // máximo deste endpoint
    });
    const caminho = p.tipo === "publicacao" ? "contratos" : "contratos/atualizacao";
    return paginar((n) => `${PNCP_CONSULTA}/v1/${caminho}?${q}&pagina=${n}`, contrato);
  }

  /**
   * Itens de uma compra. Não sabemos se o endpoint pagina (docs/02): pedimos páginas de 100
   * e paramos quando vier página incompleta ou repetida.
   */
  async function itens(cnpj: string, ano: number, sequencial: number): Promise<Registro<Item>[]> {
    const base = `${PNCP_INTEGRACAO}/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
    const tamanho = 100;
    const todos: Registro<Item>[] = [];
    const vistos = new Set<number>();
    for (let n = 1; ; n++) {
      const json = await http.getJson<unknown[]>(`${base}?pagina=${n}&tamanhoPagina=${tamanho}`);
      const lista = json ?? [];
      const novos = lista.filter((b) => {
        const num = (b as { numeroItem?: number }).numeroItem;
        return typeof num !== "number" || !vistos.has(num);
      });
      for (const b of novos) {
        const r = validar(item, b);
        if (r.dto) vistos.add(r.dto.numeroItem);
        todos.push(r);
      }
      if (lista.length < tamanho || novos.length === 0) return todos;
    }
  }

  async function resultados(
    cnpj: string,
    ano: number,
    sequencial: number,
    numeroItem: number,
  ): Promise<Registro<Resultado>[]> {
    const json = await http.getJson<unknown[]>(
      `${PNCP_INTEGRACAO}/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${numeroItem}/resultados`,
    );
    return (json ?? []).map((b) => validar(resultado, b));
  }

  return { modalidades, contratacoes, contratos, itens, resultados };
}

export type ClientePncp = ReturnType<typeof criarClientePncp>;
