import { describe, expect, it } from "vitest";
import contratosFx from "../__fixtures__/pncp/contratos.json";
import pregaoFx from "../__fixtures__/pncp/contratacoes-publicacao-pregao.json";
import itensFx from "../__fixtures__/pncp/integracao-itens.json";
import resultadosFx from "../__fixtures__/pncp/integracao-resultados.json";
import modalidadesFx from "../__fixtures__/pncp/dominio-modalidades.json";
import { contratacao, contrato, item, modalidade, resultado } from "./dto";
import {
  fornecedorDe,
  linhaContratacao,
  linhaContrato,
  linhaItem,
  linhaModalidade,
  linhaOrgao,
  linhaResultado,
  partesNumeroControle,
} from "./normalizar";

const SALT = "sal-de-teste";

describe("fornecedorDe", () => {
  it("PJ usa o CNPJ como id", () => {
    expect(fornecedorDe("PJ", "82845322000104", "SOFTPLAN", SALT).fornecedor).toEqual({
      id: "82845322000104",
      tipo_pessoa: "PJ",
      documento_exibicao: "82.845.322/0001-04",
      nome: "SOFTPLAN",
    });
  });

  it("PF: id por hash, CPF mascarado, CPF removido do nome (MEI)", () => {
    const { fornecedor } = fornecedorDe("PF", "12345678909", "MARIA DA SILVA 12345678909", SALT);
    expect(fornecedor?.id).toMatch(/^pf_[0-9a-f]{24}$/);
    expect(fornecedor?.documento_exibicao).toBe("***.456.789-**");
    expect(fornecedor?.nome).toBe("MARIA DA SILVA ***.456.789-**");
    expect(fornecedor?.status_enriquecimento).toBe("nao_aplicavel");
    expect(JSON.stringify(fornecedor)).not.toContain("12345678909");
  });

  it("infere o tipo pelo tamanho quando tipoPessoa falta", () => {
    expect(fornecedorDe(null, "82845322000104", "X", SALT).fornecedor?.tipo_pessoa).toBe("PJ");
    expect(fornecedorDe(undefined, "12345678909", "X", SALT).fornecedor?.tipo_pessoa).toBe("PF");
  });

  it("documento inválido vira problema de qualidade, não fornecedor", () => {
    expect(fornecedorDe("PJ", "123", "X", SALT)).toEqual({ fornecedor: null, problema: "cnpj_invalido" });
    expect(fornecedorDe(null, null, "X", SALT).problema).toBe("fornecedor_sem_identificacao");
  });
});

describe("partesNumeroControle", () => {
  it("decompõe o número de controle", () => {
    expect(partesNumeroControle("45699626000176-1-000007/2025")).toEqual({
      cnpj: "45699626000176",
      ano: 2025,
      sequencial: 7,
    });
    expect(() => partesNumeroControle("abc")).toThrow();
  });
});

describe("linhas a partir das fixtures reais", () => {
  it("modalidades: 19, com dispensa e inexigibilidade como contratação direta", () => {
    const linhas = modalidadesFx.map((m) => linhaModalidade(modalidade.parse(m)));
    expect(linhas.length).toBeGreaterThanOrEqual(5); // fixture guarda uma amostra
    expect(linhas.find((m) => m.id === 1)?.contratacao_direta).toBe(false);
    expect(linhaModalidade({ id: 8, nome: "Dispensa " }).contratacao_direta).toBe(true);
    expect(linhaModalidade({ id: 8, nome: "Dispensa " }).nome).toBe("Dispensa");
  });

  it("órgão: só esfera municipal é incluído", () => {
    const c = contratacao.parse(pregaoFx.data[0]);
    expect(linhaOrgao(c.orgaoEntidade, "3509700").incluir).toBe(true);
    expect(linhaOrgao({ ...c.orgaoEntidade, esferaId: "F" }, "3509700").incluir).toBe(false);
  });

  it("contratação de pregão", () => {
    const l = linhaContratacao(contratacao.parse(pregaoFx.data[0]));
    expect(l).toMatchObject({
      numero_controle_pncp: "45699626000176-1-000007/2025",
      orgao_cnpj: "45699626000176",
      municipio_ibge: "3509700",
      codigo_unidade: "27647",
      modalidade_id: 6,
      valor_estimado: 1583629.11,
      valor_homologado: null,
      srp: true,
      data_publicacao: "2025-01-24T15:17:57-03:00",
      data_encerramento_proposta: "2025-02-07T08:00:00-03:00",
      url_origem: "https://pncp.gov.br/app/editais/45699626000176/2025/7",
      resultados_coletados_em: null,
    });
  });

  it("contrato: tipo/categoria vêm de objetos {id, nome}", () => {
    const { contrato: l, fornecedor, problemas } = linhaContrato(contrato.parse(contratosFx.data[0]), SALT);
    expect(l).toMatchObject({
      numero_controle_pncp: "45699626000176-2-000001/2025",
      numero_controle_pncp_compra: "45699626000176-1-000020/2025",
      tipo_contrato: "Contrato (termo inicial)",
      tipo_contrato_id: 1,
      categoria_processo: "Compras",
      valor_global: 143489.28,
      data_assinatura: "2025-01-14",
      ano_contrato: 2025,
      sequencial_contrato: 1,
      fornecedor_id: "82845322000104",
      url_origem: "https://pncp.gov.br/app/contratos/45699626000176/2025/1",
    });
    expect(fornecedor?.tipo_pessoa).toBe("PJ");
    expect(problemas).toEqual([]);
  });

  it("contrato de pessoa física não carrega CPF", () => {
    const pf = contratosFx.data.find((c) => c.tipoPessoa === "PF");
    expect(pf).toBeDefined();
    // A fixture guarda o CPF já mascarado; aqui simulamos o dado cru da API com um CPF fictício.
    const cru = { ...pf, niFornecedor: "12345678909", nomeRazaoSocialFornecedor: "FULANO 12345678909" };
    const { contrato: l, fornecedor } = linhaContrato(contrato.parse(cru), SALT);
    expect(fornecedor?.id).toMatch(/^pf_/);
    expect(JSON.stringify({ l, fornecedor })).not.toMatch(/(?<![\d./-])\d{11}(?![\d./-])/);
  });

  it("contrato com valor zero gera problema de qualidade", () => {
    const base = contrato.parse(contratosFx.data[0]);
    const { problemas } = linhaContrato({ ...base, valorGlobal: 0 }, SALT);
    expect(problemas.map((p) => p.problema)).toContain("valor_global_nulo_ou_zero");
  });

  it("itens e resultados", () => {
    const i = linhaItem("X", item.parse(itensFx[0]));
    expect(i).toMatchObject({ numero_item: 1, quantidade: 1, valor_unitario_estimado: 60000, tem_resultado: true });
    const r = linhaResultado("X", resultado.parse(resultadosFx[0]), SALT);
    expect(r.resultado).toMatchObject({
      numero_item: 1,
      sequencial_resultado: 1,
      fornecedor_id: "46628916000191",
      valor_unitario_homologado: 48000,
      porte_fornecedor: "ME",
      data_resultado: "2024-07-21",
    });
  });
});
