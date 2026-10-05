// Ingestão do PNCP para um município (docs/02 "Estratégia por município", docs/04 "Pipeline").
//   1. modalidades (domínio)  2. contratações por modalidade → órgãos  3. contratos por órgão municipal
//   4. itens + resultados das contratações diretas (fila, em ritmo lento)
// Bruto primeiro (sanitizado), hash para pular o que não mudou, upsert idempotente por chave natural.
import { createHash } from "node:crypto";
import { sanitizarPayload } from "../../lib/privacidade";
import type { Linha, RegistroRaw, Repositorio } from "../repositorio";
import type { ClientePncp, Registro } from "./client";
import type { Contratacao, Contrato } from "./dto";
import {
  MODALIDADES_CONTRATACAO_DIRETA,
  linhaContratacao,
  linhaContrato,
  linhaItem,
  linhaModalidade,
  linhaOrgao,
  linhaResultado,
  partesNumeroControle,
  type LinhaFornecedor,
  type ProblemaQualidade,
} from "./normalizar";
import { dividirPorAno, hojeSaoPaulo, somarDias } from "./periodos";

export type Etapa = "contratacoes" | "contratos" | "resultados";
export const TODAS_ETAPAS: Etapa[] = ["contratacoes", "contratos", "resultados"];

export interface OpcoesIngestaoPncp {
  municipioIbge: string;
  /** YYYY-MM-DD. Ignorado no modo incremental. */
  desde?: string;
  /** YYYY-MM-DD. Padrão: hoje em São Paulo. */
  ate?: string;
  /** Usa os endpoints /atualizacao com janela de `diasIncremental` dias. */
  incremental?: boolean;
  diasIncremental?: number;
  etapas?: Etapa[];
  /** Máximo de contratações por execução na fila de itens/resultados (rate limit do PNCP). */
  limiteResultados?: number;
  salt: string;
  log?: (msg: string) => void;
}

export interface ResumoIngestaoPncp {
  modalidades: number;
  orgaos: { cnpj: string; razao_social: string; esfera: string | null; incluir: boolean }[];
  contratacoes: { lidas: number; novas: number; alteradas: number };
  contratos: { lidos: number; novos: number; alterados: number; valorGlobalNovosEAlterados: number };
  resultados: { contratacoesProcessadas: number; itens: number; resultados: number; pendentesNaFila: boolean };
  problemasQualidade: number;
  erros: string[];
}

const hash = (payload: unknown) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");

/**
 * Grava no bruto só o que é novo ou mudou e devolve esses registros.
 * O payload é sanitizado ANTES do hash e da gravação: CPF nunca chega ao banco.
 */
interface Validado<T> {
  chave: string;
  bruto: unknown;
  dto: T;
}

async function filtrarAlterados<T>(repo: Repositorio, fonte: string, registros: Validado<T>[]) {
  const anteriores = await repo.hashesRaw(fonte, registros.map((r) => r.chave));
  const raws: RegistroRaw[] = [];
  const alterados: (Validado<T> & { novo: boolean })[] = [];
  for (const r of registros) {
    const payload = sanitizarPayload(r.bruto);
    const h = hash(payload);
    const antes = anteriores.get(r.chave);
    if (antes === h) continue;
    raws.push({ fonte, chave: r.chave, payload, hash: h });
    alterados.push({ ...r, novo: antes === undefined });
  }
  if (raws.length) {
    await repo.upsert(
      "raw_registros",
      raws.map((r) => ({ ...r, coletado_em: new Date().toISOString(), normalizado: true })),
      "fonte,chave",
    );
  }
  return alterados;
}

async function gravarFornecedores(repo: Repositorio, fornecedores: (LinhaFornecedor | null)[]) {
  const agora = new Date().toISOString();
  const validos = fornecedores.filter((f): f is LinhaFornecedor => f !== null);
  // PJ e PF/PE em lotes separados: colunas diferentes (PJ não sobrescreve status_enriquecimento).
  const pj = validos.filter((f) => f.tipo_pessoa === "PJ").map((f) => ({ ...f, atualizado_em: agora }));
  const outros = validos.filter((f) => f.tipo_pessoa !== "PJ").map((f) => ({ ...f, atualizado_em: agora }));
  if (pj.length) await repo.upsert("fornecedores", pj, "id");
  if (outros.length) await repo.upsert("fornecedores", outros, "id");
}

async function gravarProblemas(repo: Repositorio, problemas: ProblemaQualidade[]) {
  if (!problemas.length) return;
  await repo.upsert(
    "qualidade_dados",
    problemas.map((p) => ({ ...p, detalhe: p.detalhe ?? null })),
    "fonte,chave,problema",
    { ignorarExistentes: true },
  );
}

