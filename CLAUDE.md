# Instruções para o Claude neste repositório

Leia `README.md` e, antes de mexer em regra de negócio, `docs/dominio.md`. Decisões de produto estão em `docs/decisoes.md`; não as reabra sem pedido do dono do produto.

## Regras inegociáveis

- Todo indicador sai do fluxo de caixa único calculado pelo `packages/motor-financeiro`. Nada é digitado.
- O motor é puro: sem banco, rede, relógio (`new Date()`, `Date.now()`) ou aleatoriedade. O lint impõe isso.
- Dinheiro: `Centavos` (inteiro) e `Decimal`. Nunca ponto flutuante.
- Parâmetros legais/tributários nunca no código: tabelas com vigência. Na dúvida, `// VALIDAR COM CONTADOR` / `// VALIDAR COM ADVOGADO` e registre em `docs/pendencias-legais.md`.
- Toda tabela nova em `public` tem RLS e políticas (o teste `supabase/tests/database/000_rls_obrigatorio.test.sql` falha caso contrário) e gatilho de auditoria.
- Nunca altere outros projetos Supabase do dono. O projeto deste produto é `krmfljdyzuiipfsfpqvn`.

## Antes de enviar

`pnpm format:check && pnpm lint && pnpm test:fronteiras && pnpm typecheck && pnpm test` e, se mexeu no banco, `pnpm exec supabase db reset && pnpm db:test && pnpm db:lint && pnpm db:tipos`. Testes de banco usam os auxiliares de `supabase/tests/auxiliares/testes.psql` (usuários, troca de usuário, contagem por tenant).

## Estilo

Português do Brasil em código de domínio, UI, testes, commits e docs. Commits pequenos: `tipo(escopo): descrição`.
