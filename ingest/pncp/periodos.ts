// Datas para a API do PNCP: yyyyMMdd, janela máxima de 365 dias (docs/02, "Limites da API").

export interface Periodo {
  dataInicial: string; // yyyyMMdd
  dataFinal: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje (YYYY-MM-DD) no fuso America/Sao_Paulo. */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const compacta = (iso: string) => iso.replaceAll("-", "");

/**
 * Divide [desde, ate] em blocos por ano civil (cada bloco cabe na janela de 365 dias).
 * Blocos grandes = menos requisições, o que importa com o rate limit do PNCP.
 */
export function dividirPorAno(desde: string, ate: string): Periodo[] {
  if (!ISO.test(desde) || !ISO.test(ate)) throw new Error("Datas devem estar em YYYY-MM-DD");
  if (desde > ate) throw new Error(`Período invertido: ${desde} > ${ate}`);
  const blocos: Periodo[] = [];
  let inicio = desde;
  while (inicio <= ate) {
    const fimDoAno = `${inicio.slice(0, 4)}-12-31`;
    const fim = fimDoAno < ate ? fimDoAno : ate;
    blocos.push({ dataInicial: compacta(inicio), dataFinal: compacta(fim) });
    inicio = somarDias(fim, 1);
  }
  return blocos;
}

/**
 * PNCP devolve horários sem fuso ("2025-02-14T11:13:14"), no horário de Brasília.
 * Brasil não tem horário de verão desde 2019, então -03:00 é fixo.
 */
export function timestampPncp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(valor)) return valor;
  return /^\d{4}-\d{2}-\d{2}T/.test(valor) ? `${valor}-03:00` : null;
}

/** "2025-01-14" ou "2025-01-14T00:00:00" → "2025-01-14". */
export function dataPncp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m ? m[1] : null;
}
