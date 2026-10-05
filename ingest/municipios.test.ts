import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/ibge/municipios-sp-amostra.json";
import { codigosMonitorados, mapearMunicipios } from "./municipios";

describe("mapearMunicipios (fixture real do IBGE)", () => {
  const linhas = mapearMunicipios(fixture);

  it("mapeia código, nome com acento e UF", () => {
    expect(linhas).toContainEqual({ codigo_ibge: "3509700", nome: "Campos do Jordão", uf: "SP" });
    expect(linhas).toContainEqual({
      codigo_ibge: "3548609",
      nome: "São Bento do Sapucaí",
      uf: "SP",
    });
  });

  it("acha os três monitorados do MVP", () => {
    expect(codigosMonitorados(linhas)).toEqual(["3509700", "3548609", "3548203"]);
  });

  it("falha alto se o código mudar ou o município sumir", () => {
    expect(() => codigosMonitorados(linhas, { "Campos do Jordão": "3500000" })).toThrow(/mudou/);
    expect(() => codigosMonitorados(linhas, { Atlantis: "3599999" })).toThrow(/não encontrado/);
  });

  it("rejeita resposta fora do formato esperado", () => {
    expect(() => mapearMunicipios([{ id: "x" }])).toThrow();
  });
});
