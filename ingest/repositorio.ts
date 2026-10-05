// Acesso ao banco usado pela ingestão. A interface existe para testar a ingestão sem Supabase
// (ver repositorio-memoria.ts); a implementação real usa o cliente admin (service role).
import type { ClienteAdmin } from "../lib/supabase/admin";

export type Linha = Record<string, unknown>;

export interface RegistroRaw {
  fonte: string;
  chave: string;
  payload: unknown; // já sanitizado
  hash: string;
}

export interface ResumoExecucao {
  registros_novos: number;
  registros_alterados: number;
  erros: unknown[];
  status: "ok" | "erro";
}

export interface Repositorio {
  /** Upsert por `conflito` (colunas separadas por vírgula). Linhas repetidas no lote: vale a última. */
  upsert(tabela: string, linhas: Linha[], conflito: string, opcoes?: { ignorarExistentes?: boolean }): Promise<void>;
  hashesRaw(fonte: string, chaves: string[]): Promise<Map<string, string>>;
  orgaosIncluidos(municipioIbge: string): Promise<string[]>;
  filaResultados(municipioIbge: string, modalidades: number[], limite: number): Promise<string[]>;
  marcarResultadosColetados(numerosControle: string[]): Promise<void>;
  iniciarExecucao(fonte: string, municipioIbge: string, parametros: Linha): Promise<number>;
  finalizarExecucao(id: number, resumo: ResumoExecucao): Promise<void>;
}

/** Remove linhas com a mesma chave de conflito (Postgres recusa a mesma linha duas vezes num upsert). */
export function deduplicar(linhas: Linha[], conflito: string): Linha[] {
  const cols = conflito.split(",").map((c) => c.trim());
  const porChave = new Map<string, Linha>();
  for (const l of linhas) porChave.set(cols.map((c) => String(l[c])).join("\u0000"), l);
  return [...porChave.values()];
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
  return r;
}

export function criarRepositorioSupabase(db: ClienteAdmin): Repositorio {
  const falhar = (contexto: string, erro: { message: string } | null) => {
    if (erro) throw new Error(`${contexto}: ${erro.message}`);
  };

  return {
    async upsert(tabela, linhas, conflito, opcoes) {
      for (const lote of lotes(deduplicar(linhas, conflito), 500)) {
        const { error } = await db
          .from(tabela)
          .upsert(lote, { onConflict: conflito, ignoreDuplicates: opcoes?.ignorarExistentes ?? false });
        falhar(`upsert em ${tabela}`, error);
      }
    },

    async hashesRaw(fonte, chaves) {
      const mapa = new Map<string, string>();
      // Lotes pequenos: as chaves vão na URL do PostgREST.
      for (const lote of lotes(chaves, 100)) {
        const { data, error } = await db
          .from("raw_registros")
          .select("chave, hash")
          .eq("fonte", fonte)
          .in("chave", lote);
        falhar("leitura de raw_registros", error);
        for (const r of data ?? []) mapa.set(r.chave as string, r.hash as string);
      }
      return mapa;
    },

    async orgaosIncluidos(municipioIbge) {
      const { data, error } = await db
        .from("orgaos")
        .select("cnpj")
        .eq("municipio_ibge", municipioIbge)
        .eq("incluir", true);
      falhar("leitura de orgaos", error);
      return (data ?? []).map((o) => o.cnpj as string);
    },

    async filaResultados(municipioIbge, modalidades, limite) {
      const { data, error } = await db
        .from("contratacoes")
        .select("numero_controle_pncp")
        .eq("municipio_ibge", municipioIbge)
        .in("modalidade_id", modalidades)
        .is("resultados_coletados_em", null)
        .order("data_publicacao", { ascending: false })
        .limit(limite);
      falhar("leitura da fila de resultados", error);
      return (data ?? []).map((c) => c.numero_controle_pncp as string);
    },

    async marcarResultadosColetados(numeros) {
      for (const lote of lotes(numeros, 100)) {
        const { error } = await db
          .from("contratacoes")
          .update({ resultados_coletados_em: new Date().toISOString() })
          .in("numero_controle_pncp", lote);
        falhar("marcar resultados coletados", error);
      }
    },

    async iniciarExecucao(fonte, municipioIbge, parametros) {
      const { data, error } = await db
        .from("ingestao_execucoes")
        .insert({ fonte, municipio_ibge: municipioIbge, parametros })
        .select("id")
        .single();
      falhar("registrar execução", error);
      return data!.id as number;
    },

    async finalizarExecucao(id, resumo) {
      const { error } = await db
        .from("ingestao_execucoes")
        .update({ ...resumo, erros: resumo.erros.length ? resumo.erros : null, finalizado_em: new Date().toISOString() })
        .eq("id", id);
      falhar("finalizar execução", error);
    },
  };
}
