// CLI de ingestão: pnpm ingest:<fonte> -- [opções]
import { parseArgs } from "node:util";
import { criarClienteAdmin } from "../lib/supabase/admin";
import { criarClienteHttp } from "./http";
import { ingerirMunicipios } from "./municipios";
import { criarClientePncp } from "./pncp/client";
import { ingerirPncp, TODAS_ETAPAS, type Etapa } from "./pncp/ingestao";
import { criarRepositorioSupabase } from "./repositorio";

// PNCP bloqueia rajadas (docs/02, "Limites da API"): 1 requisição a cada 2 s.
const http = () => criarClienteHttp({ reqPorSegundoPorHost: { "pncp.gov.br": 0.5 } });

const fontes: Record<string, (args: string[]) => Promise<unknown>> = {
  municipios: () => ingerirMunicipios(http(), criarClienteAdmin()),

  pncp: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        municipio: { type: "string" },
        desde: { type: "string" },
        ate: { type: "string" },
        incremental: { type: "boolean", default: false },
        etapas: { type: "string" },
        "limite-resultados": { type: "string" },
      },
    });
    if (!values.municipio) throw new Error("Informe --municipio <código IBGE>");
    const etapas = values.etapas?.split(",").map((e) => e.trim()) as Etapa[] | undefined;
    const invalida = etapas?.find((e) => !TODAS_ETAPAS.includes(e));
    if (invalida) throw new Error(`Etapa desconhecida: ${invalida}. Use: ${TODAS_ETAPAS.join(",")}`);

    return ingerirPncp(criarClientePncp(http()), criarRepositorioSupabase(criarClienteAdmin()), {
      municipioIbge: values.municipio,
      desde: values.desde,
      ate: values.ate,
      incremental: values.incremental,
      etapas,
      limiteResultados: values["limite-resultados"] ? Number(values["limite-resultados"]) : undefined,
      salt: process.env.CPF_HASH_SALT ?? "",
      log: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
    });
  },
};

async function main() {
  // pnpm repassa o "--" separador; descartamos.
  const [fonte, ...args] = process.argv.slice(2).filter((a) => a !== "--");
  const executar = fontes[fonte];
  if (!executar) {
    console.error(`Fonte desconhecida: ${fonte}. Disponíveis: ${Object.keys(fontes).join(", ")}`);
    process.exit(1);
  }
  const resultado = await executar(args);
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
