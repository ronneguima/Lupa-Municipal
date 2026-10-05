// Repositório em memória para testes. Imita o upsert do PostgREST (só as colunas enviadas são
// atualizadas), os defaults relevantes do schema e confere as chaves estrangeiras da migration.
import { deduplicar, type Linha, type Repositorio, type ResumoExecucao } from "./repositorio";

const DEFAULTS: Record<string, Linha> = {
  fornecedores: { status_enriquecimento: "pendente" },
  orgaos: { incluir: true },
};

// tabela.coluna → tabela referenciada e coluna (supabase/migrations)
const FKS: [string, string, string, string][] = [
  ["contratacoes", "orgao_cnpj", "orgaos", "cnpj"],
  ["contratacoes", "modalidade_id", "modalidades", "id"],
  ["contratos", "orgao_cnpj", "orgaos", "cnpj"],
  ["contratos", "fornecedor_id", "fornecedores", "id"],
  ["itens_contratacao", "contratacao_pncp", "contratacoes", "numero_controle_pncp"],
  ["resultados_itens", "contratacao_pncp", "contratacoes", "numero_controle_pncp"],
  ["resultados_itens", "fornecedor_id", "fornecedores", "id"],
];

export function criarRepositorioMemoria() {
  const tabelas = new Map<string, Map<string, Linha>>();
  const execucoes: (Linha & { id: number })[] = [];
  const tabela = (nome: string) => {
    if (!tabelas.has(nome)) tabelas.set(nome, new Map());
    return tabelas.get(nome)!;
  };
  const linhas = (nome: string) => [...tabela(nome).values()];

  function conferirFks(nome: string, l: Linha) {
    for (const [t, col, ref, refCol] of FKS) {
      if (t !== nome || l[col] === null || l[col] === undefined) continue;
      if (!linhas(ref).some((r) => r[refCol] === l[col])) {
        throw new Error(`FK violada: ${t}.${col}=${String(l[col])} não existe em ${ref}.${refCol}`);
      }
    }
  }

  const repo: Repositorio = {
    async upsert(nome, novas, conflito, opcoes) {
      const cols = conflito.split(",");
      for (const l of deduplicar(novas, conflito)) {
        conferirFks(nome, l);
        const chave = cols.map((c) => String(l[c])).join("\u0000");
        const atual = tabela(nome).get(chave);
        if (atual && opcoes?.ignorarExistentes) continue;
        tabela(nome).set(chave, atual ? { ...atual, ...l } : { ...DEFAULTS[nome], ...l });
      }
    },
    async hashesRaw(fonte, chaves) {
      const m = new Map<string, string>();
      for (const r of linhas("raw_registros")) {
        if (r.fonte === fonte && chaves.includes(r.chave as string)) m.set(r.chave as string, r.hash as string);
      }
      return m;
    },
    async orgaosIncluidos(ibge) {
      return linhas("orgaos").filter((o) => o.municipio_ibge === ibge && o.incluir).map((o) => o.cnpj as string);
    },
    async filaResultados(ibge, modalidades, limite) {
      return linhas("contratacoes")
        .filter((c) => c.municipio_ibge === ibge && modalidades.includes(c.modalidade_id as number) && c.resultados_coletados_em == null)
        .slice(0, limite)
        .map((c) => c.numero_controle_pncp as string);
    },
    async marcarResultadosColetados(numeros) {
      for (const c of linhas("contratacoes")) {
        if (numeros.includes(c.numero_controle_pncp as string)) c.resultados_coletados_em = new Date().toISOString();
      }
    },
    async iniciarExecucao(fonte, municipio_ibge, parametros) {
      const id = execucoes.length + 1;
      execucoes.push({ id, fonte, municipio_ibge, parametros, status: "rodando" });
      return id;
    },
    async finalizarExecucao(id, resumo: ResumoExecucao) {
      Object.assign(execucoes.find((e) => e.id === id)!, resumo);
    },
  };

  return { repo, linhas, execucoes, tabelas };
}