export async function ingerirPncp(
  pncp: ClientePncp,
  repo: Repositorio,
  op: OpcoesIngestaoPncp,
): Promise<ResumoIngestaoPncp> {
  const log = op.log ?? (() => {});
  const etapas = new Set(op.etapas ?? TODAS_ETAPAS);
  const ate = op.ate ?? hojeSaoPaulo();
  const desde = op.incremental ? somarDias(ate, -(op.diasIncremental ?? 3)) : op.desde;
  if (!desde) throw new Error("Informe --desde (YYYY-MM-DD) ou use --incremental");
  if (!op.salt) throw new Error("CPF_HASH_SALT não configurado");
  const tipo = op.incremental ? "atualizacao" : "publicacao";
  const periodos = dividirPorAno(desde, ate);
  const ibge = op.municipioIbge;

  const resumo: ResumoIngestaoPncp = {
    modalidades: 0,
    orgaos: [],
    contratacoes: { lidas: 0, novas: 0, alteradas: 0 },
    contratos: { lidos: 0, novos: 0, alterados: 0, valorGlobalNovosEAlterados: 0 },
    resultados: { contratacoesProcessadas: 0, itens: 0, resultados: 0, pendentesNaFila: false },
    problemasQualidade: 0,
    erros: [],
  };
  const erro = (msg: string) => {
    resumo.erros.push(msg);
    log(`ERRO ${msg}`);
  };

  const execucaoId = await repo.iniciarExecucao("pncp", ibge, {
    desde,
    ate,
    tipo,
    etapas: [...etapas],
  });

  try {
    // 1. Domínio de modalidades (19 em out/2026; nunca um intervalo fixo)
    const modalidades = await pncp.modalidades();
    await repo.upsert("modalidades", modalidades.map(linhaModalidade), "id");
    resumo.modalidades = modalidades.length;
    log(`modalidades: ${modalidades.length}`);

    // 2. Contratações por modalidade; descobre órgãos
    const orgaosVistos = new Map<string, ReturnType<typeof linhaOrgao>>();
    if (etapas.has("contratacoes")) {
      for (const periodo of periodos) {
        for (const m of modalidades) {
          const registros = await validos(
            pncp.contratacoes({ tipo, periodo, modalidadeId: m.id, municipioIbge: ibge }),
            (c: Contratacao) => c.numeroControlePNCP,
            (msg) => erro(`contratação fora do formato (mod ${m.id}, ${periodo.dataInicial}): ${msg}`),
          );
          resumo.contratacoes.lidas += registros.lidos;
          if (!registros.validos.length) continue;
          for (const { dto } of registros.validos) {
            if (!orgaosVistos.has(dto.orgaoEntidade.cnpj)) {
              orgaosVistos.set(dto.orgaoEntidade.cnpj, linhaOrgao(dto.orgaoEntidade, ibge));
            }
          }
          // Órgãos antes das contratações (FK)
          await repo.upsert("orgaos", [...orgaosVistos.values()], "cnpj");
          const incluidos = registros.validos.filter((r) => orgaosVistos.get(r.dto.orgaoEntidade.cnpj)?.incluir);
          const alterados = await filtrarAlterados(repo, "pncp_contratacao", incluidos);
          if (alterados.length) {
            await repo.upsert(
              "contratacoes",
              alterados.map((a) => ({ ...linhaContratacao(a.dto), municipio_ibge: ibge })),
              "numero_controle_pncp",
            );
          }
          resumo.contratacoes.novas += alterados.filter((a) => a.novo).length;
          resumo.contratacoes.alteradas += alterados.filter((a) => !a.novo).length;
          log(`contratações ${periodo.dataInicial}-${periodo.dataFinal} mod ${m.id}: ${registros.lidos} lidas, ${alterados.length} novas/alteradas`);
        }
      }
      resumo.orgaos = [...orgaosVistos.values()].map(({ cnpj, razao_social, esfera, incluir }) => ({
        cnpj,
        razao_social,
        esfera,
        incluir,
      }));
    }

    // 3. Contratos de cada órgão municipal (/v1/contratos não filtra por município)
    if (etapas.has("contratos")) {
      const cnpjs = new Set(await repo.orgaosIncluidos(ibge));
      for (const o of orgaosVistos.values()) if (o.incluir) cnpjs.add(o.cnpj);
      if (!cnpjs.size) log("nenhum órgão municipal conhecido: rode a etapa de contratações primeiro");
      for (const periodo of periodos) {
        for (const cnpj of cnpjs) {
          const registros = await validos(
            pncp.contratos({ tipo, periodo, cnpjOrgao: cnpj }),
            (c: Contrato) => c.numeroControlePNCP,
            (msg) => erro(`contrato fora do formato (${cnpj}): ${msg}`),
          );
          resumo.contratos.lidos += registros.lidos;
          if (!registros.validos.length) continue;
          const alterados = await filtrarAlterados(repo, "pncp_contrato", registros.validos);
          const linhas = alterados.map((a) => linhaContrato(a.dto, op.salt));
          await gravarFornecedores(repo, linhas.map((l) => l.fornecedor));
          if (linhas.length) {
            await repo.upsert(
              "contratos",
              linhas.map((l) => ({ ...l.contrato, municipio_ibge: ibge })),
              "numero_controle_pncp",
            );
          }
          const problemas = linhas.flatMap((l) => l.problemas);
          await gravarProblemas(repo, problemas);
          resumo.problemasQualidade += problemas.length;
          resumo.contratos.novos += alterados.filter((a) => a.novo).length;
          resumo.contratos.alterados += alterados.filter((a) => !a.novo).length;
          resumo.contratos.valorGlobalNovosEAlterados += linhas.reduce((s, l) => s + (l.contrato.valor_global ?? 0), 0);
          log(`contratos ${periodo.dataInicial}-${periodo.dataFinal} ${cnpj}: ${registros.lidos} lidos, ${alterados.length} novos/alterados`);
        }
      }
    }

    // 4. Itens e resultados das contratações diretas: quem venceu a dispensa que não virou contrato
    if (etapas.has("resultados")) {
      const limite = op.limiteResultados ?? 200;
      const fila = await repo.filaResultados(ibge, MODALIDADES_CONTRATACAO_DIRETA, limite + 1);
      resumo.resultados.pendentesNaFila = fila.length > limite;
      const concluidas: string[] = [];
      for (const numero of fila.slice(0, limite)) {
        try {
          const { cnpj, ano, sequencial } = partesNumeroControle(numero);
          const itens = await pncp.itens(cnpj, ano, sequencial);
          const itensValidos = itens.flatMap((i) => (i.dto ? [i.dto] : []));
          for (const i of itens) if (!i.dto) erro(`item fora do formato (${numero}): ${i.erro}`);
          await repo.upsert("raw_registros", [rawDe("pncp_itens", numero, itens.map((i) => i.bruto))], "fonte,chave");
          await repo.upsert("itens_contratacao", itensValidos.map((i) => linhaItem(numero, i)), "contratacao_pncp,numero_item");
          resumo.resultados.itens += itensValidos.length;

          for (const it of itensValidos.filter((i) => i.temResultado !== false)) {
            const res = await pncp.resultados(cnpj, ano, sequencial, it.numeroItem);
            for (const r of res) if (!r.dto) erro(`resultado fora do formato (${numero} item ${it.numeroItem}): ${r.erro}`);
            const linhas = res.flatMap((r) => (r.dto ? [linhaResultado(numero, r.dto, op.salt)] : []));
            await repo.upsert(
              "raw_registros",
              [rawDe("pncp_resultados", `${numero}#${it.numeroItem}`, res.map((r) => r.bruto))],
              "fonte,chave",
            );
            await gravarFornecedores(repo, linhas.map((l) => l.fornecedor));
            await repo.upsert(
              "resultados_itens",
              linhas.map((l) => l.resultado),
              "contratacao_pncp,numero_item,sequencial_resultado",
            );
            const problemas = linhas.flatMap((l) => l.problemas);
            await gravarProblemas(repo, problemas);
            resumo.problemasQualidade += problemas.length;
            resumo.resultados.resultados += linhas.length;
          }
          concluidas.push(numero);
          resumo.resultados.contratacoesProcessadas++;
        } catch (e) {
          // Uma contratação com problema não para a fila; fica para a próxima execução.
          erro(`itens/resultados de ${numero}: ${(e as Error).message}`);
        }
        if (concluidas.length >= 20) await repo.marcarResultadosColetados(concluidas.splice(0));
      }
      await repo.marcarResultadosColetados(concluidas);
      log(`resultados: ${resumo.resultados.contratacoesProcessadas} contratações, ${resumo.resultados.resultados} resultados${resumo.resultados.pendentesNaFila ? " (fila continua na próxima execução)" : ""}`);
    }

    await repo.finalizarExecucao(execucaoId, {
      registros_novos: resumo.contratacoes.novas + resumo.contratos.novos,
      registros_alterados: resumo.contratacoes.alteradas + resumo.contratos.alterados,
      erros: resumo.erros,
      status: "ok",
    });
    return resumo;
  } catch (e) {
    await repo.finalizarExecucao(execucaoId, {
      registros_novos: resumo.contratacoes.novas + resumo.contratos.novos,
      registros_alterados: resumo.contratacoes.alteradas + resumo.contratos.alterados,
      erros: [...resumo.erros, (e as Error).message],
      status: "erro",
    });
    throw e;
  }
}

/** Consome um gerador paginado, separando registros válidos dos que vieram fora do formato. */
async function validos<T>(
  registros: AsyncIterable<Registro<T>>,
  chaveDe: (dto: T) => string,
  aoInvalido: (msg: string) => void,
): Promise<{ lidos: number; validos: Validado<T>[] }> {
  let lidos = 0;
  const lista: Validado<T>[] = [];
  for await (const r of registros) {
    lidos++;
    if (r.dto === null) aoInvalido(r.erro ?? "registro inválido");
    else lista.push({ chave: chaveDe(r.dto), bruto: r.bruto, dto: r.dto });
  }
  return { lidos, validos: lista };
}

function rawDe(fonte: string, chave: string, payload: unknown): Linha {
  const limpo = sanitizarPayload(payload);
  return { fonte, chave, payload: limpo, hash: hash(limpo), coletado_em: new Date().toISOString(), normalizado: true };
}
