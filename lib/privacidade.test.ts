import { describe, expect, it } from "vitest";
import {
  idFornecedorPf,
  mascararCpf,
  mascararCpfEmTexto,
  sanitizarPayload,
} from "./privacidade";

describe("idFornecedorPf", () => {
  it("é estável e não contém o CPF", () => {
    const a = idFornecedorPf("123.456.789-01", "sal");
    const b = idFornecedorPf("12345678901", "sal");
    expect(a).toBe(b);
    expect(a).toMatch(/^pf_[0-9a-f]{24}$/);
    expect(a).not.toContain("12345678901");
  });

  it("muda com o salt", () => {
    expect(idFornecedorPf("12345678901", "a")).not.toBe(
      idFornecedorPf("12345678901", "b"),
    );
  });

  it("recusa salt vazio e CPF inválido", () => {
    expect(() => idFornecedorPf("12345678901", "")).toThrow();
    expect(() => idFornecedorPf("123", "sal")).toThrow();
  });
});

describe("mascararCpf", () => {
  it("mostra só os dígitos do meio", () => {
    expect(mascararCpf("12345678901")).toBe("***.456.789-**");
    expect(mascararCpf("123.456.789-01")).toBe("***.456.789-**");
  });

  it("não vaza nada se o valor for inválido", () => {
    expect(mascararCpf("123")).toBe("***.***.***-**");
  });
});

describe("mascararCpfEmTexto", () => {
  it("mascara CPF embutido em razão social de MEI (padrão real do PNCP)", () => {
    expect(mascararCpfEmTexto("MARIA DA SILVA 12345678909")).toBe(
      "MARIA DA SILVA ***.456.789-**",
    );
  });

  it("mascara CPF formatado", () => {
    expect(mascararCpfEmTexto("CPF 123.456.789-01 assinou")).toBe(
      "CPF ***.456.789-** assinou",
    );
  });

  it("não mexe em CNPJ nem em número de controle do PNCP", () => {
    const texto = "45699626000176 / 45.699.626/0001-76 / 45132495000140-1-000942/2024";
    expect(mascararCpfEmTexto(texto)).toBe(texto);
  });
});

describe("sanitizarPayload", () => {
  it("percorre objetos e listas", () => {
    const payload = {
      niFornecedor: "98765432100",
      nomeRazaoSocialFornecedor: "FULANO 98765432100",
      valorGlobal: 36000,
      itens: [{ obs: "cpf 98765432100" }],
      orgaoEntidade: { cnpj: "51623908000192" },
    };
    expect(sanitizarPayload(payload)).toEqual({
      niFornecedor: "***.654.321-**",
      nomeRazaoSocialFornecedor: "FULANO ***.654.321-**",
      valorGlobal: 36000,
      itens: [{ obs: "cpf ***.654.321-**" }],
      orgaoEntidade: { cnpj: "51623908000192" },
    });
  });
});
