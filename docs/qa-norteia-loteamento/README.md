# Auditoria de QA — NorteIA Loteamento (15/11/2026)

Auditoria técnica, suíte de testes e relatório de execução. **Nenhum código de produção, regra, parâmetro, política, migration ou dado de produção foi alterado.**

| Arquivo                                              | Conteúdo                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [00-auditoria.md](00-auditoria.md)                   | Arquitetura e inventário real do banco: tabelas, RLS, funções, gatilhos, cron e segredos |
| [01-matriz-cobertura.md](01-matriz-cobertura.md)     | Matriz módulo × tipo de teste e RN → testes → lacunas                                    |
| [02-analise-riscos.md](02-analise-riscos.md)         | As 15 áreas de maior risco, ordenadas pela criticidade observada                         |
| [03-catalogo-testes.md](03-catalogo-testes.md)       | Catálogo com 629 testes individuais e anexo de 100 testes novos executados               |
| [04-fluxos-cruzados.md](04-fluxos-cruzados.md)       | 45 fluxos integrados (FLX-001…045)                                                       |
| [05-invariantes.md](05-invariantes.md)               | 26 invariantes (22 automatizadas em SQL) e resultado em teste, local e produção          |
| [06-dados-sinteticos.md](06-dados-sinteticos.md)     | Massa sintética, dados de borda, concorrência, carga e limpeza                           |
| [07-relatorio-execucao.md](07-relatorio-execucao.md) | **Relatório de execução:** resultados, achados A-01…A-13, evidências e recomendações     |
| [08-lacunas.md](08-lacunas.md)                       | O que não foi possível cobrir, regras não documentadas e conformidade legal              |
| [09-regressao.md](09-regressao.md)                   | Smoke test e rotina pré-release                                                          |

**Testes criados:**

- `packages/motor-financeiro/src/oraculo.test.ts`: oráculo BigInt independente.
- `supabase/tests/database/046_qa_isolamento_rpc.test.sql`, `047_qa_achados.test.sql` e `048_qa_invariantes.test.sql`.
- `supabase/tests/auxiliares/qa_cenario.psql` e `qa_invariantes.psql`.
- `scripts/qa/concorrencia.sh`, `carga.sh` e `invariantes.sh`.
