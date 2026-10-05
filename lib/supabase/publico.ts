import { createClient } from "@supabase/supabase-js";

// Cliente de leitura para o site (chave anon). RLS libera só `select` nas tabelas públicas.
export function criarClientePublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}
