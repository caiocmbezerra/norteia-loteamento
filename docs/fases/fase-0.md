# Fase 0 — Esqueleto técnico: resumo

Data: 07/11/2026 · Branch: `fase-0/esqueleto`

## Feito

- Monorepo pnpm + Turborepo com `apps/web` e os pacotes `motor-financeiro`, `dominio`, `projecao`, `integracoes`, `db`, `aplicacao`, `ui`.
- TypeScript estrito (inclui `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`), ESLint, Prettier.
- **Fronteiras entre pacotes** ativas e provadas por `pnpm test:fronteiras` (11 verificações). O motor não pode importar banco, framework, Node I/O nem ler o relógio.
- **Motor:** tipo `Centavos` e operações monetárias com `Decimal` de precisão fixa — 12 testes, cobertura de 100% exigida.
- **Domínio:** formatos brasileiros (moeda, data, percentual) com leitura e escrita — 19 testes.
- **Web:** Next.js 16 + Tailwind 4 + shadcn/ui, `lang="pt-BR"`, tema claro/escuro, página provisória mobile-first.
- **Playwright:** teste de ponta a ponta em celular (Pixel 7) e desktop, incluindo verificação de rolagem horizontal.
- **Supabase:** pasta `supabase/` com configuração local (Postgres 17) e o primeiro teste pgTAP, que exige RLS e políticas em toda tabela de `public` (comprovado: falha quando uma tabela sem RLS é criada).
- **CI (GitHub Actions):** três trabalhos — qualidade (formatação, lint, fronteiras, tipos, testes, build), banco (pgTAP) e ponta a ponta.

## Critérios de conclusão

| Critério                                        | Situação                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test` e CI verdes num PR de exemplo       | local verde; CI no PR desta fase                                        |
| Página inicial publicada em ambiente de preview | **pendente**: depende de conectar o repositório à Vercel (ação do dono) |
| Importar banco no motor quebra o lint           | ✅ provado por `pnpm test:fronteiras`                                   |

## Pendente / próximos passos

- Conectar a Vercel ao repositório (instruções na mensagem de entrega da fase).
- Ligar a integração GitHub do Supabase ao projeto oficial na Fase 1, sem deploy automático em produção.
- Fase 1: autenticação, tenants, empresas, SPEs, papéis, empreendimentos, quadras, lotes, auditoria.
