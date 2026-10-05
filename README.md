# Lupa Municipal

Plataforma de fiscalização e controle social de contratos e gastos públicos municipais.
Este repositório começa como um **kit para desenvolvimento com Claude Code**: documentação, schema e prompts prontos.

## Como começar

1. **Pré-requisitos:** Node.js 20+, pnpm (`npm i -g pnpm`), Git, conta no GitHub, Supabase e Vercel, Claude Code instalado.
2. Descompacte esta pasta, entre nela e inicialize o Git:
   ```bash
   cd lupa-municipal
   git init && git add . && git commit -m "kit inicial do projeto"
   ```
3. Crie um projeto no Supabase e guarde URL, anon key e service role key.
4. Abra o Claude Code na pasta:
   ```bash
   claude
   ```
5. Siga `docs/06-prompts-claude-code.md`, começando pelo prompt **0.1**. Um prompt por vez; revise e faça commit entre eles.

## Comandos personalizados do Claude Code

Dentro do Claude Code, digite:
- `/checar-fonte SICONFI` — confirma com chamadas reais os endpoints ainda marcados como [VERIFICAR]
- `/novo-alerta A03` — implementa um alerta do catálogo com testes
- `/revisar-seguranca` — revisão de CPF, chaves, linguagem e robustez antes do commit

## Mapa dos documentos

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Regras do projeto que o Claude Code lê automaticamente em toda sessão |
| `docs/01-visao-produto.md` | O que construir e para quem |
| `docs/02-fontes-de-dados.md` | APIs, endpoints confirmados e a confirmar, armadilhas |
| `docs/03-alertas.md` | Catálogo de 13 alertas com lógica, limiares e falsos positivos |
| `docs/04-arquitetura.md` | Stack, pastas, pipeline de ingestão, custos |
| `docs/05-roadmap.md` | Fases 0 a 5 com checklist |
| `docs/06-prompts-claude-code.md` | Prompts prontos, fase por fase |
| `docs/07-juridico-e-etica.md` | Linguagem dos alertas, LGPD, direito de resposta |
| `supabase/migrations/0001_schema_inicial.sql` | Schema inicial (testado em Postgres 16) |

## Status das fontes (04/10/2026)

- **PNCP (API de consulta):** endpoints e parâmetros confirmados na especificação oficial.
- **Demais fontes** (SICONFI, TCE-SP, BrasilAPI, CGU, Querido Diário, API de itens do PNCP): marcadas [VERIFICAR].
  Rode `/checar-fonte` antes de implementar cada uma.
