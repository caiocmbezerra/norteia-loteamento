# QA — O que não foi possível cobrir

> Data: 15/11/2026. Nenhuma limitação foi omitida. Responsável pela validação: **DP** (dono do produto), **ADV** (advogado do cliente), **CONT** (contador do cliente), **ENG** (engenharia).

## 1. Infraestrutura indisponível ou bloqueada

| Item                                                   | Situação                                                                           | Efeito                                                                                                                                                                      | Como destravar                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Fontes legais oficiais (planalto.gov.br, Receita, BCB) | **BLOQUEADO**: a rede da sessão não resolve `www.planalto.gov.br`                  | A conformidade legal (§3) foi feita contra o texto da lei conhecido e marcada "a confirmar na fonte oficial"                                                                | Liberar o host na rede do ambiente, ou validação pelo ADV |
| Asaas sandbox nesta sessão                             | Não usado: sem chave na sessão e por regra (só simulação)                          | Webhooks testados com o mock do banco (`privado.asaas_chamar` substituído no teste 012); o ciclo real em sandbox foi validado antes, em 13/11 (pagamento em dia e atrasado) | Repetir com a chave sandbox se necessário                 |
| Restauração de backup                                  | **NÃO EXECUTADO**: o Supabase local não tem PITR; restaurar em produção é proibido | Só `db reset` (recriação por migrations) foi exercitado                                                                                                                     | Projeto de homologação com PITR                           |
| Indisponibilidade real do banco ou da rede             | **NÃO EXECUTADO**                                                                  | Testado apenas o que o banco faz com erro de terceiro (mock): `erro_consulta` no webhook                                                                                    | Teste de caos em homologação                              |
| Tablet e 375 px                                        | **NÃO EXECUTADO** nesta auditoria                                                  | O projeto Playwright `celular` usa Pixel 7 (412 px); falta um caso a 375 px                                                                                                 | Novo projeto Playwright com viewport 375×667              |
| Carga com p95 por tela (HTTP)                          | **NÃO EXECUTADO**                                                                  | Medição feita no banco, com RLS e com o papel real; não mede rede, Next.js nem renderização                                                                                 | k6 ou Playwright com tracing contra `next start`          |

## 2. Funcionalidades ausentes (confirmadas no código)

- Cancelamento de aditivo. O caminho real é um novo aditivo de renegociação.
- Reversão de distrato e estorno de pagamento de devolução.
- Estorno da devolução de crédito do comprador.
- Encerramento de permuta. Nenhuma função altera `permutas.situacao`.
- Comissões como registro próprio: só existem `vendas.comissao_percentual` e `comissao_modo`. Não há pagamento, estorno nem extrato do corretor, que a RN-C07 prevê.
- Funcionalidades por plano: `privado.tem_funcionalidade` não é usada. Só o limite de lotes é aplicado.
- Contabilidade por partidas dobradas persistidas. A exportação é por eventos (D-081), e um estorno posterior à exportação não gera evento de estorno.
- Transferência de vencimento em fim de semana ou feriado: não há regra (vencimento em dias corridos).
- Teto de taxa de juros remuneratórios e de plausibilidade de datas da venda (A-05).
- Reenvio de e-mail que falhou: a chave única de `envios_email` também vale para as falhas.
- Proteção contra spam em `registrar_interesse` (anônimo) além da janela de 10 minutos.

## 3. Conformidade legal: análise técnica, não parecer jurídico (PENDENTE, ADV)

Os valores abaixo são as **sugestões da plataforma** em `parametro_valores` (escopo plataforma, desde 01/01/2026). Todos estão marcados com a pendência legal correspondente e aparecem ao cliente como "sugestão não confirmada" (D-059).

