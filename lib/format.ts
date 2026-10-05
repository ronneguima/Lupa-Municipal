import { somenteDigitos } from "./privacidade";

export { mascararCpf } from "./privacidade";

const FUSO = "America/Sao_Paulo";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short" });

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  dateStyle: "short",
  timeStyle: "short",
});

/** `1234.56` → `R$ 1.234,56`. Nulo vira "não informado" (nunca "R$ 0,00"). */
export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "não informado";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "não informado";
  // Intl usa espaço não separável depois de "R$"; normalizamos para espaço comum.
  return moeda.format(n).replace(/ /g, " ");
}

export function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return "não informada";
  // "2025-03-10" sem hora é data civil: não converter de fuso.
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return data.format(new Date(valor));
}

export function formatarDataHora(valor: string | Date): string {
  return dataHora.format(new Date(valor)).replace(",", " às");
}

/** `45699626000176` → `45.699.626/0001-76` */
export function formatarCnpj(cnpj: string): string {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
