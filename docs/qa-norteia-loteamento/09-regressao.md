# QA — Regressão e smoke test

> Data: 15/11/2026. A rotina usa só as ferramentas que o projeto já tem: Vitest, pgTAP via `supabase test db` e Playwright. Os scripts de `scripts/qa/` ficam à parte para concorrência, carga e invariantes.

## 1. Smoke test (a cada PR, já no CI)

| #   | Verificação                                       | Teste que cobre                                                         | Suíte         |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| 1   | Autenticação (entrar, cadastrar, recuperar senha) | `e2e/cadastro-inicial.spec.ts`, `e2e/convite.spec.ts`                   | e2e           |
| 2   | Isolamento entre tenants                          | `001_isolamento_entre_clientes`, `046_qa_isolamento_rpc`                | pgTAP         |
| 3   | Acesso por papel                                  | `004_papeis_e_convites`, `046` (SEG-RPC-018…024: matriz papel × função) | pgTAP         |
| 4   | Cadastro de empreendimento                        | `006_empreendimento_com_lotes`, `e2e/cadastro-inicial.spec.ts`          | pgTAP, e2e    |
| 5   | Cadastro de lote                                  | `006`, `029_planta_lotes`, `037_matricula_lote`                         | pgTAP         |
| 6   | Reserva                                           | `009_comercial`                                                         | pgTAP         |
| 7   | Proposta                                          | `030_propostas`, `e2e/propostas.spec.ts`                                | pgTAP, e2e    |
| 8   | Venda                                             | `009`, `028_tabela_precos`, `e2e/comercial.spec.ts`                     | pgTAP, e2e    |
| 9   | Contrato                                          | `010_contratos_carteira`                                                | pgTAP         |
| 10  | Geração de parcelas                               | `motor.test.ts`, `oraculo.test.ts` (MOT-UNID-5xx)                       | Vitest        |
| 11  | Cálculo financeiro                                | `caso-referencia.test.ts` (RN-F17), `oraculo.test.ts`                   | Vitest        |
| 12  | Reajuste                                          | `011_reajuste`                                                          | pgTAP         |
| 13  | Recebimento                                       | `010`, `012_cobranca_asaas`, `e2e/carteira.spec.ts`                     | pgTAP, e2e    |
| 14  | Estorno                                           | `010`, `047` (REC-BANCO-102…105)                                        | pgTAP         |
| 15  | Distrato                                          | `016_distrato`, `035_distrato_itens`, `distrato.test.ts`                | pgTAP, Vitest |
| 16  | Relatórios                                        | `019_painel_consolidado`, `021_dimob`, `023_contabil`                   | pgTAP         |
| 17  | Auditoria                                         | `002_auditoria`, `048_qa_invariantes` (INV-013)                         | pgTAP         |

Os achados conhecidos ficam em `047_qa_achados` como `todo`: aparecem no relatório sem quebrar o CI. Quando um achado for corrigido, o pgTAP passa a acusar _"unexpectedly succeeded"_; nesse caso, retire o `todo` correspondente para que o comportamento correto vire regressão.

## 2. Rotina pré-release (antes de cada versão)

```bash
# 1. Qualidade e unidade (inclui o oráculo independente do motor)
pnpm format:check && pnpm lint && pnpm test:fronteiras && pnpm typecheck && pnpm test

# 2. Banco: recria do zero e roda pgTAP, lint e tipos
pnpm exec supabase db reset && pnpm db:test && pnpm db:lint

# 3. E2E + acessibilidade
cd apps/web && pnpm exec playwright test --trace off && cd ../..

# 4. Concorrência real (10 repetições) — só no banco local
scripts/qa/concorrencia.sh 10        # resultado em test-results/qa-concorrencia.txt

# 5. Carga sintética (5.000 lotes, 3.000 contratos, 201.000 parcelas) — só no banco local
scripts/qa/carga.sh 15               # resultado em test-results/qa-carga.txt

# 6. Invariantes no banco local e, somente leitura, em produção
scripts/qa/invariantes.sh
scripts/qa/invariantes.sh "postgresql://<usuário-somente-leitura>@<host>/postgres"

# 7. Limpar o banco local
pnpm exec supabase db reset
```

**Critério de liberação** (resumo de `07-relatorio-execucao.md`, §6):

- passos 1 a 3 verdes;
- passo 4 com 10/10 em todos os cenários, exceto os achados aceitos formalmente;
- passo 6 sem violação nova;
- nenhum achado CRÍTICO ou ALTO sem decisão registrada do dono do produto.
