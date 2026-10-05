// PNCP → linhas do banco. Funções puras: nada de rede nem banco aqui.
import { formatarCnpj } from "../../lib/format";
import {
  idFornecedorPf,
  mascararCpf,
  mascararCpfEmTexto,
  somenteDigitos,
} from "../../lib/privacidade";
import type { Contratacao, Contrato, Item, Modalidade, Resultado } from "./dto";
import { dataPncp, timestampPncp } from "./periodos";

/** Dispensa e inexigibilidade (Lei 14.133, arts. 74 e 75). */
export const MODALIDADES_CONTRATACAO_DIRETA = [8, 9];

export interface LinhaFornecedor {
  id: string;
  tipo_pessoa: "PJ" | "PF" | "PE";
  documento_exibicao: string;
  nome: string;
  /** Só PF/PE recebem valor; PJ fica com o default 'pendente' (fila de enriquecimento). */
  status_enriquecimento?: "nao_aplicavel";
}

export interface ProblemaQualidade {
  fonte: string;
  chave: string;
  problema: string;
  detalhe?: Record<string, unknown>;
}

// Links públicos do PNCP. [VERIFICAR no navegador antes de publicar o site]
export const urlContratacao = (cnpj: string, ano: number, seq: number) =>
  `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
export const urlContrato = (cnpj: string, ano: number, seq: number) =>
  `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${seq}`;

/** Decompõe "45699626000176-1-000007/2025" → cnpj, ano, sequencial. */
export function partesNumeroControle(numero: string) {
  const m = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(numero);
  if (!m) throw new Error(`numeroControlePNCP fora do padrão: ${numero}`);
  return { cnpj: m[1], sequencial: Number(m[2]), ano: Number(m[3]) };
}

/**
 * Identidade do fornecedor. CPF nunca sai daqui: vira hash (id) e máscara (exibição),
 * e é removido do nome (MEI traz CPF na razão social).
 */
export function fornecedorDe(
  tipoPessoa: string | null | undefined,
  ni: string | null | undefined,
  nome: string | null | undefined,
  salt: string,
): { fornecedor: LinhaFornecedor | null; problema?: string } {
  const digitos = somenteDigitos(ni ?? "");
  const nomeLimpo = mascararCpfEmTexto((nome ?? "").trim()) || "Nome não informado";
  const tipo = tipoPessoa ?? (digitos.length === 11 ? "PF" : digitos.length === 14 ? "PJ" : null);

  if (tipo === "PJ") {
    if (digitos.length !== 14) return { fornecedor: null, problema: "cnpj_invalido" };
    return {
      fornecedor: {
        id: digitos,
        tipo_pessoa: "PJ",
        documento_exibicao: formatarCnpj(digitos),
        nome: nomeLimpo,
      },
    };
  }
  if (tipo === "PF") {
    if (digitos.length !== 11) return { fornecedor: null, problema: "cpf_invalido" };
    return {
      fornecedor: {
        id: idFornecedorPf(digitos, salt),
        tipo_pessoa: "PF",
        documento_exibicao: mascararCpf(digitos),
        nome: nomeLimpo,
        status_enriquecimento: "nao_aplicavel",
      },
    };
  }
  if (tipo === "PE") {
    const ident = mascararCpfEmTexto((ni ?? "").trim());
    if (!ident) return { fornecedor: null, problema: "fornecedor_sem_identificacao" };
    return {
      fornecedor: {
        id: "pe_" + ident.replace(/[^\w.-]/g, ""),
        tipo_pessoa: "PE",
        documento_exibicao: "estrangeiro",
        nome: nomeLimpo,
        status_enriquecimento: "nao_aplicavel",
      },
    };
  }
  return { fornecedor: null, problema: "fornecedor_sem_identificacao" };
}

export function linhaModalidade(m: Modalidade) {
  return {
    id: m.id,
    nome: m.nome.trim(),
    descricao: m.descricao ?? null,
    ativa: m.statusAtivo ?? true,
    contratacao_direta: MODALIDADES_CONTRATACAO_DIRETA.includes(m.id),
  };
}

export function linhaOrgao(o: Contratacao["orgaoEntidade"], municipioIbge: string) {
  return {
    cnpj: o.cnpj,
    razao_social: o.razaoSocial,
    esfera: o.esferaId ?? null,
    poder: o.poderId ?? null,
    municipio_ibge: municipioIbge,
    // Só esfera municipal (docs/02). Ex.: Instituto Federal (esfera F) com campus na cidade fica de fora.
    incluir: o.esferaId === "M",
    atualizado_em: new Date().toISOString(),
  };
}

export function linhaContratacao(c: Contratacao) {
  return {
    numero_controle_pncp: c.numeroControlePNCP,
    orgao_cnpj: c.orgaoEntidade.cnpj,
    municipio_ibge: c.unidadeOrgao.codigoIbge ?? null,
    codigo_unidade: c.unidadeOrgao.codigoUnidade ?? null,
    unidade_nome: c.unidadeOrgao.nomeUnidade ?? null,
    ano_compra: c.anoCompra,
    sequencial_compra: c.sequencialCompra,
    numero_compra: c.numeroCompra ?? null,
    processo: c.processo ?? null,
    modalidade_id: c.modalidadeId,
    modo_disputa: c.modoDisputaNome ?? null,
    amparo_legal_codigo: c.amparoLegal?.codigo ?? null,
    amparo_legal_nome: c.amparoLegal?.nome ?? null,
    objeto: c.objetoCompra ? mascararCpfEmTexto(c.objetoCompra) : null,
    valor_estimado: c.valorTotalEstimado ?? null,
    valor_homologado: c.valorTotalHomologado ?? null,
    situacao: c.situacaoCompraNome ?? null,
    srp: c.srp ?? null,
    emenda_parlamentar: c.emendaParlamentar ?? null,
    data_abertura_proposta: timestampPncp(c.dataAberturaProposta),
    data_encerramento_proposta: timestampPncp(c.dataEncerramentoProposta),
    data_publicacao: timestampPncp(c.dataPublicacaoPncp),
    data_atualizacao_fonte: timestampPncp(c.dataAtualizacaoGlobal),
    link_sistema_origem: c.linkSistemaOrigem ?? null,
    url_origem: urlContratacao(c.orgaoEntidade.cnpj, c.anoCompra, c.sequencialCompra),
    fonte: "pncp",
    coletado_em: new Date().toISOString(),
    // Mudou na fonte → itens/resultados precisam ser buscados de novo.
    resultados_coletados_em: null,
  };
}

export function linhaContrato(c: Contrato, salt: string) {
  const { fornecedor, problema } = fornecedorDe(
    c.tipoPessoa,
    c.niFornecedor,
    c.nomeRazaoSocialFornecedor,
    salt,
  );
  const problemas: ProblemaQualidade[] = [];
  const chave = c.numeroControlePNCP;
  if (problema) problemas.push({ fonte: "pncp_contrato", chave, problema, detalhe: { tipoPessoa: c.tipoPessoa } });
  // Zero publicado como valor não é dado: alertas nunca usam (docs/03).
  if (!c.valorGlobal) {
    problemas.push({ fonte: "pncp_contrato", chave, problema: "valor_global_nulo_ou_zero", detalhe: { valorGlobal: c.valorGlobal ?? null } });
  }
  if (c.dataVigenciaInicio && c.dataVigenciaFim && c.dataVigenciaFim < c.dataVigenciaInicio) {
    problemas.push({ fonte: "pncp_contrato", chave, problema: "vigencia_invertida", detalhe: { inicio: c.dataVigenciaInicio, fim: c.dataVigenciaFim } });
  }

  return {
    fornecedor,
    problemas,
    contrato: {
      numero_controle_pncp: c.numeroControlePNCP,
      numero_controle_pncp_compra: c.numeroControlePncpCompra ?? null,
      numero_controle_pncp_ata: c.numeroControlePncpAta ?? null,
      orgao_cnpj: c.orgaoEntidade.cnpj,
      municipio_ibge: c.unidadeOrgao.codigoIbge ?? null,
      codigo_unidade: c.unidadeOrgao.codigoUnidade ?? null,
      fornecedor_id: fornecedor?.id ?? null,
      tipo_contrato_id: c.tipoContrato?.id ?? null,
      tipo_contrato: c.tipoContrato?.nome ?? null,
      categoria_processo_id: c.categoriaProcesso?.id ?? null,
      categoria_processo: c.categoriaProcesso?.nome ?? null,
      ano_contrato: c.anoContrato,
      sequencial_contrato: c.sequencialContrato,
      numero_contrato: c.numeroContratoEmpenho ?? null,
      objeto: c.objetoContrato ? mascararCpfEmTexto(c.objetoContrato) : null,
      valor_inicial: c.valorInicial ?? null,
      valor_global: c.valorGlobal ?? null,
      valor_acumulado: c.valorAcumulado ?? null,
      data_assinatura: dataPncp(c.dataAssinatura),
      vigencia_inicio: dataPncp(c.dataVigenciaInicio),
      vigencia_fim: dataPncp(c.dataVigenciaFim),
      numero_retificacao: c.numeroRetificacao ?? null,
      fruto_adesao: c.frutoAdesao ?? null,
      emenda_parlamentar: c.emendaParlamentar ?? null,
      data_publicacao: timestampPncp(c.dataPublicacaoPncp),
      data_atualizacao_fonte: timestampPncp(c.dataAtualizacaoGlobal),
      url_origem: urlContrato(c.orgaoEntidade.cnpj, c.anoContrato, c.sequencialContrato),
      fonte: "pncp",
      coletado_em: new Date().toISOString(),
    },
  };
}

export function linhaItem(contratacaoPncp: string, i: Item) {
  return {
    contratacao_pncp: contratacaoPncp,
    numero_item: i.numeroItem,
    descricao: i.descricao ? mascararCpfEmTexto(i.descricao) : null,
    material_ou_servico: i.materialOuServico ?? null,
    quantidade: i.quantidade ?? null,
    unidade_medida: i.unidadeMedida ?? null,
    valor_unitario_estimado: i.valorUnitarioEstimado ?? null,
    valor_total_estimado: i.valorTotal ?? null,
    criterio_julgamento: i.criterioJulgamentoNome ?? null,
    situacao: i.situacaoCompraItemNome ?? null,
    tem_resultado: i.temResultado ?? null,
    codigo_catalogo: i.catalogoCodigoItem ?? null,
    coletado_em: new Date().toISOString(),
  };
}

export function linhaResultado(contratacaoPncp: string, r: Resultado, salt: string) {
  const { fornecedor, problema } = fornecedorDe(r.tipoPessoa, r.niFornecedor, r.nomeRazaoSocialFornecedor, salt);
  const chave = `${contratacaoPncp}#${r.numeroItem}#${r.sequencialResultado}`;
  return {
    fornecedor,
    problemas: problema ? [{ fonte: "pncp_resultado", chave, problema }] : [],
    resultado: {
      contratacao_pncp: contratacaoPncp,
      numero_item: r.numeroItem,
      sequencial_resultado: r.sequencialResultado,
      fornecedor_id: fornecedor?.id ?? null,
      quantidade_homologada: r.quantidadeHomologada ?? null,
      valor_unitario_homologado: r.valorUnitarioHomologado ?? null,
      valor_total_homologado: r.valorTotalHomologado ?? null,
      percentual_desconto: r.percentualDesconto ?? null,
      porte_fornecedor: r.porteFornecedorNome ?? null,
      data_resultado: dataPncp(r.dataResultado),
      situacao: r.situacaoCompraItemResultadoNome ?? null,
      coletado_em: new Date().toISOString(),
    },
  };
}
