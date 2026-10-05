import { describe, expect, it } from "vitest";
import { formatarCnpj, formatarData, formatarDataHora, formatarMoeda } from "./format";

describe("formatarMoeda", () => {
  it("formata em pt-BR", () => {
    expect(formatarMoeda(1234.56)).toBe("R$ 1.234,56");
    expect(formatarMoeda("85010401.87")).toBe("R$ 85.010.401,87");
  });

  it("não transforma ausência de valor em zero", () => {
    expect(formatarMoeda(null)).toBe("não informado");
    expect(formatarMoeda(undefined)).toBe("não informado");
    expect(formatarMoeda("abc")).toBe("não informado");
  });

  it("mantém zero quando o zero é o dado", () => {
    expect(formatarMoeda(0)).toBe("R$ 0,00");
  });
});

describe("formatarData", () => {
  it("data civil não sofre conversão de fuso", () => {
    expect(formatarData("2025-01-01")).toBe("01/01/2025");
  });

  it("timestamp usa America/Sao_Paulo", () => {
    // 02:00 UTC do dia 2 ainda é dia 1 em São Paulo (UTC-3)
    expect(formatarData("2025-01-02T02:00:00Z")).toBe("01/01/2025");
    expect(formatarDataHora("2025-01-02T02:00:00Z")).toBe("01/01/2025 às 23:00");
  });

  it("ausência de data", () => {
    expect(formatarData(null)).toBe("não informada");
  });
});

describe("formatarCnpj", () => {
  it("formata CNPJ da prefeitura de Campos do Jordão", () => {
    expect(formatarCnpj("45699626000176")).toBe("45.699.626/0001-76");
  });

  it("devolve o original se não tiver 14 dígitos", () => {
    expect(formatarCnpj("123")).toBe("123");
  });
});