| Parâmetro                                  | Valor                                        | Referência normativa (texto do art. 32-A da Lei 6.766/1979, incluído pela Lei 13.786/2018; **fonte oficial não consultada nesta sessão**) | Observação técnica                                                                          |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `distrato.fruicao_mensal`                  | 0,75% a.m.                                   | Inciso I: fruição de até 0,75% sobre o valor atualizado do contrato                                                                       | Coerente com o texto conhecido                                                              |
| `distrato.clausula_penal` / `limite_penal` | 10% / 10%                                    | Inciso II: cláusula penal e despesas administrativas limitadas a 10% do valor atualizado                                                  | Coerente; o motor só **avisa** quando o teto é excedido, não bloqueia (D-106)               |
| `distrato.deduz_comissao`                  | não                                          | Inciso V: comissão de corretagem, quando integrada ao preço                                                                               | Depende do contrato do cliente                                                              |
| `distrato.parcelas_devolucao`              | 12                                           | §1º: devolução em até 12 parcelas mensais                                                                                                 | Coerente                                                                                    |
| `distrato.carencia_devolucao_meses`        | 12                                           | §1º: carência diferente para obras em andamento (prazo contado da conclusão das obras) e para obras concluídas (contado da rescisão)      | **Risco:** um único prazo fixo de 12 meses não distingue as duas situações. Validar com ADV |
| `carteira.multa_atraso`                    | 2%                                           | CDC art. 52 §1º (2% em relação de consumo) e Código Civil                                                                                 | Coerente para consumo; o banco **não impõe** o teto (A-02)                                  |
| `carteira.juros_mora_mensal`               | 1% a.m.                                      | Código Civil art. 406 (taxa legal)                                                                                                        | Validar com ADV (PL-04)                                                                     |
| `carteira.reajuste_*`                      | 12 meses, defasagem de 2, negativo "ignorar" | Lei 10.192/2001 (periodicidade anual)                                                                                                     | "Ignorar" descarta a deflação sem compensar depois (regra implícita, PL-03)                 |
| Venda antes do registro                    | bloqueada, exceto com justificativa          | Lei 6.766, art. 37                                                                                                                        | PL-01: a exceção existe no código (`justificativa_sem_registro`)                            |

**O sistema não identifica a natureza jurídica do empreendimento** (loteamento × condomínio de lotes × incorporação). O art. 32-A só se aplica a loteamentos; incorporações seguem a Lei 4.591/1964 (art. 67-A). **Recomendação:** enquanto PL-02 não for respondida pelo cliente, impedir `executar_distrato` com parâmetros só sugeridos, ou exigir confirmação explícita registrada em auditoria.

Pendências legais e contábeis em aberto, sem alteração: PL-01 a PL-24 (`docs/pendencias-legais.md`).

## 4. Regras não documentadas (encontradas só no código; DP)

1. Pagamento a menor no Asaas vira desconto e quita a parcela (D-054), em conflito com a RN-K06 (baixa parcial).
2. Webhook com falha de consulta fica `erro_consulta`; o reenvio do mesmo evento volta `repetido`, e só a varredura de 6 h recupera o pagamento.
3. Desativar o Asaas com cobranças pendentes impede cancelá-las, o que trava renegociação, distrato, cessão, troca de lote e antecipação.
4. O reajuste não atualiza cobranças já emitidas; a cobrança fica divergente quando paga.
5. Mudar a participação no meio do mês só pesa no rateio do mês seguinte (fluxo datado no dia 1).
6. `definir_participacao` apaga vigências futuras e aceita data retroativa.
7. `registrar_repasse` aceita qualquer valor, sem conferir com o devido (D-066).
8. Valores fixos no código, sem parâmetro:
   - reserva de 1 a 720 h (padrão 48 h);
   - reajuste de tabela de −50% a +100%;
   - até 480 parcelas;
   - janela de 10 min contra lead duplicado;
   - período contábil de até 400 dias.
9. A política `remover anexos de contas` (DELETE) contradiz a D-102 ("não são editados nem apagados").
10. `importar_carteira` não aplica a RN-C01 (venda antes do registro).
11. O papel `permutante_leitura` não tem permissões; o permutante usa o portal por vínculo.

## 5. Testes bloqueados ou não executados

| ID                                         | Motivo                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Fluxos FLX-003, 036, 037, 042, 043         | Dependem de funcionalidade inexistente ou de integração externa (ver 04)                                  |
| LEGAL-* da fonte oficial                   | Rede bloqueada                                                                                            |
| Backup e restauração                       | Sem ambiente com PITR                                                                                     |
| Reajuste em lote sobre a massa de carga    | Exige séries de índice para 3.000 aniversários; coberto funcionalmente por 011                            |
| E2E de duplo clique em operação financeira | **Resolvido:** a hipótese se confirmou (achado A-14) e foi corrigida; `duplo-clique.spec.ts` cobre o caso |

## 6. Informações necessárias para completar a auditoria

1. Respostas do ADV e do CONT às PL-01 a PL-24, em especial PL-02, PL-04 e PL-21.
2. Decisão do DP sobre cada achado A-01 a A-11 (corrigir, aceitar o risco ou documentar).
3. Volume esperado do maior cliente (contratos e parcelas) e metas de tempo de resposta.
4. Liberação de `www.planalto.gov.br` na rede do ambiente, para citar a fonte oficial.
5. Projeto de homologação para testes de restauração e de caos.
