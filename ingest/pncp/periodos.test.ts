import { describe, expect, it } from "vitest";
import { dataPncp, dividirPorAno, hojeSaoPaulo, somarDias, timestampPncp } from "./periodos";

describe("dividirPorAno", () => {
  it("quebra por ano civil, último bloco até a data final", () => {
    expect(dividirPorAno("2024-01-01", "2026-10-05")).toEqual([
      { dataInicial: "20240101", dataFinal: "20241231" },
      { dataInicial: "20250101", dataFinal: "20251231" },
      { dataInicial: "20260101", dataFinal: "20261005" },
    ]);
  });

  it("período dentro de um ano vira um bloco (incremental de 3 dias)", () => {
    expect(dividirPorAno("2026-10-02", "2026-10-05")).toEqual([
      { dataInicial: "20261002", dataFinal: "20261005" },
    ]);
  });

  it("virada de ano no incremental", () => {
    expect(dividirPorAno("2025-12-30", "2026-01-02")).toEqual([
      { dataInicial: "20251230", dataFinal: "20251231" },
      { dataInicial: "20260101", dataFinal: "20260102" },
    ]);
  });

  it("nenhum bloco passa de 365 dias, inclusive em ano bissexto", () => {
    for (const b of dividirPorAno("2023-06-15", "2028-03-01")) {
      const ini = new Date(b.dataInicial.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
      const fim = new Date(b.dataFinal.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
      expect((fim.getTime() - ini.getTime()) / 86_400_000).toBeLessThanOrEqual(365);
    }
  });

  it("rejeita datas inválidas ou invertidas", () => {
    expect(() => dividirPorAno("2024/01/01", "2024-02-01")).toThrow();
    expect(() => dividirPorAno("2025-01-01", "2024-01-01")).toThrow(/invertido/);
  });
});

describe("datas do PNCP", () => {
  it("horário sem fuso é Brasília", () => {
    expect(timestampPncp("2025-02-14T11:13:14")).toBe("2025-02-14T11:13:14-03:00");
    expect(timestampPncp("2025-02-14T11:13:14Z")).toBe("2025-02-14T11:13:14Z");
    expect(timestampPncp(null)).toBeNull();
    expect(timestampPncp("lixo")).toBeNull();
  });

  it("data civil", () => {
    expect(dataPncp("2025-01-14")).toBe("2025-01-14");
    expect(dataPncp("2025-01-14T00:00:00")).toBe("2025-01-14");
    expect(dataPncp("")).toBeNull();
  });

  it("hoje em São Paulo e soma de dias", () => {
    expect(hojeSaoPaulo(new Date("2026-10-05T02:00:00Z"))).toBe("2026-10-04");
    expect(somarDias("2026-03-01", -3)).toBe("2026-02-26");
  });
});
