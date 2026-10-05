import { z } from "zod";
import type { ClienteAdmin } from "../lib/supabase/admin";
import type { ClienteHttp } from "./http";

// Fonte: API de localidades do IBGE (docs/02, seção 7). Códigos nunca digitados à mão:
// os monitorados são identificados pelo nome e o código vem da API.
export const URL_MUNICIPIOS_SP =
  "https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios";

/** MVP: Serra da Mantiqueira paulista. Códigos confirmados no IBGE em 04/10/2026. */
export const MONITORADOS_MVP: Record<string, string> = {
  "Campos do Jordão": "3509700",
  "São Bento do Sapucaí": "3548609",
  "Santo Antônio do Pinhal": "3548203",
};

const municipioIbge = z.object({
  id: z.number().int(),
  nome: z.string().min(1),
  microrregiao: z.object({
    mesorregiao: z.object({ UF: z.object({ sigla: z.string().length(2) }) }),
  }),
});

export interface LinhaMunicipio {
  codigo_ibge: string;
  nome: string;
  uf: string;
}

export function mapearMunicipios(json: unknown): LinhaMunicipio[] {
  const lista = z.array(municipioIbge).parse(json);
  return lista.map((m) => {
    const codigo = String(m.id);
    if (!/^\d{7}$/.test(codigo)) throw new Error(`Código IBGE inválido: ${codigo}`);
    return { codigo_ibge: codigo, nome: m.nome, uf: m.microrregiao.mesorregiao.UF.sigla };
  });
}

/** Confere que os nomes monitorados existem na API e que o código bate com o esperado. */
export function codigosMonitorados(linhas: LinhaMunicipio[], esperados = MONITORADOS_MVP): string[] {
  return Object.entries(esperados).map(([nome, codigoEsperado]) => {
    const achado = linhas.find((l) => l.nome === nome);
    if (!achado) throw new Error(`Município monitorado não encontrado no IBGE: ${nome}`);
    if (achado.codigo_ibge !== codigoEsperado) {
      throw new Error(
        `Código IBGE de ${nome} mudou: esperado ${codigoEsperado}, API retornou ${achado.codigo_ibge}`,
      );
    }
    return achado.codigo_ibge;
  });
}

export async function ingerirMunicipios(http: ClienteHttp, db: ClienteAdmin) {
  const json = await http.getJson(URL_MUNICIPIOS_SP);
  const linhas = mapearMunicipios(json);
  const monitorados = codigosMonitorados(linhas);
  const agora = new Date().toISOString();

  // Upsert só das colunas da fonte: não sobrescreve `monitorado` nem `populacao`.
  const { error: erroUpsert } = await db
    .from("municipios")
    .upsert(linhas.map((l) => ({ ...l, atualizado_em: agora })), { onConflict: "codigo_ibge" });
  if (erroUpsert) throw erroUpsert;

  const { error: erroMonitorado } = await db
    .from("municipios")
    .update({ monitorado: true })
    .in("codigo_ibge", monitorados);
  if (erroMonitorado) throw erroMonitorado;

  return { total: linhas.length, monitorados };
}
