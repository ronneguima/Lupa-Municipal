import { createClient } from "@supabase/supabase-js";

// Cliente com service role: ignora RLS e escreve no banco.
// SÓ para scripts em ingest/ e alerts/ (GitHub Actions). Nunca no site:
//  1. ESLint proíbe importar este arquivo em app/ e components/ (eslint.config.mjs);
//  2. em tempo de execução, recusa rodar dentro do Next.js.
export function criarClienteAdmin() {
  if (process.env.NEXT_RUNTIME) {
    throw new Error("O cliente admin do Supabase não pode ser usado dentro do Next.js");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}

export type ClienteAdmin = ReturnType<typeof criarClienteAdmin>;
