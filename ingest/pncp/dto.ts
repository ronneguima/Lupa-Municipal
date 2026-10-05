import { z } from "zod";

// Validação em tempo de execução só dos campos que usamos (docs/04: APIs públicas mudam sem aviso).
// O payload completo vai para raw_registros; aqui só garantimos o formato do que normalizamos.
// Tipos completos da especificação: ./schema.d.ts (gerado de ./openapi-consulta.json).

const texto = z.string().nullish();
const numero = z.number().nullish();
const idNome = z.object({ id: z.number(), nome: z.string() }).nullish();

export const orgaoEntidade = z.object({
  cnpj: z.string(),
  razaoSocial: z.string(),
  poderId: texto,
  esferaId: texto,
});

export const unidadeOrgao = z.object({
  codigoIbge: texto,
  codigoUnidade: texto,
  nomeUnidade: texto,
  municipioNome: texto,
  ufSigla: texto,
});

export const contratacao = z.object({
  numeroControlePNCP: z.string(),
  orgaoEntidade,
  unidadeOrgao,
  anoCompra: z.number(),
  sequencialCompra: z.number(),
  numeroCompra: texto,
  processo: texto,
  modalidadeId: z.number(),
  modoDisputaNome: texto,
  amparoLegal: z.object({ codigo: numero, nome: texto }).nullish(),
  objetoCompra: texto,
  valorTotalEstimado: numero,
  valorTotalHomologado: numero,
  situacaoCompraNome: texto,
  srp: z.boolean().nullish(),
  emendaParlamentar: z.boolean().nullish(),
  dataAberturaProposta: texto,
  dataEncerramentoProposta: texto,
  dataPublicacaoPncp: texto,
  dataAtualizacaoGlobal: texto,
  linkSistemaOrigem: texto,
});
export type Contratacao = z.infer<typeof contratacao>;

export const contrato = z.object({
  numeroControlePNCP: z.string(),
  numeroControlePncpCompra: texto,
  numeroControlePncpAta: texto,
  orgaoEntidade,
  unidadeOrgao,
  anoContrato: z.number(),
  sequencialContrato: z.number(),
  tipoContrato: idNome,
  categoriaProcesso: idNome,
  numeroContratoEmpenho: texto,
  objetoContrato: texto,
  valorInicial: numero,
  valorGlobal: numero,
  valorAcumulado: numero,
  dataAssinatura: texto,
  dataVigenciaInicio: texto,
  dataVigenciaFim: texto,
  numeroRetificacao: numero,
  frutoAdesao: z.boolean().nullish(),
  emendaParlamentar: z.boolean().nullish(),
  dataPublicacaoPncp: texto,
  dataAtualizacaoGlobal: texto,
  tipoPessoa: texto,
  niFornecedor: texto,
  nomeRazaoSocialFornecedor: texto,
});
export type Contrato = z.infer<typeof contrato>;

export const modalidade = z.object({
  id: z.number(),
  nome: z.string(),
  descricao: texto,
  statusAtivo: z.boolean().nullish(),
});
export type Modalidade = z.infer<typeof modalidade>;

export const item = z.object({
  numeroItem: z.number(),
  descricao: texto,
  materialOuServico: texto,
  quantidade: numero,
  unidadeMedida: texto,
  valorUnitarioEstimado: numero,
  valorTotal: numero,
  criterioJulgamentoNome: texto,
  situacaoCompraItemNome: texto,
  temResultado: z.boolean().nullish(),
  catalogoCodigoItem: texto,
});
export type Item = z.infer<typeof item>;

export const resultado = z.object({
  numeroItem: z.number(),
  sequencialResultado: z.number(),
  tipoPessoa: texto,
  niFornecedor: texto,
  nomeRazaoSocialFornecedor: texto,
  quantidadeHomologada: numero,
  valorUnitarioHomologado: numero,
  valorTotalHomologado: numero,
  percentualDesconto: numero,
  porteFornecedorNome: texto,
  dataResultado: texto,
  situacaoCompraItemResultadoNome: texto,
});
export type Resultado = z.infer<typeof resultado>;

/** Envelope das respostas paginadas da API de consulta (`data` é validado registro a registro). */
export const envelopePagina = z.object({
  data: z.array(z.unknown()),
  totalRegistros: z.number(),
  totalPaginas: z.number(),
  numeroPagina: z.number(),
  paginasRestantes: z.number(),
});
