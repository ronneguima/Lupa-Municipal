import { createHash } from "node:crypto";

// CLAUDE.md, regra 4: CPF nunca é armazenado.
// Pessoa física vira 'pf_' + sha256(cpf + salt) truncado; na tela, CPF mascarado.

const TAMANHO_HASH = 24;

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function idFornecedorPf(cpf: string, salt: string): string {
  if (!salt) throw new Error("CPF_HASH_SALT não configurado");
  const digitos = somenteDigitos(cpf);
  if (digitos.length !== 11) throw new Error("CPF deve ter 11 dígitos");
  const hash = createHash("sha256")
    .update(digitos + salt)
    .digest("hex");
  return "pf_" + hash.slice(0, TAMANHO_HASH);
}

/** `12345678901` → `***.456.789-**` */
export function mascararCpf(cpf: string): string {
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return "***.***.***-**";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

// 11 dígitos isolados (não pega pedaço de CNPJ de 14) ou no formato 000.000.000-00.
const CPF_EM_TEXTO = /(?<![\d./-])(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![\d./-])/g;

/**
 * Mascara CPFs embutidos em texto livre. Padrão real do PNCP: MEI com razão social
 * "NOME DA PESSOA 12345678909" (CPF dentro do nome).
 */
export function mascararCpfEmTexto(texto: string): string {
  return texto.replace(CPF_EM_TEXTO, (cpf) => mascararCpf(cpf));
}

/** Aplica `mascararCpfEmTexto` em todas as strings de um JSON (antes de gravar em raw_registros). */
export function sanitizarPayload<T>(valor: T): T {
  if (typeof valor === "string") return mascararCpfEmTexto(valor) as T;
  if (Array.isArray(valor)) return valor.map(sanitizarPayload) as T;
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, sanitizarPayload(v)]),
    ) as T;
  }
  return valor;
}
