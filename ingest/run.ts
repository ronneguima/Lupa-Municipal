// CLI de ingestão: pnpm ingest:<fonte> -- [opções]
import { criarClienteAdmin } from "../lib/supabase/admin";
import { criarClienteHttp } from "./http";
import { ingerirMunicipios } from "./municipios";

const fontes: Record<string, () => Promise<unknown>> = {
  municipios: () => ingerirMunicipios(criarClienteHttp(), criarClienteAdmin()),
};

async function main() {
  const [fonte] = process.argv.slice(2);
  const executar = fontes[fonte];
  if (!executar) {
    console.error(`Fonte desconhecida: ${fonte}. Disponíveis: ${Object.keys(fontes).join(", ")}`);
    process.exit(1);
  }
  const resultado = await executar();
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
