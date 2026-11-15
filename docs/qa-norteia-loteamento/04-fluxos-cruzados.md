# QA — Fluxos cruzados (integração entre módulos)

> Versão 0.1 — 15/11/2026. Documento de QA, não altera regra de negócio.
> Fonte da verdade: `supabase/migrations/*.sql` (54 migrations, até `20261115090000_indices_fks.sql`), `docs/dominio.md`, `docs/decisoes.md` e `docs/pendencias-legais.md`.
> Todo nome de função, tabela, coluna, situação e parâmetro abaixo foi conferido nas migrations. O que não existe está marcado **NÃO IMPLEMENTADO**; o que depende de interpretação está marcado **HIPÓTESE**; comportamento real que diverge do esperado ou não está documentado está marcado **ACHADO**.

## 0. Convenções

### 0.1 Invariantes

| ID      | Invariante                                         | Onde o banco garante (quando garante)                                                                                                                                    |
| ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INV-001 | Entrada + amortizações = preço                     | `public.criar_contrato` (soma de `amortizacao_centavos` = `vendas.preco_centavos`); vale na criação — após aditivo, o novo plano soma o **saldo renegociado**            |
| INV-002 | Saldo devedor ≥ 0                                  | `parcelas.pago_centavos between 0 and valor_centavos`; `valor_centavos > 0`                                                                                              |
| INV-003 | Parcela paga não é reajustada                      | `privado.reajustar_contrato` só corrige `situacao = 'aberta'` e só o saldo (`valor − pago`)                                                                              |
| INV-004 | Recebimento = principal + multa + juros − desconto | `check (valor_centavos = principal_centavos + multa_centavos + juros_mora_centavos - desconto_centavos)` em `recebimentos`                                               |
| INV-005 | Uma venda ativa por lote                           | `vendas_ativa_por_lote_idx` (único parcial `situacao = 'ativa'`)                                                                                                         |
| INV-006 | Uma reserva ativa por lote                         | `reservas_ativa_por_lote_idx` (único parcial `situacao = 'ativa'`)                                                                                                       |
| INV-007 | Cobrança paga ↔ recebimento                        | `privado.conciliar_cobranca` grava `cobrancas.recebimento_id`; estorno torna a cobrança `divergente`                                                                     |
| INV-008 | Idempotência de evento externo                     | `asaas_eventos_id_idx (tenant_id, asaas_evento_id)`; `recebimentos_referencia_idx (tenant_id, origem, referencia_externa)`; `envios_email (tenant_id, tipo, referencia)` |
| INV-009 | Estorno preserva histórico                         | Estorno lógico (`estornado_em`, `motivo_estorno`); gatilhos `*_por_funcao` / `privado.carteira_somente_por_funcao`                                                       |
| INV-010 | Participações ≤ 100% por data                      | `public.definir_participacao` (soma por data) + `participacoes_sem_sobreposicao` (por sócio)                                                                             |
| INV-011 | Débito = crédito                                   | `regras_contabeis` (um evento → uma conta de débito e uma de crédito, mesmo valor) em `public.eventos_contabeis`                                                         |
| INV-012 | Mesmo tenant nas referências                       | FKs compostas `(tenant_id, id)`                                                                                                                                          |
| INV-013 | Auditoria                                          | `privado.instrumentar` → gatilhos `carimbar` e `auditar`; `privado.auditoria_imutavel`                                                                                   |
| INV-014 | Crédito ≥ 0                                        | `privado.saldo_credito` conferido em `aplicar_credito` / `devolver_credito`                                                                                              |
| INV-015 | Rateio = valor da conta                            | `public.ratear_despesa` (maior resto, em centavos)                                                                                                                       |
| INV-016 | Medição ≤ 100%                                     | `public.registrar_medicao` (`p_percentual_acumulado > anterior and <= 1`)                                                                                                |
| INV-017 | Reimportação sem duplicar                          | `public.importar_carteira` recusa lote fora de `disponivel`/`reservado` (não há controle por arquivo)                                                                    |
| INV-018 | Permissão não depende do ID                        | `privado.pode(...)` em toda função `SECURITY DEFINER` + RLS                                                                                                              |
| INV-019 | Limite de plano                                    | gatilho `verificar_limite_lotes` → `privado.verificar_limite_lotes()` em `lotes` (`planos.max_lotes`)                                                                    |
| INV-020 | Sem estado parcial                                 | cada função é uma transação; exceção desfaz tudo                                                                                                                         |

### 0.2 Massa de teste padrão (fictícia)

Usada por todos os fluxos, salvo indicação. Criada com os auxiliares de `supabase/tests/auxiliares/testes.psql` (`testes.criar_usuario`, `testes.entrar`, `testes.guardar`, `testes.id`, `testes.linhas_visiveis_do_tenant`, `testes.linhas_afetadas`) e `public.criar_tenant`, `public.criar_convite` + `public.aceitar_convite`, `public.criar_empreendimento_com_lotes`.

| Item                 | Valor                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant A             | "Loteadora Horizonte Teste", CNPJ 11.222.333/0001-81, plano `profissional` (1.500 lotes)                                                                                                                                                                                                   |
| Tenant B             | "Loteadora Vale Teste", CNPJ 44.555.666/0001-81, plano `essencial` (200 lotes)                                                                                                                                                                                                             |
| Usuários A           | `dona@a.exemplo.test` (dono), `fin@a.exemplo.test` (financeiro), `gestor@a.exemplo.test` (comercial_gestor), `corretor1@a.exemplo.test` e `corretor2@a.exemplo.test` (corretor), `contador@a.exemplo.test` (contador), `eng@a.exemplo.test` (engenharia, escopo `empreendimento` = EMP-A1) |
| Usuários B           | `dona@b.exemplo.test` (dono de B)                                                                                                                                                                                                                                                          |
| Compradores (A)      | Joana Teste — CPF 529.982.247-25, `joana@exemplo.test`; Pedro Teste — CPF 111.444.777-35, `pedro@exemplo.test`; Marina Teste — CPF 123.456.789-09, `marina@exemplo.test`; Lucas Teste — CPF 987.654.321-00, `lucas@exemplo.test`                                                           |
| Sócios / permutante  | Ana Sócia Teste (CPF 390.533.447-05, `ana@exemplo.test`), Beto Sócio Teste (CPF 246.813.579-28, `beto@exemplo.test`); Permutante Rui Teste (CPF 135.792.468-28, `rui@exemplo.test`)                                                                                                        |
| EMP-A1               | "Residencial Ipê Teste", com `data_registro` preenchida; quadra A, lotes A-1…A-10, `preco_base_centavos` = 6.000.000 (R$ 60.000,00)                                                                                                                                                        |
| EMP-A2               | "Jardim Aroeira Teste", **sem** `data_registro`; quadra B, lotes B-1…B-20, 4.000.000 cada                                                                                                                                                                                                  |
| Condição padrão (CP) | preço 6.000.000; entrada 600.000 (parcela 0); 24 parcelas; `juros_mensal` 0; `sistema` price → amortização 225.000 por parcela (juros zero deixa a conta exata; o motor coincide Price e SAC — `oraculo.test.ts`, MOT-UNID-109)                                                            |
| Encargos             | `carteira.multa_atraso` 0,02 e `carteira.juros_mora_mensal` 0,01 (sugestão da plataforma, D-044 — **VALIDAR COM ADVOGADO**, PL-04). Exemplo: parcela 225.000 paga 10 dias após o vencimento → multa 4.500; juros 225.000 × 0,01 × 10/30 = 750                                              |
| Asaas                | simulado substituindo `privado.asaas_chamar` dentro da transação do teste (padrão de `012_cobranca_asaas.test.sql`)                                                                                                                                                                        |
| Resend               | simulado substituindo `privado.resend_chamar` (padrão de `042_email_lembretes.test.sql`)                                                                                                                                                                                                   |

"Hoje" = `current_date` do banco (fuso `America/Sao_Paulo`, D-105). Datas no passado são escolhidas relativas a hoje.

---

## FLX-001 — Venda completa: da reserva expirada ao relatório de sócios

- **Objetivo:** provar que um lote percorre todo o ciclo comercial e financeiro sem retrabalho e que os números do relatório de sócios saem dos mesmos fatos da carteira.
- **Módulos:** comercial (reservas, propostas), tabela de preços/desconto, contratos/carteira, cobrança Asaas, contabilidade, sócios, motor financeiro.
- **Pré-condições:** massa padrão; tabela de preços vigente em EMP-A1 publicada por `public.publicar_tabela_preco` (A-1 = 6.000.000); `comercial.desconto_maximo_sem_aprovacao` = 0,05 por `public.definir_parametro`; Asaas configurado (`public.configurar_asaas`, ambiente `sandbox`); SPE de EMP-A1 com Ana 60% e Beto 40% (`public.definir_participacao`); regras contábeis para `venda_contratada` e `recebimento_parcela` em `regras_contabeis`.
- **Dados de teste:** lote A-1; cliente "Joana Teste" (CPF 529.982.247-25); preço proposto 5.580.000 (desconto 7%).
- **Sequência:**
  1. `corretor1`: `public.reservar_lote(A-1, 'Joana Teste', null, 1)` → reserva `ativa`, lote `reservado`.
  2. Simular o vencimento (como `postgres`: `reservas.expira_em` no passado).
  3. `corretor2`: `public.reservar_lote(A-1, 'Joana Teste')` → dentro da função `public.expirar_reservas()` marca a 1ª como `expirada`; nova reserva `ativa` para `corretor2`.
  4. `corretor1`: `public.criar_proposta(A-1, {...})` → deve falhar ("O lote está reservado para outro corretor").
  5. `corretor2`: `public.criar_proposta(A-1, {cliente_nome, cliente_cpf, preco_centavos: 5580000, entrada_centavos: 600000, parcelas: 24, juros_mensal: 0, sistema: 'price', primeira_parcela_em})` → proposta `aberta`, `valida_ate` = hoje + 7.
  6. `gestor`: `public.decidir_proposta(p, true)` → `aceita`.
  7. `gestor`: `public.vender_lote(A-1, {...preco_centavos: 5580000...})` → falha com hint `desconto_acima_limite`.
  8. `gestor`: `public.solicitar_aprovacao_desconto(A-1, 5580000, hoje, 'Cliente à vista na entrada, campanha')` → `aprovacoes_desconto.situacao = 'pendente'`.
  9. `gestor`: `public.decidir_aprovacao_desconto(a, true)` → falha (não tem `venda.aprovar_desconto`). `dona`: mesma chamada → `aprovada`, `valida_ate` = hoje + `comercial.validade_aprovacao_desconto_dias` (7).
  10. `gestor`: `public.vender_lote(A-1, {comprador_id: Joana, preco_centavos: 5580000, entrada_centavos: 600000, parcelas: 24, juros_mensal: 0, sistema: 'price', primeira_parcela_em, comissao_percentual: 0.05, comissao_modo: 'ato'})` → venda `ativa`; reserva `convertida`; aprovação `utilizada`; proposta `convertida` (gatilho `privado.converter_propostas`); lote `vendido`.
  11. `gestor`: `public.criar_contrato(venda, parcelas, 'IPCA')` com as parcelas de `gerarParcelasContrato` (parcela 0 = 600.000; 1…24 somando 4.980.000 de amortização).
  12. `fin`: `public.gerar_cobranca(parcela 1)` → `cobrancas.situacao = 'pendente'`.
  13. Asaas simulado devolve `status = 'RECEIVED'` com `value` = valor da parcela; anônimo chama `public.webhook_asaas(A, token, {id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: {id}})` → `'paga'`.
  14. `contador`: `public.eventos_contabeis(SPE, início do mês, fim do mês)` → eventos `venda_contratada` (5.580.000) e `recebimento_parcela`.
  15. `dona`: tela de sócios (`packages/aplicacao/src/socios.ts` → `ratearPorSocio`) e `public.painel_consolidado(A)`.
- **Tabelas afetadas:** `reservas`, `propostas`, `aprovacoes_desconto`, `vendas`, `lotes`, `contratos`, `parcelas`, `cobrancas`, `asaas_clientes`, `asaas_eventos`, `recebimentos`, `auditoria`.
- **Estado antes / depois:**

  | Objeto             | Antes            | Depois                                               |
  | ------------------ | ---------------- | ---------------------------------------------------- |
  | Lote A-1           | `disponivel`     | `vendido`                                            |
  | Reservas           | —                | 1 `expirada` (corretor1), 1 `convertida` (corretor2) |
  | Proposta           | —                | `convertida`, `venda_id` preenchido                  |
  | Aprovação desconto | —                | `utilizada`, `venda_id` preenchido                   |
  | Contrato           | —                | `vigente`, `numero` sequencial da loteadora          |
  | Parcela 1          | `aberta`, pago 0 | `paga`, `pago_centavos = valor_centavos`             |
  | Cobrança           | —                | `paga`, `recebimento_id` preenchido                  |

- **Validações financeiras (centavos):** `vendas.preco_tabela_centavos` = 6.000.000; desconto = 1 − 5.580.000/6.000.000 = 0,07 > 0,05; soma de `amortizacao_centavos` do contrato = 5.580.000 (INV-001); entrada 600.000; recebimento da parcela 1 = valor da parcela (sem atraso: multa 0, juros 0, desconto 0); `valor_centavos` do evento contábil `venda_contratada` = 5.580.000; soma do rateio de sócios (Ana + Beto + `SEM_SOCIO`) = resultado da SPE.
- **Validações de segurança:** corretor não vende (`venda.registrar`), não aprova desconto, não vê contrato/parcelas (RN-C07, D-048); gestor não aprova o próprio pedido; webhook com token errado devolve `'nao_autorizado'`; contador não registra recebimento.
- **Invariantes:** INV-001, 004, 005, 006, 007, 008, 011, 012, 013, 018, 020.
- **Critério de aprovação:** todas as transições acima ocorrem só pelas funções; nenhuma tabela é escrita diretamente; o relatório de sócios fecha com o resultado da SPE ao centavo.
- **Cobertura:** Coberto parcialmente por `009_comercial.test.sql`, `028_tabela_precos.test.sql`, `030_propostas.test.sql`, `010_contratos_carteira.test.sql`, `012_cobranca_asaas.test.sql`, `023_contabil.test.sql`, `018_socios.test.sql`, `packages/motor-financeiro/src/socios.test.ts`, `apps/web/e2e/comercial.spec.ts`, `apps/web/e2e/propostas.spec.ts`. A cadeia completa não é automatizada em um só teste.

## FLX-002 — Inadimplência → reajuste → aditivo → pagamento → distrato → devolução → nova venda

- **Objetivo:** mostrar que o histórico (reajuste, aditivo, pagamentos) sobrevive ao distrato e que o lote volta ao estoque e é revendido sem conflito.
- **Módulos:** carteira, reajuste/índices, aditivos (renegociação), distrato, comercial, alertas.
- **Pré-condições:** contrato CP de Joana em A-2 com `data_venda` 12 meses e 5 dias antes de hoje, índice `IPCA`, `reajuste_periodicidade_meses` 12, `reajuste_defasagem_meses` 2, `reajuste_negativo` `ignorar`; entrada e parcelas 1–10 pagas; parcelas 11 e 12 vencidas sem pagamento; 12 meses de IPCA publicados em `indice_valores` (inseridos como `postgres`) somando fator sintético 1,045.
- **Dados de teste:** IPCA mensal sintético cujo produto = 1,045; renegociação com encargos 10.500 e desconto 1.000.
- **Sequência:**
  1. `public.inadimplencia_historico(EMP-A1, array[hoje − 60, hoje − 30, hoje])` → Joana aparece como inadimplente na data de hoje.
  2. `public.executar_reajustes(hoje)` (como `service_role`/cron) → 1 reajuste; `reajustes.fator` = 1,045; parcelas `aberta` com vencimento ≥ aniversário corrigidas.
  3. Repetir `public.executar_reajustes(hoje)` → 0 novos (único por aniversário).
  4. `fin`: `public.renegociar_contrato(c, hoje, 'Acordo de inadimplência', 10500, 1000, {...}, parcelas)` com plano do motor.
  5. `fin`: `public.registrar_recebimento(nova parcela 1, hoje, valor, 0, 0, 0)`.
  6. App calcula o distrato (`calcularDistrato`); `gestor`: `public.executar_distrato(c, hoje, 'Desistência do comprador', {devolucao_centavos: D, ...}, [{numero:1,...},{numero:2,...}])`.
  7. `fin`: `public.pagar_devolucao(dev1, hoje)`; repetir para `dev1` → erro "já foi paga".
  8. `gestor`: `public.vender_lote(A-2, {comprador_id: Pedro, ...})` e `public.criar_contrato(...)`.
- **Tabelas afetadas:** `indice_valores`, `reajustes`, `parcelas`, `aditivos`, `recebimentos`, `distratos`, `devolucoes`, `contratos`, `vendas`, `lotes`, `auditoria`.
- **Estado antes / depois:**

  | Objeto            | Antes             | Depois                                                                                                     |
  | ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
  | Parcelas 11–24    | `aberta`, 225.000 | reajustadas (11–12 só se vencem após o aniversário) → `cancelada` pelo aditivo (`aditivo_cancelamento_id`) |
  | Novo plano        | —                 | parcelas numeradas a partir de 25 (`aditivo_origem_id`), depois `cancelada` pelo distrato (exceto a paga)  |
  | Contrato de Joana | `vigente`         | `distratado`                                                                                               |
  | Venda de Joana    | `ativa`           | `distratada`                                                                                               |
  | Lote A-2          | `vendido`         | `disponivel` → `vendido` (venda de Pedro)                                                                  |
  | Devoluções        | —                 | 2 linhas; `pago_em` preenchido na 1ª                                                                       |

- **Validações financeiras (centavos):** correção por parcela de 225.000 = round(225.000 × 1,045) − 225.000 = 10.125 → `valor_centavos` 235.125 e `correcao_centavos` 10.125 (`valor = amortização + juros + correção`); parcelas já pagas inalteradas (INV-003); `aditivos.saldo_anterior_centavos` = soma de `valor − pago` das abertas; `novo_saldo_centavos` = saldo + 10.500 − 1.000; soma das amortizações do novo plano = `novo_saldo_centavos`; `distratos.devolucao_centavos` = soma de `devolucoes.valor_centavos`; recebimentos anteriores intactos (realizado continua realizado, D-064).
- **Validações de segurança:** corretor não renegocia, não distrata; `executar_reajustes` não é executável por `authenticated` ("usuário não executa a rotina de reajuste"); comprador no portal não vê aditivo (D-087).
- **Invariantes:** INV-002, 003, 004, 005, 009, 012, 013, 020.
- **Critério de aprovação:** nenhuma parcela paga muda de valor; o aditivo guarda a foto (`parcelas_anteriores`); o lote é revendido com um único `vendas.situacao = 'ativa'`.
- **Cobertura:** Coberto parcialmente por `011_reajuste.test.sql`, `013_aditivos.test.sql`, `016_distrato.test.sql`, `027_alertas.test.sql`, `apps/web/e2e/carteira.spec.ts` ("distrato: simulação, execução e devolução"). Cadeia completa não automatizada.
- **Observação (ACHADO):** `public.executar_distrato` confere apenas que as parcelas da devolução somam `p_resumo.devolucao_centavos`; o valor em si vem do app (motor). Uma chamada RPC direta de quem tem `venda.registrar` ou `carteira.receber` grava qualquer devolução ≥ 0. Idem `p_encargos`/`p_desconto` de `public.renegociar_contrato` e `p_multa`/`p_juros_mora` de `public.registrar_recebimento` (D-045 diz "calculados pelo motor no servidor", mas o banco não recalcula).

## FLX-003 — Cancelamento de aditivo

- **Objetivo:** verificar se um aditivo pode ser desfeito e qual o caminho real.
- **Constatação:** **NÃO IMPLEMENTADO.** Não existe função de cancelamento/desfazimento de aditivo nas migrations (busca por `cancelar_aditivo`, `desfazer`, `reverter` sem resultado); `aditivos.tipo` só admite `'renegociacao'`, `'cessao'`, `'troca_lote'`; o gatilho `aditivos_por_funcao` impede `update`/`delete` direto ("aditivo não é alterado", `013_aditivos.test.sql`). Parcelas canceladas pelo aditivo (`situacao = 'cancelada'`, `aditivo_cancelamento_id`) não voltam a `aberta` por nenhuma função.
- **Módulos:** aditivos, carteira, cobrança Asaas, auditoria.
- **Pré-condições:** contrato CP vigente com aditivo de renegociação registrado por engano (ex.: encargos 10.500 em vez de 1.050); parcela 1 do plano antigo com pagamento parcial de 100.000.
- **Dados de teste:** Joana, A-3.
- **Sequência (fluxo alternativo real):**
  1. Tentar `update public.aditivos ...` como `fin` → recusado (gatilho/RLS).
  2. Tentar `public.estornar_recebimento(rec_parcial, 'erro')` → erro hint `parcela_renegociada` ("o estorno exige um novo aditivo").
  3. Cancelar cobranças pendentes do novo plano: `public.cancelar_cobranca(co, 'Aditivo corrigido')`.
  4. Registrar **novo** aditivo corretivo: `public.renegociar_contrato(c, hoje, 'Correção do aditivo anterior (encargos lançados a maior)', 0, 9450, {...}, novo_plano)` — o desconto compensa o excesso de encargos; o plano errado fica `cancelada` com `aditivo_cancelamento_id` = aditivo corretivo.
  5. Conferir `auditoria` com os dois aditivos e o motivo.
- **Tabelas afetadas:** `aditivos`, `parcelas`, `cobrancas`, `auditoria`.
- **Estado antes / depois:** aditivo errado permanece no histórico; plano errado `cancelada`; plano corretivo `aberta`; numeração continua após o maior `numero`.
- **Validações financeiras (centavos):** saldo após correção = saldo original + 10.500 − 9.450 = saldo original + 1.050; `desconto_centavos` não pode zerar o saldo (hint `desconto`); encargos e desconto ≥ 0.
- **Validações de segurança:** só `carteira.receber`; corretor e contador recusados.
- **Invariantes:** INV-009, 013, 020.
- **Critério de aprovação:** o erro é corrigido sem apagar nem alterar o aditivo original e o saldo final confere com o que deveria ter sido renegociado.
- **Cobertura:** Não automatizado (o "aditivo não é alterado" de `013_aditivos.test.sql` cobre só o bloqueio).

## FLX-004 — Recebimento → estorno → nova baixa → estorno duplicado

- **Objetivo:** garantir que estornos são lógicos, reabrem saldo e situação do contrato, e não se repetem.
- **Módulos:** carteira, contratos (situação quitado/vigente), cobrança Asaas, contabilidade, DIMOB/informe.
- **Pré-condições:** contrato CP com todas as parcelas pagas exceto a 24.
- **Dados de teste:** Joana; parcela 24 = 225.000; referência manual `REC-TESTE-0001`.
- **Sequência:**
  1. `fin`: `public.registrar_recebimento(p24, hoje, 225000)` → contrato `quitado`, `quitado_em` = hoje (D-046).
  2. `fin`: `public.estornar_recebimento(r1, 'ab')` → erro (motivo < 3 caracteres).
  3. `fin`: `public.estornar_recebimento(r1, 'Cheque devolvido')` → `estornado_em`, `estornado_por`, `motivo_estorno`; parcela `aberta`; contrato volta a `vigente`.
  4. `fin`: `public.estornar_recebimento(r1, 'Cheque devolvido')` → erro "O recebimento já foi estornado."
  5. `fin`: `public.registrar_recebimento(p24, hoje, 225000, 0, 0, 0, 'manual', 'REC-TESTE-0001')` → r2; contrato `quitado`.
  6. `fin`: `public.estornar_recebimento(r2, 'Lançado em duplicidade')`.
  7. `fin`: `public.registrar_recebimento(p24, hoje, 225000, 0, 0, 0, 'manual', 'REC-TESTE-0001')` → **ACHADO:** devolve o id de r2 (estornado) sem baixar, porque `privado.baixar_parcela` procura a referência antes de conferir o estorno e `recebimentos_referencia_idx` não filtra estornados. Parcela continua `aberta`.
  8. `fin`: `public.registrar_recebimento(p24, hoje, 225000)` (sem referência) → r3; contrato `quitado`.
  9. `public.eventos_contabeis`, `public.dados_dimob`, `public.informe_pagamentos` → só r3 aparece (filtram `estornado_em is null`).
- **Tabelas afetadas:** `recebimentos`, `parcelas`, `contratos`, `cobrancas` (se houver), `auditoria`.
- **Estado antes / depois:** r1 e r2 estornados e visíveis; r3 ativo; parcela 24 `paga`; contrato `quitado`.
- **Validações financeiras (centavos):** `parcelas.pago_centavos` = soma dos `principal_centavos` não estornados = 225.000 ao final; nunca > `valor_centavos`; `principal` acima do saldo recusado (hint `principal_invalido`); data futura recusada.
- **Validações de segurança:** só `carteira.receber` (dono, financeiro); `p_origem` diferente de `manual` recusado para `authenticated` (D-055).
- **Invariantes:** INV-002, 004, 008, 009, 013, 020.
- **Critério de aprovação:** estorno duplo recusado; histórico completo; situação do contrato acompanha o saldo. O passo 7 deve ser registrado como comportamento conhecido (ou corrigido por decisão do dono do produto).
- **Cobertura:** Coberto parcialmente por `010_contratos_carteira.test.sql` (estorno, reabertura, mesma referência), `apps/web/e2e/carteira.spec.ts`. Estorno duplicado e reuso de referência após estorno: Não automatizado.

## FLX-005 — Webhooks do Asaas: duplicados, atrasados, fora de ordem, valor divergente e baixa manual concorrente

- **Objetivo:** provar RN-K05 (idempotência) e que o corpo do aviso nunca define valores (D-054).
- **Módulos:** cobrança Asaas, carteira, rota `apps/web/app/api/webhooks/asaas/[tenant]/route.ts`, conciliação agendada (`conciliar-cobrancas`, a cada 6 h).
- **Pré-condições:** Asaas configurado; cobranças pendentes nas parcelas 1–5 do contrato CP; `privado.asaas_chamar` simulado com respostas controladas.
- **Dados de teste:** eventos `evt_dup`, `evt_late`, `evt_created`, `evt_div_mais`, `evt_div_menos`, `evt_concorrente`.
- **Sequência:**
  1. **Duplicado:** `public.webhook_asaas(A, token, {id:'evt_dup', payment:{id: pay1}})` → `'paga'`; mesma chamada → `'repetido'`; outro id de evento para o mesmo pagamento → `'ja_processada'` (cobrança não está mais `pendente`); um só recebimento com `referencia_externa = pay1`.
  2. **Fora de ordem:** aviso `PAYMENT_CREATED` chega depois de `PAYMENT_RECEIVED` → a função lê o estado atual no Asaas; resultado `'ja_processada'`.
  3. **Atrasado após conciliação:** `public.conciliar_cobrancas()` baixa pay2 antes do aviso; aviso posterior → `'ja_processada'`.
  4. **Valor a maior antes do vencimento:** Asaas devolve `value` = valor + 300 com `clientPaymentDate` ≤ `vencimento` → recebimento com `multa_centavos` 0 e `juros_mora_centavos` 300.
  5. **Valor a maior após o vencimento:** `value` = 225.000 + 5.250 (sem `originalValue`) e data > vencimento → multa = min(5.250, round(225.000 × 0,02)) = 4.500; juros = 750.
  6. **Valor a menor:** `value` = 224.000 → recebimento com `principal_centavos` 225.000 e `desconto_centavos` 1.000; parcela `paga`. **ACHADO:** o pagamento a menor no Asaas quita a parcela com desconto, em vez de baixa parcial (RN-K06); está em D-054, mas conflita com o texto da RN-K06.
  7. **Baixa manual concorrente:** com cobrança pendente na parcela 5, `fin` faz `public.registrar_recebimento(p5, hoje, 100000)` (não é bloqueado); depois o aviso de pagamento → `'divergente'` ("Parcela alterada desde a emissão"); nenhum segundo recebimento.
  8. **Consulta ao Asaas falha:** simulado devolve status 500 → resultado `'erro_consulta'` gravado em `asaas_eventos` com o `asaas_evento_id`; o reenvio do mesmo evento devolve `'repetido'`. **ACHADO:** o evento não é reprocessado pelo webhook; só a varredura `public.conciliar_cobrancas` baixa.
  9. **Cobrança desconhecida:** `payment.id` inexistente → `'ignorado'` (também consome o id do evento).
  10. **Token errado / integração desativada:** → `'nao_autorizado'` (a rota devolve 401).
- **Tabelas afetadas:** `asaas_eventos`, `cobrancas`, `recebimentos`, `parcelas`, `contratos`, `integracoes_asaas.ultimo_webhook_em`.
- **Estado antes / depois:** cobranças 1–4 `paga`; cobrança 5 `divergente`; um recebimento por pagamento.
- **Validações financeiras (centavos):** em todos os casos `valor_centavos = principal + multa + juros − desconto`; `principal_centavos` = `cobrancas.valor_centavos`; multa nunca maior que a diferença paga.
- **Validações de segurança:** anônimo só executa `public.webhook_asaas`; token conferido por SHA-256 contra `webhook_token_hash`; corpo do aviso não define valores (sempre GET `/payments/{id}`).
- **Invariantes:** INV-004, 007, 008, 012, 020.
- **Critério de aprovação:** nenhum aviso, em nenhuma ordem, gera dois recebimentos; divergências ficam visíveis para baixa manual.
- **Cobertura:** Coberto parcialmente por `012_cobranca_asaas.test.sql` (repetido, mesmo pagamento, varredura, multa/juros, cancelada, token errado). Valor a menor, baixa manual concorrente, `erro_consulta` e `ignorado`: Não automatizado.

## FLX-006 — Permuta física e financeira + distrato + repasse + estorno

- **Objetivo:** validar RN-T01–T04: lotes de permuta fora do estoque e repasse financeiro apurado dos fatos, inclusive com distrato.
- **Módulos:** permutas, comercial, carteira, distrato, projeção (`apurarRepasses`), portal do permutante, contabilidade.
- **Pré-condições:** permutante Rui cadastrado em `permutantes`; EMP-A1 com A-8 e A-9 `disponivel`.
- **Dados de teste:** permuta física A-8, A-9 com `valor_economico_centavos` 12.000.000; permuta financeira 10% `base` `recebido`, `abate_distrato` verdadeiro, `inicio` = hoje − 30.
- **Sequência:**
  1. `dona`: `public.criar_permuta(EMP-A1, Rui, {tipo:'fisica', valor_economico_centavos:12000000}, array[A-8, A-9])` → lotes `permuta`.
  2. `corretor1`: `public.reservar_lote(A-8, ...)` → erro (lote não disponível); `public.criar_permuta(..., array[A-8])` de novo → erro.
  3. `dona`: `public.criar_permuta(EMP-A1, Rui, {tipo:'financeira', percentual:0.10, base:'recebido', abate_distrato:true, inicio})`.
  4. Venda CP de Joana em A-4 + `public.criar_contrato`; `fin`: `public.registrar_recebimento(entrada, hoje, 600000)`.
  5. App apura `apurarRepasses` → devido 60.000; `dona`: `public.registrar_repasse(pf, hoje, 60000)`.
  6. `public.registrar_repasse(fisica, ...)` → erro "Repasse só existe na permuta financeira".
  7. Distrato do contrato de Joana com devolução 300.000 paga (`public.pagar_devolucao`) → apuração passa a abater 10% da devolução paga (30.000) do devido.
  8. `dona`: `public.estornar_repasse(rp, 'Valor apurado antes do distrato')`; `public.registrar_repasse(pf, hoje, 30000)`.
  9. Rui (portal): `public.eventos_permuta(pf)` → só as próprias permutas.
- **Tabelas afetadas:** `permutas`, `permuta_lotes`, `lotes`, `repasses_permuta`, `vendas`, `contratos`, `recebimentos`, `distratos`, `devolucoes`, `auditoria`.
- **Estado antes / depois:** A-8/A-9 `disponivel` → `permuta` (permanente: **NÃO IMPLEMENTADO** encerramento de permuta ou devolução de lote permutado — não há função que altere `permutas.situacao` para `encerrada` nem que tire lote de `permuta`); 1 repasse estornado + 1 ativo.
- **Validações financeiras (centavos):** devido = 10% × 600.000 = 60.000; após distrato com abatimento: 60.000 − 30.000 = 30.000; valor econômico da permuta física nunca entra como caixa (RN-T02, D-065). **ACHADO:** `public.registrar_repasse` não compara o valor com o devido apurado — aceita qualquer valor > 0.
- **Validações de segurança:** só `permutas.gerenciar` (dono, financeiro); corretor não vê permutas; permutante vê só as dele.
- **Invariantes:** INV-005, 006, 009, 012, 013, 020.
- **Critério de aprovação:** lotes de permuta nunca reservados/vendidos; extrato do permutante = extrato da gestão (D-073).
- **Cobertura:** Coberto parcialmente por `017_permutas.test.sql`, `020_portais.test.sql`, `packages/projecao/src/permutas.test.ts`, `apps/web/e2e/permutas.spec.ts`. Distrato com abatimento seguido de estorno/novo repasse: Não automatizado no banco (só na projeção).

## FLX-007 — Alteração de participação societária no meio do mês

- **Objetivo:** confirmar a vigência por data, a soma ≤ 100% em toda data e o efeito no rateio mensal.
- **Módulos:** sócios, motor (`ratearPorSocio`), aplicação (`packages/aplicacao/src/socios.ts`), contabilidade, portal do sócio.
- **Pré-condições:** SPE de EMP-A1; Ana 60% e Beto 40% desde 01/01 do ano.
- **Dados de teste:** mudança em 16/07: Ana 50%, Beto 50%; aporte de Ana 1.000.000 em 20/07.
- **Sequência:**
  1. `dona`: `public.definir_participacao(SPE, Beto, 0.50, 16/07, 'Cessão de cotas')` **antes** de reduzir Ana → erro "As participações da SPE passariam de 100%" (soma 110% em 16/07).
  2. `dona`: `public.definir_participacao(SPE, Ana, 0.50, 16/07, 'Cessão de cotas')` → vigência anterior `[01/01, 16/07)`; nova `[16/07, ∞)`.
  3. `dona`: `public.definir_participacao(SPE, Beto, 0.50, 16/07, 'Cessão de cotas')`.
  4. `dona`: `public.registrar_movimento_socio(SPE, Ana, 'aporte', 20/07, 1000000)`.
  5. Rateio do resultado: valores do fluxo vêm datados no 1º dia do mês (`socios.ts`: "datas de calendário (1º dia do mês)").
  6. `fin`: `public.registrar_movimento_socio(...)` → erro (só `socios.gerenciar`).
  7. Ana (portal): `public.meu_portal()` → só a SPE em que participa (RN-S03).
- **Tabelas afetadas:** `participacoes`, `movimentos_socio`, `auditoria`.
- **Estado antes / depois:** 2 vigências por sócio, sem sobreposição; aporte ativo.
- **Validações financeiras (centavos):** soma por data ≤ 1 (INV-010); rateio de julho (data 01/07) = 60/40; de agosto em diante = 50/50; soma Ana + Beto + `SEM_SOCIO` = resultado da SPE em cada mês. **ACHADO / HIPÓTESE:** uma mudança no meio do mês só pesa no rateio a partir do mês seguinte, porque o fluxo mensal é datado no dia 1; a regra não está escrita em `docs/decisoes.md` (D-067 fala em "participação vigente em cada mês").
- **Validações de segurança:** só dono (`socios.gerenciar`); sócio vê só os próprios movimentos; `participacoes` só pela função (`participacoes_por_funcao`).
- **Invariantes:** INV-009, 010, 012, 013, 020.
- **Critério de aprovação:** ordem errada recusada; nenhuma data acima de 100%; regra do meio do mês documentada e coberta por teste.
- **Cobertura:** Coberto parcialmente por `018_socios.test.sql` ("Ana reduz para 50% em julho"), `packages/motor-financeiro/src/socios.test.ts`. Mudança no meio do mês × rateio mensal: Não automatizado.
- **Observação (ACHADO):** `public.definir_participacao` **apaga** (`delete`) as vigências do sócio que começam em `p_inicio` ou depois; com `p_inicio` retroativo, reescreve o passado. A auditoria registra, mas não há bloqueio de data passada.

## FLX-008 — Nova tabela de preços com proposta em andamento

- **Objetivo:** mostrar que proposta não congela preço: a venda usa a tabela vigente na data da venda (RN-C05, D-098).
- **Módulos:** tabela de preços, propostas, aprovação de desconto, comercial, rotina `aplicar-tabelas-preco` (`privado.sincronizar_precos`).
- **Pré-condições:** tabela T1 vigente (A-5 = 6.000.000); limite de desconto 0,05.
- **Dados de teste:** proposta de Marina a 5.700.000 (5%); T2 publicada com `p_vigente_desde` = amanhã e `p_reajuste` 0,10 → A-5 = 6.600.000.
- **Sequência:**
  1. `corretor1`: `public.criar_proposta(A-5, {preco_centavos: 5700000, ...})`.
  2. `dona`: `public.publicar_tabela_preco(EMP-A1, 'T2', amanhã, 0.10)`; tentativa com data passada → erro; segunda tabela no mesmo dia → erro.
  3. `public.preco_tabela(A-5, hoje)` = 6.000.000; `public.preco_tabela(A-5, amanhã)` = 6.600.000.
  4. Hoje: `gestor`: `public.decidir_proposta(p, true)` e `public.vender_lote(A-5, {..., data_venda: hoje, preco_centavos: 5700000})` → aceita (5% ≤ 5%).
  5. Variante (lote A-6, mesma proposta, venda depois da virada): `public.vender_lote` com `data_venda` ≥ vigência T2 → desconto 1 − 5.700.000/6.600.000 ≈ 13,64% → erro `desconto_acima_limite`.
  6. Variante: aprovação obtida sob T1 (`preco_tabela_centavos` = 6.000.000) não serve sob T2 (a função exige `preco_tabela_centavos = v_tabela`) → novo `public.solicitar_aprovacao_desconto`.
  7. `privado.sincronizar_precos()` (cron) no dia da vigência → `lotes.preco_base_centavos` = 6.600.000; edição manual do preço → erro (`privado.proteger_preco_lote`).
- **Tabelas afetadas:** `tabelas_preco`, `tabela_preco_itens`, `lotes`, `propostas`, `aprovacoes_desconto`, `vendas`.
- **Estado antes / depois:** T1 e T2 coexistem com vigências distintas; venda guarda `preco_tabela_centavos` da data.
- **Validações financeiras (centavos):** reajuste da tabela entre −50% e +100% (fora → hint `reajuste`); `round(6.000.000 × 1,10)` = 6.600.000; desconto calculado com 6 casas.
- **Validações de segurança:** publicar só com `comercial.tabela_precos` (dono, comercial_gestor); `tabelas_preco` só pela função; corretor não vê pedidos de desconto de outros.
- **Invariantes:** INV-005, 012, 013, 018, 020.
- **Critério de aprovação:** proposta aceita não garante o preço; a regra está visível na tela antes da venda. **HIPÓTESE:** `vender_lote` não recusa `data_venda` futura nem retroativa; o teste deve fixar o comportamento esperado.
- **Cobertura:** Coberto parcialmente por `028_tabela_precos.test.sql`, `030_propostas.test.sql`, `apps/web/e2e/tabela-precos.spec.ts`, `apps/web/e2e/propostas.spec.ts`. Proposta atravessando troca de tabela: Não automatizado.

## FLX-009 — Importação de carteira e reimportação do mesmo arquivo

- **Objetivo:** provar o "tudo ou nada" com conciliação de saldo e que reimportar não duplica (D-088, D-089).
- **Módulos:** importação (`packages/integracoes/src/importacao.ts`), carteira, reajuste, comercial, compradores.
- **Pré-condições:** EMP-A1 com A-1…A-3 `disponivel` e A-4 `reservado` por corretor1.
- **Dados de teste:** arquivo `carteira-teste.csv` com contratos `ref` 101 (A-1, Pedro), 102 (A-4, Lucas); parcelas com `valor`, `pago`, `vencimento`, `data_pagamento`; uma parcela com `pago` 230.250 sobre `valor` 225.000; saldo em aberto calculado 4.500.000; índice `IGPM` (aceito pelo parser) mapeado para o código do banco.
- **Sequência:**
  1. `gestor`: `public.importar_carteira(EMP-A1, 'Sistema Antigo', 'carteira-teste.csv', 4499999, contratos)` → erro hint `conciliacao`; nada gravado.
  2. Mesma chamada com `p_saldo_origem` 4.500.000 → `importacoes` com `saldo_aberto_centavos` = `saldo_origem_centavos`; vendas, contratos, parcelas, recebimentos (`origem` `importacao`, `referencia_externa` = `<importacao>:<ref>:<numero>`), reajustes passados com fator 1.
  3. Reserva de A-4 → `convertida` ("Carteira importada").
  4. Reimportar o **mesmo** arquivo → erro "Contrato 101: o lote 1 da quadra A já está vendido" (hint `lote_indisponivel`); nada gravado.
  5. Arquivo misto (um contrato novo em A-3 + o 101 repetido) → erro; A-3 continua `disponivel` (INV-020).
  6. Contrato com índice desconhecido → erro hint `indice`.
  7. `public.executar_reajustes(hoje)` → não reaplica aniversários já passados.
- **Tabelas afetadas:** `importacoes`, `compradores`, `vendas`, `reservas`, `lotes`, `contratos`, `parcelas`, `recebimentos`, `reajustes`, `mapeamentos_importacao`.
- **Estado antes / depois:** lotes importados `vendido`; uma única importação registrada.
- **Validações financeiras (centavos):** saldo aberto = Σ max(valor − min(pago, valor), 0) = `p_saldo_origem`; pago acima da parcela vira `juros_mora_centavos` (230.250 − 225.000 = 5.250); `principal_centavos` = min(pago, valor).
- **Validações de segurança:** só `venda.registrar`; outro tenant recusado ("quem não é da loteadora não importa").
- **Invariantes:** INV-004, 005, 008, 012, 017, 020.
- **Critério de aprovação:** reimportação nunca cria segundo contrato/recebimento. **ACHADO:** a proteção é só pelo status do lote; não há identificação do arquivo (hash/nome) — um lote distratado depois da importação seria reimportado sem alerta.
- **Cobertura:** Coberto parcialmente por `026_importacao_carteira.test.sql` ("não importa o mesmo lote duas vezes"), `packages/integracoes/src/importacao.test.ts`, `apps/web/e2e/importacao.spec.ts`. Arquivo misto e reserva convertida: Não automatizado.

## FLX-010 — Conta a pagar + rateio + pagamento + estorno

- **Objetivo:** validar RN-G04 e D-037/D-104 em custos compartilhados.
- **Módulos:** custos, rateio, fornecedores, anexos, projeção de custos, contabilidade.
- **Pré-condições:** fornecedor "Topografia Teste Ltda" em `fornecedores`; centro `infraestrutura` existente em `centros_custo` de EMP-A1 e EMP-A2; usuário `fin` com `custos.editar` nos dois.
- **Dados de teste:** despesa comum 100.000 por critério `lotes` (EMP-A1 10 lotes, EMP-A2 20 lotes).
- **Sequência:**
  1. `fin`: `public.ratear_despesa({descricao, centro_codigo:'infraestrutura', valor_centavos:100000, vencimento, criterio:'lotes'}, array[EMP-A1, EMP-A2])` → rateio + 2 contas (`contas_pagar.rateio_id`).
  2. `eng` (escopo só EMP-A1): mesma chamada → erro "Sem permissão para lançar custos em todos os empreendimentos" — nada lançado.
  3. Critério `manual` com percentuais 0,6 e 0,5 → erro (soma ≠ 100%).
  4. `fin`: `insert into pagamentos` (RLS) de 20.000 na conta de EMP-A1; segundo pagamento de 20.000 → erro "O pagamento ultrapassa o saldo da conta".
  5. `fin`: tentar cancelar a conta (`update contas_pagar set cancelada_em`) → erro "Estorne os pagamentos antes de cancelar a conta".
  6. `fin`: estornar (`update pagamentos set estornado_em = now(), motivo_estorno = 'Pago na conta errada'`).
  7. `fin`: cancelar a conta de EMP-A1 → aceita; a conta de EMP-A2 continua.
  8. `public.eventos_contabeis` → `custo_lancado` só das contas não canceladas; `custo_pago` só dos pagamentos não estornados.
- **Tabelas afetadas:** `rateios`, `contas_pagar`, `pagamentos`, `anexos_conta` (opcional), `auditoria`.
- **Estado antes / depois:** rateio com 2 contas; uma cancelada, outra aberta; pagamento estornado no histórico.
- **Validações financeiras (centavos):** pesos 1/3 e 2/3 → 33.333,33 e 66.666,67 → maior resto → 33.333 + 66.667 = 100.000 (INV-015); pagamentos ativos ≤ `valor_centavos` da conta.
- **Validações de segurança:** corretor não vê contas nem pagamentos; engenharia vê só rateios que tocam o próprio empreendimento; pagamento não é apagado.
- **Invariantes:** INV-009, 012, 013, 015, 020.
- **Critério de aprovação:** soma das partes = despesa; nenhum pagamento apagado; cancelamento só após estorno.
- **Cobertura:** Coberto parcialmente por `008_custos_e_obra.test.sql`, `034_rateio_despesas.test.sql`, `apps/web/e2e/rateio.spec.ts`, `apps/web/e2e/cadastros-custos.spec.ts`. Cadeia rateio → pagamento → estorno → cancelamento: Não automatizado.
- **Observação:** **NÃO IMPLEMENTADO** cancelamento do rateio como um todo; cada conta é cancelada individualmente (D-104).

## FLX-011 — Medições sucessivas até 100%

- **Objetivo:** validar D-103 (percentual acumulado, sem dupla contagem com contas a pagar).
- **Módulos:** contratos de fornecedor, medições, contas a pagar, pagamentos, projeção de custos, portal (obra).
- **Pré-condições:** `contratos_fornecedor` "Terraplenagem Teste" de 1.000.000, `situacao` `vigente`, `data_inicio` = hoje − 90.
- **Dados de teste:** medições 30%, 65%, 100%.
- **Sequência:**
  1. `eng`: `public.registrar_medicao(cf, hoje − 60, 0.30, vencimento)` → conta "Medição 1" de 300.000.
  2. `eng`: `public.registrar_medicao(cf, hoje − 30, 0.25, ...)` → erro (não passa do anterior).
  3. `eng`: `public.registrar_medicao(cf, hoje − 30, 0.65, ...)` → 350.000.
  4. `fin`: cancelar a conta da medição 2 (sem pagamento) → a medição deixa de contar; `public.registrar_medicao(cf, hoje − 20, 0.65, ...)` → refeita, 350.000.
  5. `eng`: `public.registrar_medicao(cf, hoje, 1.0001, ...)` → erro; `1.00` → 350.000.
  6. `eng`: nova medição → erro (contrato 100% medido).
  7. Medição com data anterior a `data_inicio` → erro hint `data`.
  8. `public.obra_portal(contrato do comprador)` → avanço financeiro da infraestrutura (D-086).
- **Tabelas afetadas:** `medicoes`, `contas_pagar`, `pagamentos`, `auditoria`.
- **Estado antes / depois:** 3 medições válidas somando 100%; 1 conta cancelada.
- **Validações financeiras (centavos):** valor = round(1.000.000 × acumulado) − já medido; Σ medições válidas = 1.000.000 exatos; conta da medição usa o centro do contrato (`privado.validar_conta_pagar`).
- **Validações de segurança:** só `custos.editar`; corretor não registra; `medicoes` só pela função.
- **Invariantes:** INV-016, 012, 013, 020.
- **Critério de aprovação:** nunca passa de 100% e nunca mede duas vezes o mesmo percentual.
- **Cobertura:** Coberto parcialmente por `033_medicoes.test.sql`, `apps/web/e2e/medicoes.spec.ts`. Ligação com `obra_portal`: Não automatizado.

## FLX-012 — Portal do comprador: convite → login → só contratos próprios → chamado → LGPD

- **Objetivo:** validar D-070/D-071/D-111/D-112: superfície mínima, vínculo por e-mail, isolamento entre compradores.
- **Módulos:** portais, convites, e-mail (Resend), chamados, LGPD, documentos, cobrança (segunda via).
- **Pré-condições:** Joana com contrato CP em A-1; Marina com contrato em A-2; Resend simulado; `carteira.aviso_chamado_email` ligado.
- **Dados de teste:** e-mails `joana@exemplo.test` e `outra@exemplo.test`.
- **Sequência:**
  1. `fin`: `public.criar_convite_portal(A, 'comprador', Joana, 'joana@exemplo.test')` → token (só `token_hash` gravado).
  2. `fin`: `public.enviar_convite_portal(token)` → `envios_email` tipo `convite_portal`; segunda chamada → não reenvia (idempotente).
  3. Usuário `outra@exemplo.test`: `public.aceitar_convite_portal(token)` → erro "Este convite foi enviado para outro e-mail."
  4. Joana cria conta e entra: `public.aceitar_convites_pendentes()` (ou `public.aceitar_convite_portal(token)`) → `compradores.usuario_id` preenchido; `convites_portal.aceito_em`.
  5. `public.meu_portal()` → só o contrato de Joana; `public.portal_contrato(contrato de Marina)` → erro "Contrato não encontrado."; `select` em `parcelas` → 0 linhas.
  6. `public.segunda_via(parcela de Joana)` → link; parcela de Marina → erro.
  7. `public.abrir_chamado(contrato de Joana, 'Boleto', 'financeiro', 'Não recebi o boleto')` → `chamados.situacao` `aberto`; e-mail para quem tem `atendimento.responder`.
  8. `fin`: `public.responder_chamado(ch, 'Enviamos a segunda via no portal.')` → `em_atendimento`; e-mail para Joana; `public.mudar_situacao_chamado(ch, 'resolvido')`; nova mensagem de Joana reabre.
  9. Joana: `public.dados_titular(Joana)` → JSON (cadastro, contratos, parcelas, pagamentos, chamados, propostas, créditos, e-mails); `exportacoes_titular.pelo_titular` = verdadeiro.
  10. `gestor`: `public.dados_titular(Joana)` → erro (só `tenant.administrar`).
- **Tabelas afetadas:** `convites_portal`, `compradores`, `envios_email`, `chamados`, `chamado_mensagens`, `exportacoes_titular`, `cobrancas`, `auditoria`.
- **Estado antes / depois:** Joana vinculada; 1 chamado com 3 mensagens; 1 exportação registrada.
- **Validações financeiras (centavos):** saldo exibido no portal = Σ (`valor_centavos − pago_centavos`) das parcelas `aberta`; "quanto custa quitar hoje" é estimativa do motor (D-110).
- **Validações de segurança:** convite de uso único e 30 dias; e-mail igual ao do convite (sem diferenciar maiúsculas); comprador não lê tabelas internas; mensagens não se alteram; aditivos não saem pelo portal.
- **Invariantes:** INV-008, 012, 013, 018, 020.
- **Critério de aprovação:** nenhum dado de outro comprador alcançável por ID; cada exportação registrada.
- **Cobertura:** Coberto parcialmente por `020_portais.test.sql`, `038_chamados.test.sql`, `039_lgpd_exportacao.test.sql`, `043_email_chamados_convites.test.sql`, `044_convites_pendentes.test.sql`, `025_documentos_portal.test.sql`, `apps/web/e2e/portal.spec.ts`. Jornada completa: Não automatizada.

## FLX-013 — Sociedade: aporte, mútuo, devolução, distribuição, estorno e exportação contábil

- **Objetivo:** validar RN-S02 e a ligação sócios → contabilidade.
- **Módulos:** sócios, contabilidade, portal do sócio, motor (XIRR).
- **Pré-condições:** SPE com Ana 50% / Beto 50%; regras contábeis para `aporte_socio`, `mutuo_socio`, `devolucao_mutuo`, `distribuicao`.
- **Dados de teste:** aporte Ana 1.000.000; mútuo Beto 500.000; devolução de mútuo 200.000; distribuição 300.000 a cada.
- **Sequência:**
  1. `dona`: `public.registrar_movimento_socio` para cada tipo (`aporte`, `mutuo`, `devolucao_mutuo`, `distribuicao`).
  2. Valor 0 → erro hint `valor`; data futura → erro.
  3. `dona`: `public.estornar_movimento_socio(m_mutuo, 'Lançado no sócio errado')`; repetir → erro "já foi estornado".
  4. `contador`: `public.eventos_contabeis(SPE, ...)` → eventos `aporte_socio`, `devolucao_mutuo`, `distribuicao` (o mútuo estornado some).
  5. Ana (portal sócio): `public.meu_portal()` → só os próprios movimentos.
- **Tabelas afetadas:** `movimentos_socio`, `auditoria`.
- **Estado antes / depois:** 5 movimentos, 1 estornado.
- **Validações financeiras (centavos):** retorno de Ana = XIRR dos movimentos realizados dela (D-067); cada evento contábil tem débito e crédito pelo mesmo valor (INV-011).
- **Validações de segurança:** financeiro não registra movimento (`socios.gerenciar`); sócio vê só os seus.
- **Invariantes:** INV-009, 011, 012, 013, 020.
- **Critério de aprovação:** estorno preserva o movimento; exportação reflete só os ativos. **ACHADO:** um estorno feito depois de o período ter sido exportado não gera evento de estorno — o movimento simplesmente deixa de aparecer na reexportação (vale para recebimentos, pagamentos e repasses: todos filtrados por `estornado_em is null`).
- **Cobertura:** Coberto parcialmente por `018_socios.test.sql`, `023_contabil.test.sql` (aporte vira evento), `apps/web/e2e/socios.spec.ts`. Estorno × exportação: Não automatizado.

## FLX-014 — Viabilidade → plano original imutável → revisão → fluxo atual

- **Objetivo:** validar RN-F01, RN-F16, D-030, D-035, D-036.
- **Módulos:** viabilidade, plano, orçamento, projeção de custos, motor, painel consolidado.
- **Pré-condições:** EMP-A2 em estudo; `viabilidades.situacao` `rascunho`.
- **Dados de teste:** premissas do caso de referência (`docs/dominio.md` §3).
- **Sequência:**
  1. `fin` edita o estudo em rascunho (permitido); `fin`: `public.aprovar_viabilidade(v, resumo)` → erro (sem `plano.aprovar`).
  2. `dona`: `public.aprovar_viabilidade(v, resumo)` → `plano_versoes` versão 1; estudo `aprovada`.
  3. `update viabilidades ...` no aprovado → erro; `update`/`delete` em `plano_versoes` → erro (`privado.plano_imutavel`).
  4. `dona`: novo estudo + `public.aprovar_viabilidade(v2, resumo2)` sem motivo → erro; com motivo → versão 2; v1 `arquivada`.
  5. Orçamento revisado em `orcamento_itens` (copiado do plano) e contas a pagar → projeção `projetarCustos`.
- **Tabelas afetadas:** `viabilidades`, `plano_versoes`, `orcamento_itens`, `contas_pagar`, `auditoria`.
- **Estado antes / depois:** v1 imutável; v2 vigente; revisão com motivo na auditoria.
- **Validações financeiras (centavos):** indicadores do plano gravados = recalculados pelo motor; orçado = realizado + comprometido + projetado por centro (RN-F03); caso de referência dentro das tolerâncias (RN-F17).
- **Validações de segurança:** corretor não vê estudos nem plano (D-033).
- **Invariantes:** INV-009, 012, 013, 020.
- **Critério de aprovação:** original × revisão × realizado+projetado consistentes.
- **Cobertura:** Coberto parcialmente por `007_viabilidade_e_plano.test.sql`, `packages/motor-financeiro/src/caso-referencia.test.ts`, `packages/projecao/src/custos.test.ts`, `packages/aplicacao/src/viabilidade.test.ts`, `apps/web/e2e/viabilidade.spec.ts`.
- **Observação:** o banco grava o `p_resumo` enviado pelo app (calculado pelo motor); **HIPÓTESE:** não há recálculo no banco — mesma classe de risco do FLX-002.

## FLX-015 — Orçamento × contrato de fornecedor × pagamento (sem dupla contagem)

- **Objetivo:** provar RN-F03 com contrato, conta, pagamento e estorno em sequência.
- **Módulos:** orçamento, contratos de fornecedor, contas a pagar, pagamentos, projeção (`projetarCustos`), alertas.
- **Pré-condições:** plano aprovado com `infraestrutura.drenagem` orçado em 500.000.
- **Dados de teste:** contrato de fornecedor de 400.000 no centro `infraestrutura.drenagem`; conta de 150.000; pagamento de 150.000.
- **Sequência:**
  1. Criar `contratos_fornecedor` (RLS `custos.editar`) e conta vinculada; conta com centro diferente do contrato → erro.
  2. Pagamento 150.000; estorno; novo pagamento.
  3. Encerrar o contrato (`situacao` `encerrado`) → saldo não faturado sai do comprometido.
  4. Conferir projeção mês a mês e alertas (`alertas.desvio_plano`).
- **Tabelas afetadas:** `contratos_fornecedor`, `contas_pagar`, `pagamentos`, `orcamento_itens`.
- **Estado antes / depois:** realizado 150.000; comprometido 250.000 (contrato vigente) ou 0 (encerrado); projetado = 500.000 − realizado − comprometido.
- **Validações financeiras (centavos):** orçado = realizado + comprometido + projetado; estouro informado, nunca projetado negativo (D-034).
- **Validações de segurança:** corretor não vê contratos; engenharia só no próprio escopo.
- **Invariantes:** INV-009, 012, 013.
- **Critério de aprovação:** identidade do RN-F03 vale após cada passo.
- **Cobertura:** Coberto parcialmente por `008_custos_e_obra.test.sql`, `packages/projecao/src/custos.test.ts`, `apps/web/e2e/custos.spec.ts`.

## FLX-016 — Comissão nos modos `ato` e `recebido` com inadimplência e distrato

- **Objetivo:** validar RN-C06/RN-D04 e D-066 nos dois modos de `vendas.comissao_modo`.
- **Módulos:** corretores, comercial, carteira, distrato, projeção (`projetarReceitas`), parâmetros de distrato.
- **Pré-condições:** corretores com `comissao_percentual` 0,05 e `comissao_modo` `ato` (corretor1) e `recebido` (corretor2) em `corretores`.
- **Dados de teste:** venda V1 (A-1, `ato`) e V2 (A-2, `recebido`), condição CP.
- **Sequência:**
  1. `gestor`: `public.vender_lote` para V1 e V2 informando `comissao_percentual`/`comissao_modo` (a função não lê `corretores`: **HIPÓTESE** — o app preenche a partir do cadastro do corretor).
  2. Receber entrada das duas; deixar V2 inadimplente nas parcelas 1–3.
  3. Distratar V1 e V2 (`public.executar_distrato`); `distrato.deduz_comissao` em `false` (sugestão).
  4. Comparar fluxo atual: V1 comissão integral no mês da venda (não estornada no distrato); V2 comissão só sobre entrada recebida.
- **Tabelas afetadas:** `vendas`, `contratos`, `recebimentos`, `distratos`, `devolucoes`.
- **Estado antes / depois:** sem tabela de comissões — **NÃO IMPLEMENTADO** registro/pagamento/estorno de comissão; a comissão só existe como cálculo da projeção e como custo (centro `comercial.comissao`).
- **Validações financeiras (centavos):** V1: 5% × 6.000.000 = 300.000; V2: 5% × 600.000 = 30.000 após a entrada, crescendo com cada amortização recebida.
- **Validações de segurança:** corretor vê as próprias vendas, não o fluxo; RN-C07 prevê que veja "comissões" — **NÃO IMPLEMENTADO** tela/consulta de comissão do corretor (só a projeção para quem lê o financeiro).
- **Invariantes:** INV-005, 012.
- **Critério de aprovação:** modo `recebido` acompanha inadimplência e distrato; modo `ato` não estorna.
- **Cobertura:** Coberto parcialmente por `packages/projecao/src/vendas.test.ts` ("comissão sobre o recebido…"). Banco: Não automatizado.

## FLX-017 — Reajuste com índice negativo e com índice não publicado

- **Objetivo:** validar RN-K03, D-049, D-050 e o parâmetro `carteira.reajuste_negativo` (`aplicar` | `ignorar`).
- **Módulos:** índices (`public.importar_indices`), reajuste, carteira, cobrança, parâmetros.
- **Pré-condições:** contrato C1 vendido com `reajuste_negativo` `ignorar` (padrão); contrato C2 vendido depois de `public.definir_parametro(A, 'carteira.reajuste_negativo', '"aplicar"', ...)`; índice `IGPM` com 12 meses publicados de produto 0,98; índice `INCC` com só 11 meses publicados.
- **Dados de teste:** C3 em `INCC`.
- **Sequência:**
  1. `public.executar_reajustes(hoje)`.
  2. C1: `reajustes.fator` 0,98, `fator_aplicado` 1, `diferenca_centavos` 0.
  3. C2: `fator_aplicado` 0,98 → parcelas abertas reduzidas.
  4. C3: nada gravado (pendente); depois de publicar o 12º mês, nova execução reajusta.
  5. Revisão do índice publicada depois do reajuste → `indice_valores` atualizado, reajuste já gravado não muda (**HIPÓTESE**: não há recálculo retroativo).
- **Tabelas afetadas:** `indice_valores`, `reajustes`, `parcelas`, `contratos`.
- **Estado antes / depois:** um registro em `reajustes` por aniversário (C1 e C2); C3 sem registro até a publicação.
- **Validações financeiras (centavos):** C2: parcela 225.000 → round(225.000 × 0,98) = 220.500; `correcao_centavos` −4.500 (permitido: o check é `valor = amortização + juros + correção`); parcela parcialmente paga corrige só o saldo; `valor_centavos > 0`. **ACHADO:** com `ignorar`, a deflação é descartada (não compensa no aniversário seguinte) — regra não escrita em `docs/decisoes.md`.
- **Validações de segurança:** `executar_reajustes` não executável por usuário; `public.reajustar_contrato` só `carteira.receber`.
- **Invariantes:** INV-002, 003, 012, 013, 020.
- **Critério de aprovação:** nenhum reajuste com índice incompleto; deflação conforme o parâmetro copiado na venda. **VALIDAR COM ADVOGADO** (PL-03).
- **Cobertura:** Coberto parcialmente por `011_reajuste.test.sql` ("índice negativo é ignorado", "sem todos os índices publicados…"), `036_indice_inpc.test.sql`, `040_indice_incc.test.sql`. Modo `aplicar`: Não automatizado.

## FLX-018 — Créditos do comprador: registrar, aplicar, estornar a aplicação, devolver, cancelar

- **Objetivo:** validar D-114 e INV-014.
- **Módulos:** créditos, carteira, portal, LGPD, DIMOB/informe.
- **Pré-condições:** contrato CP de Joana; boleto pago em dobro (225.000 a mais) fora do sistema.
- **Dados de teste:** crédito de 225.000 com observação "Boleto pago em dobro".
- **Sequência:**
  1. `fin`: `public.registrar_credito(c, hoje − 5, 225000, 'Boleto pago em dobro')`; sem observação → erro hint `observacao`; data futura → erro.
  2. `fin`: `public.aplicar_credito(cr, parcela 3, 300000)` → erro (acima do saldo); `public.aplicar_credito(cr, parcela de outro contrato, ...)` → erro hint `parcela`.
  3. `fin`: `public.aplicar_credito(cr, parcela 3, 225000)` → recebimento `origem` `credito`, `data_pagamento` = data do crédito (hoje − 5).
  4. `fin`: `public.cancelar_credito(cr, 'engano')` → erro ("já foi usado").
  5. `fin`: `public.estornar_recebimento(rec_credito, 'Aplicado na parcela errada')` → saldo do crédito volta a 225.000 (`privado.saldo_credito` ignora usos com recebimento estornado).
  6. `fin`: `public.devolver_credito(cr, hoje − 6, 100000)` → erro (antes da data do crédito); `public.devolver_credito(cr, hoje, 100000)` → uso `devolucao`.
  7. `fin`: `public.aplicar_credito(cr, parcela 4, 125000)`; saldo 0.
  8. Joana (portal) vê os usos; `public.dados_titular_do_contrato(c)` inclui créditos e usos.
- **Tabelas afetadas:** `creditos_comprador`, `usos_credito`, `recebimentos`, `parcelas`.
- **Estado antes / depois:** crédito com 3 usos (1 com recebimento estornado), saldo 0.
- **Validações financeiras (centavos):** saldo = 225.000 − (225.000 estornado → 0) − 100.000 − 125.000 = 0; nunca negativo; parte devolvida nunca entra em recebimentos; DIMOB/informe usam a data em que o dinheiro entrou (**VALIDAR COM CONTADOR**, PL-24).
- **Validações de segurança:** contador não registra crédito; outra pessoa não vê; comprador vê só os próprios.
- **Invariantes:** INV-004, 009, 012, 013, 014, 020.
- **Critério de aprovação:** saldo nunca negativo; cancelamento só sem uso.
- **Cobertura:** Coberto parcialmente por `041_credito_comprador.test.sql`, `apps/web/e2e/carteira.spec.ts` ("crédito por pagamento a maior aplicado em parcela"). Aplicação em parcela com cobrança pendente: Não automatizado.
- **Observação:** **NÃO IMPLEMENTADO** estorno de devolução de crédito (`usos_credito` tipo `devolucao` não tem função de estorno). **HIPÓTESE:** `aplicar_credito` não confere cobrança pendente na parcela — uma cobrança pendente ficará `divergente` no próximo aviso.

## FLX-019 — Antecipação parcial, quitação antecipada e termo de quitação

- **Objetivo:** validar RN-K08, RN-K09, D-057, D-058, D-087.
- **Módulos:** carteira, cobrança, motor (`descontoAntecipacao`, `quitacaoAntecipada`), documentos, portal.
- **Pré-condições:** contrato com juros 1% a.m. (Price), parcelas 1–6 pagas.
- **Dados de teste:** antecipar 20–24; depois todas as restantes.
- **Sequência:**
  1. Cobrança pendente na parcela 20 → `public.antecipar_parcelas` → erro hint `cobranca_pendente`; `public.cancelar_cobranca(co, 'Antecipação')`.
  2. Item com parcela vencida → erro hint `parcela_vencida`; desconto ≥ saldo → erro.
  3. `fin`: `public.antecipar_parcelas(c, hoje, [{parcela, desconto_centavos}...])` com descontos de `descontoAntecipacao`.
  4. Antecipar todas as restantes → contrato `quitado`.
  5. `public.documento_portal(c, 'quitacao')` → disponível; antes do passo 4 → erro "O termo de quitação só sai com o contrato quitado."
- **Tabelas afetadas:** `recebimentos`, `parcelas`, `contratos`, `cobrancas`.
- **Estado antes / depois:** parcelas `paga`; contrato `quitado`.
- **Validações financeiras (centavos):** recebido = saldo − juros não decorridos (pro rata, mês de 30 dias); `desconto_centavos` < saldo; `valor_centavos` = principal − desconto.
- **Validações de segurança:** só `carteira.receber`; parcela de outro contrato recusada.
- **Invariantes:** INV-002, 004, 012, 020.
- **Critério de aprovação:** quitação só com saldo zero.
- **Cobertura:** Coberto parcialmente por `013_aditivos.test.sql`, `025_documentos_portal.test.sql`, `packages/motor-financeiro/src/quitacao.test.ts`, `apps/web/e2e/carteira.spec.ts`, `apps/web/e2e/lote-quitado.spec.ts`.
- **Observação (ACHADO):** o desconto de antecipação vem do app; o banco só exige 0 ≤ desconto < saldo.

## FLX-020 — Cessão de contrato → portal do cessionário → DIMOB e informe

- **Objetivo:** validar D-060 e D-077 (comprador atual na DIMOB).
- **Módulos:** aditivos (cessão), compradores, portal, DIMOB, informe de pagamentos, cobrança.
- **Pré-condições:** contrato de Joana adimplente; `carteira.cessao_exige_adimplencia` verdadeiro (sugestão).
- **Dados de teste:** cessionário Lucas.
- **Sequência:**
  1. Com parcela vencida → `public.ceder_contrato(c, Lucas, hoje, 'Cessão a terceiro')` → erro hint `inadimplente`.
  2. Regularizar; cobrança pendente → erro hint `cobranca_pendente`; cancelar.
  3. `public.ceder_contrato(c, Joana, ...)` → erro hint `cessionario`.
  4. `public.ceder_contrato(c, Lucas, hoje, 'Cessão a terceiro')` → `contratos.comprador_id` = Lucas; `vendas.comprador_id` continua Joana.
  5. Convite de portal para Lucas; Joana perde o contrato no `public.meu_portal()`.
  6. `public.dados_dimob(SPE, ano)` → comprador = Lucas; `public.informe_pagamentos(c, ano)` lido por Lucas inclui pagamentos feitos por Joana (**HIPÓTESE** — PL-12).
- **Tabelas afetadas:** `aditivos` (tipo `cessao`), `contratos`, `cobrancas`.
- **Estado antes / depois:** parcelas inalteradas; aditivo registra cedente e cessionário.
- **Validações financeiras (centavos):** saldo antes = saldo depois; nenhuma parcela muda.
- **Validações de segurança:** só `venda.registrar` ou `carteira.receber`; ex-comprador sem acesso ao contrato.
- **Invariantes:** INV-009, 012, 013, 020.
- **Critério de aprovação:** o portal acompanha o comprador atual; o histórico fica.
- **Cobertura:** Coberto parcialmente por `014_cessao_troca_lote.test.sql`, `021_dimob.test.sql`, `apps/web/e2e/carteira.spec.ts`. Portal após cessão: Não automatizado.
- **Observação:** `contratos.situacao` admite `cedido`, mas nenhuma função grava esse valor (a cessão mantém `vigente`).

## FLX-021 — Troca de lote → lote antigo disponível → nova venda do antigo

- **Objetivo:** validar D-061 sem dupla venda.
- **Módulos:** aditivos (troca), comercial, lotes, carteira, tabela de preços.
- **Pré-condições:** contrato CP de Joana em A-1, entrada paga, parcelas 1–4 pagas; A-7 `disponivel`, com preço de tabela 6.600.000 (tabela T2 do FLX-008).
- **Dados de teste:** preço novo 6.600.000.
- **Sequência:**
  1. `gestor`: `public.trocar_lote(c, A-7 de outro empreendimento, ...)` → erro hint `lote`; A-1 → erro; lote `reservado` → erro hint `lote_indisponivel`.
  2. Preço ≤ entrada → erro hint `preco`.
  3. `gestor`: `public.trocar_lote(c, A-7, hoje, 'Troca por lote de esquina', 6600000, {...}, plano)`.
  4. A-1 `disponivel`; A-7 `vendido`; `vendas.lote_id`/`preco_centavos` e `contratos.lote_id` atualizados.
  5. `gestor`: `public.vender_lote(A-1, {Marina, ...})` → aceita (índice de venda ativa por lote).
- **Tabelas afetadas:** `aditivos` (tipo `troca_lote`), `parcelas`, `vendas`, `contratos`, `lotes`.
- **Estado antes / depois:** novo plano numerado após a última parcela.
- **Validações financeiras (centavos):** novo saldo = saldo em aberto (20 × 225.000 = 4.500.000) + (6.600.000 − 6.000.000) = 5.100.000; `encargos_incorporados_centavos` = 600.000 e `desconto_centavos` = 0; soma das amortizações do novo plano = 5.100.000.
- **Validações de segurança:** só `venda.registrar`.
- **Invariantes:** INV-005, 009, 012, 013, 020.
- **Critério de aprovação:** cada lote com no máximo uma venda ativa ao fim.
- **Cobertura:** Coberto parcialmente por `014_cessao_troca_lote.test.sql` ("lote antigo pode ser vendido de novo"), `apps/web/e2e/carteira.spec.ts`.
- **Observação:** a troca grava `vendas.preco_centavos` novo; `vendas` é imutável (`privado.venda_imutavel`) exceto por essas funções — a DIMOB passa a mostrar o preço novo (**HIPÓTESE**, PL-12).

## FLX-022 — Contabilidade: regras, formato CSV e eventos com estornos

- **Objetivo:** validar D-081/D-082/D-083.
- **Módulos:** contabilidade (`regras_contabeis`, `formatos_contabeis`, `plano_contas`), carteira, custos, distrato, permutas, sócios, `packages/integracoes/src/contabil.ts`.
- **Pré-condições:** plano de contas padrão; período com venda, recebimento com encargos e desconto, distrato, devolução paga, repasse, custo lançado e pago, aporte.
- **Dados de teste:** formato `separador` `;`, `decimal` `,`, `formato_data` `DD/MM/AAAA`, `cabecalho` verdadeiro; variante `|`, `.`, `AAAA-MM-DD`, colunas incluindo `empreendimento`.
- **Sequência:**
  1. `contador`: inserir `regras_contabeis` para todos os eventos exceto `repasse_permuta`.
  2. Regra com conta fora do plano → erro (FK `(tenant_id, conta_debito)`).
  3. `public.eventos_contabeis(SPE, início, fim)`; período invertido ou com mais de 400 dias ("até 13 meses") → erro hint `periodo`.
  4. Gerar CSV nos dois formatos; `repasse_permuta` aparece como pendência (evento sem regra não exportado).
  5. Visão caixa × competência.
- **Tabelas afetadas:** `regras_contabeis`, `formatos_contabeis`, `plano_contas` (leitura de todo o resto).
- **Estado antes / depois:** nenhuma escrita em dados financeiros.
- **Validações financeiras (centavos):** recebimento com encargos gera `recebimento_parcela` (principal) + `recebimento_encargos` (multa + juros) + `desconto_concedido`; Σ débitos = Σ créditos por evento (INV-011); valores formatados com o decimal escolhido sem perder centavos.
- **Validações de segurança:** só `contabil.exportar` / `contabil.configurar`; outra loteadora recusada.
- **Invariantes:** INV-011, 012, 013.
- **Critério de aprovação:** arquivo importável e completo; pendências listadas.
- **Cobertura:** Coberto parcialmente por `023_contabil.test.sql`, `packages/integracoes/src/contabil.test.ts`, `apps/web/e2e/contabil.spec.ts`. Leiautes específicos (Domínio, Alterdata): **NÃO IMPLEMENTADO** (D-082).

## FLX-023 — DIMOB e informe de pagamentos com estorno, crédito e cessão

- **Objetivo:** validar RN-X04 (só recebimentos registrados) e D-075–D-080.
- **Módulos:** DIMOB (`public.dados_dimob`, `leiautes_declaracao`, `packages/integracoes/src/dimob.ts`), informe (`public.informe_pagamentos`), carteira, créditos, cessão.
- **Pré-condições:** SPE com CNPJ e código de município da Receita; 3 contratos: vendido no ano, vendido no ano anterior com pagamento no ano, vendido no ano anterior sem pagamento no ano.
- **Dados de teste:** `fiscal.dimob_pago_com_encargos` verdadeiro e depois falso.
- **Sequência:**
  1. `contador`: `public.dados_dimob(SPE, ano)` → só os dois primeiros; ano futuro → erro.
  2. Estornar um recebimento → valor pago no ano reduz.
  3. Aplicar crédito → entra na data do crédito.
  4. Alternar `fiscal.dimob_pago_com_encargos` → valor pago com/sem multa e juros.
  5. `public.informe_pagamentos(c, ano)` pela gestão e pelo comprador no portal.
- **Tabelas afetadas:** leitura de `contratos`, `vendas`, `recebimentos`, `leiautes_declaracao`.
- **Estado antes / depois:** sem escrita.
- **Validações financeiras (centavos):** valor da operação = `vendas.preco_centavos`; pago no ano = Σ recebimentos não estornados do ano (com ou sem encargos); acumulado até 31/12 inclui anos anteriores.
- **Validações de segurança:** `fiscal.declarar` (dono, financeiro, contador); comprador só o próprio informe.
- **Invariantes:** INV-009, 012.
- **Critério de aprovação:** arquivo com o leiaute do ano (R03, 249 posições).
- **Cobertura:** Coberto parcialmente por `021_dimob.test.sql`, `022_informe_pagamentos.test.sql`, `packages/integracoes/src/dimob.test.ts`, `apps/web/e2e/dimob.spec.ts`. **VALIDAR COM CONTADOR** (PL-12, PL-20, PL-24).

## FLX-024 — IBS/CBS como parâmetros com vigência

- **Objetivo:** validar RN-X02 e D-084 (fora do fluxo até o contador validar).
- **Módulos:** parâmetros, motor (`ibsCbsSobreVenda`), projeção, portal (obra).
- **Pré-condições:** catálogo com `tributario.cbs_aliquota`, `tributario.ibs_aliquota`, `tributario.ibs_cbs_reducao_imoveis`, `tributario.ibs_cbs_redutor_social_lote`, `tributario.ibs_cbs_no_fluxo`.
- **Dados de teste:** venda de 6.000.000 em 2026 e outra em 2027.
- **Sequência:**
  1. `public.parametro_vigente('tributario.cbs_aliquota', data em 2026, A)` → valor de teste; em 2027 → sem valor.
  2. Simular `ibsCbsSobreVenda` com redutor social e redução de 50%.
  3. `tributario.ibs_cbs_no_fluxo` falso → fluxo projetado sem IBS/CBS; ligar por `public.definir_parametro` com motivo → passa a pesar.
- **Tabelas afetadas:** `parametro_valores`, `auditoria`.
- **Estado antes / depois:** nova vigência; anterior encerrada (não apagada).
- **Validações financeiras (centavos):** base nunca negativa; venda zero não divide por zero.
- **Validações de segurança:** só `parametros.editar` grava; outro tenant não lê.
- **Invariantes:** INV-013, 018.
- **Critério de aprovação:** nenhum valor de alíquota em código. **VALIDAR COM CONTADOR** (PL-11, PL-22).
- **Cobertura:** Coberto parcialmente por `024_reforma_obra_portal.test.sql`, `packages/motor-financeiro/src/reforma.test.ts`.

## FLX-025 — Asaas: configurar → emitir → segunda via no portal → desativar

- **Objetivo:** validar D-052, D-053, D-072 e o efeito de desativar a integração.
- **Módulos:** integrações, cobrança, portal, aditivos/distrato (bloqueio por cobrança pendente).
- **Pré-condições:** Joana com portal; parcela 7 aberta.
- **Dados de teste:** chave sandbox fictícia `$aact_hmlg_TESTE` (simulada).
- **Sequência:**
  1. `fin`: `public.configurar_asaas(A, 'sandbox', chave)` → erro (só `integracoes.gerenciar`).
  2. `dona`: chave de produção no sandbox → erro; chave recusada pelo Asaas simulado → erro, nada gravado; chave aceita → token do webhook (só o hash em `integracoes_asaas.webhook_token_hash`; chave no Vault).
  3. Comprador sem CPF → `public.gerar_cobranca` → erro hint `sem_cpf`.
  4. Joana: `public.segunda_via(p7)` → emite; segunda chamada → mesma cobrança pendente (`cobrancas_pendente_por_parcela_idx`).
  5. `dona`: `public.desativar_asaas(A)` → `ativo` falso; `public.segunda_via` → erro hint `sem_integracao`; webhook → `'nao_autorizado'`; `public.conciliar_cobrancas` ignora o tenant.
  6. `fin`: `public.cancelar_cobranca(co7, 'Integração desligada')` → erro hint `asaas_sem_integracao`; consequentemente `public.renegociar_contrato`, `public.executar_distrato`, `public.ceder_contrato`, `public.trocar_lote` e `public.antecipar_parcelas` ficam bloqueados por `cobranca_pendente`. **ACHADO** não documentado.
  7. Reativar com `public.configurar_asaas` → novo token; cancelar e seguir.
- **Tabelas afetadas:** `integracoes_asaas`, `asaas_clientes`, `cobrancas`, `vault.secrets`.
- **Estado antes / depois:** integração ativa → inativa → ativa; cobrança pendente atravessa a desativação.
- **Validações financeiras (centavos):** cobrança emitida pelo saldo em aberto da parcela (`valor_centavos − pago_centavos`), vencimento hoje se vencida.
- **Validações de segurança:** ninguém lê a referência do segredo; financeiro vê a situação, não a chave.
- **Invariantes:** INV-007, 008, 012, 018, 020.
- **Critério de aprovação:** desativar não deixa cobrança órfã sem caminho de saída (hoje deixa).
- **Cobertura:** Coberto parcialmente por `012_cobranca_asaas.test.sql`, `020_portais.test.sql`, `apps/web/e2e/integracoes.spec.ts`, `apps/web/e2e/portal.spec.ts`. Desativação com cobrança pendente: Não automatizado.

## FLX-026 — Segurança entre tenants com usuário membro de dois tenants

- **Objetivo:** provar RN-G01, INV-012 e INV-018 em funções e tabelas.
- **Módulos:** acessos, todas as funções `SECURITY DEFINER`, RLS, Storage.
- **Pré-condições:** `contador@a.exemplo.test` também é contador em B (D-003); dados completos em A e B.
- **Dados de teste:** IDs de lote, contrato, parcela, cobrança, crédito, permuta de A.
- **Sequência:**
  1. `dona@b`: chamar com IDs de A cada função de escrita (`public.reservar_lote`, `public.vender_lote`, `public.criar_contrato`, `public.registrar_recebimento`, `public.estornar_recebimento`, `public.gerar_cobranca`, `public.renegociar_contrato`, `public.executar_distrato`, `public.pagar_devolucao`, `public.registrar_credito`, `public.aplicar_credito`, `public.registrar_repasse`, `public.registrar_medicao`, `public.ratear_despesa`, `public.importar_carteira`, `public.definir_parametro`, `public.publicar_tabela_preco`) → todas `insufficient_privilege`.
  2. `dona@b`: `public.ratear_despesa` misturando empreendimento de A e de B → recusado.
  3. `dona@b`: inserir `contas_pagar` em B apontando `contrato_id` de A → FK composta recusa.
  4. `contador`: `testes.linhas_visiveis_do_tenant(A)` e `(B)` → só leitura permitida ao papel, nada de escrita.
  5. Anônimo: só `public.webhook_asaas`, `public.vitrine_publica`, `public.registrar_interesse`, `public.descadastrar_lembretes`.
  6. Storage: ler planta/anexo de A com sessão de B → recusado (`privado.pode_planta`, `privado.pode_documento`).
- **Tabelas afetadas:** nenhuma (todas as tentativas falham).
- **Estado antes / depois:** idêntico; `testes.linhas_afetadas` = 0.
- **Validações financeiras (centavos):** saldos de A inalterados.
- **Validações de segurança:** mensagens de erro não revelam existência do registro (ex.: "Contrato não encontrado." com `insufficient_privilege`).
- **Invariantes:** INV-012, 018, 020.
- **Critério de aprovação:** zero linhas afetadas e zero linhas lidas fora do papel.
- **Cobertura:** Coberto parcialmente por `000_rls_obrigatorio.test.sql`, `001_isolamento_entre_clientes.test.sql` e asserções "outra loteadora/quem não é da loteadora" espalhadas. Varredura de todas as funções com IDs de outro tenant: Não automatizado.

## FLX-027 — Auditoria ponta a ponta

- **Objetivo:** validar RN-G03 e INV-013 em uma sequência que toca vários módulos.
- **Módulos:** auditoria, parâmetros, lotes, carteira, aditivos, permissões.
- **Pré-condições:** massa padrão.
- **Dados de teste:** motivo "Ajuste solicitado pela diretoria".
- **Sequência:**
  1. `public.definir_parametro(A, 'carteira.multa_atraso', '0.02', amanhã, motivo)`; alterar matrícula de A-1; `public.estornar_recebimento`; `public.renegociar_contrato`; aceitar convite de equipe.
  2. `contador` (`auditoria.ler`): ler `auditoria` filtrando `tabela`, `registro_id`; conferir `antes`, `depois`, `campos_alterados`, `usuario_id`, `motivo`.
  3. `fin`: `update`/`delete` em `auditoria` → recusado; `postgres`: `delete` → recusado (`privado.auditoria_imutavel`), `truncate` → recusado.
  4. `corretor`: ler `auditoria` → 0 linhas.
- **Tabelas afetadas:** `auditoria`.
- **Estado antes / depois:** uma linha por operação.
- **Validações financeiras (centavos):** `antes`/`depois` de `parcelas.pago_centavos` batem com o estorno.
- **Validações de segurança:** auditoria imutável inclusive para o dono do banco.
- **Invariantes:** INV-009, 013.
- **Critério de aprovação:** toda alteração exigida pela RN-G03 aparece com o motivo quando a função o exige.
- **Cobertura:** Coberto parcialmente por `002_auditoria.test.sql`, `005_parametros_com_vigencia.test.sql`, `008_custos_e_obra.test.sql`, `037_matricula_lote.test.sql`.
- **Observação:** tabelas sem `privado.instrumentar`: `asaas_eventos`, `tabela_preco_itens`, `modelos_documento` (D-062: sem auditoria do conteúdo), `indice_valores` e catálogos. Mudança de preço por tabela fica auditada em `lotes` (via `privado.sincronizar_precos`) e em `tabelas_preco`.

## FLX-028 — Modelos DOCX: publicar → documentos na gestão e no portal → voltar ao padrão

- **Objetivo:** validar D-062 e D-087.
- **Módulos:** modelos de documento, contratos, portal, `packages/integracoes/src/documentos.ts`, informe.
- **Pré-condições:** contrato vigente de Joana; contrato quitado de Pedro.
- **Dados de teste:** modelo `contrato-teste.docx` com `{comprador_nome}` e `{#parcelas}…{/parcelas}`; modelo com marcador desconhecido.
- **Sequência:**
  1. `fin`: `public.publicar_modelo(A, 'contrato', ...)` → erro (só `modelos.gerenciar`).
  2. `dona`: modelo inválido → o app recusa antes de enviar (conferência de preenchimento); válido → versão nova `ativo`, anterior desativada (`modelos_documento_ativo_idx`).
  3. Joana: `public.documento_portal(c, 'contrato')` → dados para o modelo; `'quitacao'` → erro; `'aditivo_renegociacao'` → erro "Documento indisponível no portal."
  4. Pedro: `public.documento_portal(c, 'quitacao')` → disponível.
  5. `dona`: `public.usar_modelo_padrao(A, 'contrato')` → sem ativo, vale o padrão.
- **Tabelas afetadas:** `modelos_documento`.
- **Estado antes / depois:** histórico de versões preservado.
- **Validações financeiras (centavos):** tabela de parcelas no documento = parcelas do contrato (valores formatados `R$ 1.234,56`).
- **Validações de segurança:** outra loteadora não vê modelos; outra pessoa não baixa documento.
- **Invariantes:** INV-012, 018.
- **Critério de aprovação:** o documento do portal e o da gestão saem do mesmo mapa de marcadores (`montarDados`).
- **Cobertura:** Coberto parcialmente por `015_modelos_documento.test.sql`, `025_documentos_portal.test.sql`, `packages/integracoes/src/documentos.test.ts`, `packages/dominio/src/documentos.test.ts`, `apps/web/e2e/modelos.spec.ts`. Assinatura eletrônica: **NÃO IMPLEMENTADO** (PL-06).

## FLX-029 — Limite de lotes do plano

- **Objetivo:** validar RN-G07 / D-016 (INV-019).
- **Módulos:** planos, tenants, empreendimentos, lotes, importação.
- **Pré-condições:** tenant B no plano `essencial` (`planos.max_lotes` 200) com 195 lotes.
- **Dados de teste:** empreendimento novo com 10 lotes.
- **Sequência:**
  1. `dona@b`: `public.criar_empreendimento_com_lotes(B, spe, 'Teste Limite', ..., 10 lotes)` → erro hint `plano_limite_lotes`; nada criado (nem o empreendimento).
  2. Com 5 lotes → aceita (total 200); um lote a mais (`insert into lotes`) → erro.
  3. Duas sessões criando lotes ao mesmo tempo → `pg_advisory_xact_lock` serializa; total final ≤ 200.
  4. Trocar plano para `empresarial` (`max_lotes` nulo) como `postgres` → sem limite.
  5. Distrato/permuta não mudam a contagem (conta todos os lotes do tenant).
- **Tabelas afetadas:** `empreendimentos`, `quadras`, `lotes`.
- **Estado antes / depois:** 200 lotes no máximo.
- **Validações financeiras (centavos):** não se aplica.
- **Validações de segurança:** o dono não deve conseguir trocar o próprio plano. **ACHADO (a confirmar por teste):** a política `"dono altera o tenant"` permite `update` da linha inteira de `tenants` a quem tem `tenant.administrar`, e não foi encontrada restrição de coluna nem gatilho sobre `tenants.plano_id`; um `update public.tenants set plano_id = 'empresarial'` pelo PostgREST contornaria o limite.
- **Invariantes:** INV-019, 020.
- **Critério de aprovação:** limite nunca ultrapassado, inclusive em concorrência.
- **Cobertura:** Coberto parcialmente por `003_regras_de_cadastro.test.sql` ("acima do limite do plano é recusado"). Concorrência: Não automatizado.
- **Observação:** **NÃO IMPLEMENTADO** a liberação de funcionalidades por plano — `privado.tem_funcionalidade` e as tabelas `funcionalidades`/`plano_funcionalidades` existem, mas a função não é chamada por nenhuma política ou função.

## FLX-030 — Fornecedores e anexos de contas

- **Objetivo:** validar D-102 (Storage privado, pasta por conta).
- **Módulos:** fornecedores, contas a pagar, anexos (`anexos_conta`, bucket `documentos`), leitura de documento com IA.
- **Pré-condições:** fornecedor com `documento` (CNPJ 11.222.333/0001-81 em B não conflita com A: `fornecedores_documento_idx` é por tenant).
- **Dados de teste:** `nota-teste.pdf` (≤ 10 MB) e `nota-grande.pdf` (> 10 MB); `planilha.xlsx` (tipo não permitido).
- **Sequência:**
  1. Fornecedor com o mesmo documento duas vezes no mesmo tenant → erro.
  2. `fin` envia o PDF em `<tenant>/<empreendimento>/contas/<conta>/` e registra `anexos_conta`; caminho de outra conta → erro (`privado.validar_anexo_conta`); conta de outro empreendimento → erro.
  3. Tipo `xlsx` → recusado (check de `tipo`); arquivo > 10 MB → recusado pelo bucket (**HIPÓTESE**: limite configurado no bucket).
  4. Leitura com IA (`packages/integracoes/src/leitura-documento.ts`) só preenche o formulário; nada é lançado sem confirmação (RN-I03).
  5. Download por rota do app com link assinado de 60 s.
- **Tabelas afetadas:** `fornecedores`, `contas_pagar`, `anexos_conta`, `storage.objects`.
- **Estado antes / depois:** anexo vinculado; conta inalterada.
- **Validações financeiras (centavos):** valor sugerido pela IA não grava sem confirmação.
- **Validações de segurança:** corretor não vê notas; outra loteadora não vê; ler exige `financeiro.ler`.
- **Invariantes:** INV-012, 018.
- **Critério de aprovação:** nenhum arquivo acessível fora da pasta/escopo.
- **Cobertura:** Coberto parcialmente por `032_anexos_contas.test.sql`, `packages/integracoes/src/leitura-documento.test.ts`, `apps/web/e2e/anexos.spec.ts`.
- **Observação (ACHADO):** existe política `"remover anexos de contas"` (delete com `custos.editar`), enquanto D-102 diz "Anexos não são editados; registros financeiros não são apagados". A remoção não é edição, mas convém confirmar com o dono do produto.

## FLX-031 — Alertas de risco a partir da carteira e do fluxo

- **Objetivo:** validar D-093.
- **Módulos:** alertas (`avaliarAlertas`), carteira (`public.inadimplencia_historico`), parâmetros (`alertas.*`), custos, plano.
- **Pré-condições:** EMP-A1 com 10 contratos, 3 em atraso; plano aprovado; custos acima do plano.
- **Dados de teste:** `alertas.inadimplencia_alta`, `alertas.crescimento_inadimplencia`, `alertas.desvio_plano`, `alertas.horizonte_aporte_meses`.
- **Sequência:**
  1. `public.inadimplencia_historico(EMP-A1, [hoje − 60, hoje − 30, hoje])`.
  2. Avaliar alertas com os limites vigentes; alterar `alertas.inadimplencia_alta` por `public.definir_parametro` → alerta some/aparece.
  3. Pagar as vencidas → alerta de inadimplência some; estornar → volta.
- **Tabelas afetadas:** `parametro_valores` (alertas não são gravados).
- **Estado antes / depois:** sem estado persistido.
- **Validações financeiras (centavos):** inadimplência reconstruída das parcelas e recebimentos, inclusive estornos.
- **Validações de segurança:** quem não é da loteadora não vê.
- **Invariantes:** INV-012, 018.
- **Critério de aprovação:** os mesmos números da carteira e do painel.
- **Cobertura:** Coberto parcialmente por `027_alertas.test.sql`, `packages/projecao/src/alertas.test.ts`, `apps/web/e2e/alertas.spec.ts`. Aviso por e-mail/WhatsApp de alertas: **NÃO IMPLEMENTADO**.

## FLX-032 — Atendimento: chamados com e-mail

- **Objetivo:** validar D-111 e D-116.
- **Módulos:** chamados, e-mail (`privado.avisar_chamado`, `privado.enviar_email`), portal, permissões por escopo.
- **Pré-condições:** Joana no portal; `gestor` com escopo só em EMP-A2; `fin` com escopo de tenant.
- **Dados de teste:** mensagem com `<script>` para testar escape.
- **Sequência:**
  1. Joana: `public.abrir_chamado(c, 'IPTU', 'documentos', '<script>x</script> Qual o valor?')` → aviso só para quem tem `atendimento.responder` no escopo de EMP-A1 (fin, dona; não o gestor de EMP-A2, não o contador).
  2. Conferir HTML escapado no corpo do e-mail.
  3. `fin`: `public.responder_chamado` → `em_atendimento`; e-mail para Joana com link do chamado (`plataforma.url_site`).
  4. `contador`: `public.responder_chamado` → erro; lê a conversa.
  5. `carteira.aviso_chamado_email` falso → conversa segue sem e-mail.
- **Tabelas afetadas:** `chamados`, `chamado_mensagens`, `envios_email`.
- **Estado antes / depois:** chamado `aberto` → `em_atendimento` → `resolvido` → `aberto` (nova mensagem do comprador).
- **Validações financeiras (centavos):** não se aplica.
- **Validações de segurança:** mensagens imutáveis; comprador não muda a situação.
- **Invariantes:** INV-008, 012, 013.
- **Critério de aprovação:** nenhum aviso fora do escopo; um envio por mensagem e destinatário.
- **Cobertura:** Coberto parcialmente por `038_chamados.test.sql`, `043_email_chamados_convites.test.sql`. Escopo por empreendimento no aviso: Não automatizado.

## FLX-033 — Lembretes de vencimento por e-mail e descadastro

- **Objetivo:** validar RN-K10 e D-115.
- **Módulos:** e-mail, carteira, cobrança, portal, parâmetros, LGPD.
- **Pré-condições:** `carteira.lembrete_email_ativo` verdadeiro; `carteira.lembrete_dias_antes` 3, `carteira.lembrete_no_vencimento` verdadeiro, `carteira.lembrete_dias_depois` 3; Joana com e-mail e cobrança pendente; Pedro sem portal e sem cobrança.
- **Dados de teste:** parcela de Joana vencendo em hoje + 3.
- **Sequência:**
  1. `public.enviar_lembretes_vencimento(hoje)` como `service_role` → 1 e-mail (etapa "antes") com o link do boleto; `authenticated` → erro.
  2. Repetir no mesmo dia → `'repetido'` (referência `<parcela>:<etapa>:<vencimento>`).
  3. Pedro: e-mail orienta falar com a loteadora (sem portal, sem boleto).
  4. Joana clica no link: `public.descadastrar_lembretes(token_descadastro)` sem login → `recebe_lembretes` falso; próxima rotina não envia.
  5. Joana no portal: `public.definir_meus_lembretes(true)` → volta a receber; `public.meus_lembretes()`.
  6. Parcela paga antes do lembrete → não envia (só `aberta` de contrato `vigente`).
- **Tabelas afetadas:** `envios_email`, `compradores`.
- **Estado antes / depois:** um envio por parcela e etapa.
- **Validações financeiras (centavos):** valor no e-mail = valor da parcela em reais.
- **Validações de segurança:** token de descadastro por comprador; link inválido → erro; outra pessoa não vê os envios.
- **Invariantes:** INV-008, 012.
- **Critério de aprovação:** nenhum e-mail para quem se descadastrou; desligado por padrão.
- **Cobertura:** Coberto parcialmente por `042_email_lembretes.test.sql`, `apps/web/e2e/portal.spec.ts` ("descadastro de lembretes sem login"). WhatsApp: **NÃO IMPLEMENTADO** (D-009 decidido, sem migration).

## FLX-034 — Vitrine pública e lead

- **Objetivo:** validar D-118.
- **Módulos:** vitrine, lotes, tabela de preços, leads, e-mail, portais (`public.vitrines_do_portal`).
- **Pré-condições:** EMP-A1 com lotes vendidos e disponíveis.
- **Dados de teste:** interessado "Carla Teste", `carla@exemplo.test`, telefone (11) 90000-0000.
- **Sequência:**
  1. `gestor`: `public.configurar_vitrine(EMP-A1, true, 'lote')` (valores aceitos: `'lote'`, `'a_partir'`, `'nenhum'`; outro → hint `precos`) → endereço sem acento; `contador` → erro.
  2. Anônimo: `public.vitrine_publica(slug)` → só disponibilidade e preço de lote disponível; modo "a partir de" esconde preço por lote; nenhum comprador/contrato.
  3. Anônimo: `public.registrar_interesse(slug, 'Carla Teste', email, null, A-3, 'Quero visitar', false)` → erro hint `consentimento`; sem contato → erro hint `contato`.
  4. Com consentimento → lead `origem` `site`, `consentimento_em`; e-mail para quem tem `venda.registrar`.
  5. Repetir em menos de 10 minutos → `'ok'` sem novo lead.
  6. Despublicar → `public.vitrine_publica` não mostra nada.
  7. Joana no portal: `public.vitrines_do_portal()` → publicados da loteadora dela.
- **Tabelas afetadas:** `empreendimentos`, `leads`, `envios_email`.
- **Estado antes / depois:** 1 lead.
- **Validações financeiras (centavos):** preço exibido = preço do lote/tabela vigente; nunca o preço de venda.
- **Validações de segurança:** anônimo não lê tabelas; texto escapado no e-mail.
- **Invariantes:** INV-008, 012.
- **Critério de aprovação:** sem duplicar lead por clique repetido; sem vazar dado comercial.
- **Cobertura:** Coberto parcialmente por `045_vitrine.test.sql`, `apps/web/e2e/vitrine.spec.ts`. **VALIDAR COM ADVOGADO** o texto de consentimento (PL-15).
- **Observação:** a janela de 10 minutos do anti-duplicação (mesmo empreendimento, origem `site`, mesmo e-mail ou telefone) está só no código; D-118 não a menciona.

## FLX-035 — Alteração de parâmetro com vigência e efeito em contratos existentes × novos

- **Objetivo:** validar RN-G06, D-019, D-044, D-059.
- **Módulos:** parâmetros, comercial, contratos, cobrança, reserva.
- **Pré-condições:** contrato C1 vendido ontem com multa 0,02.
- **Dados de teste:** nova multa 0,01 a partir de hoje no escopo `empreendimento` EMP-A1; `comercial.prazo_reserva_horas` 24.
- **Sequência:**
  1. `fin`: `public.definir_parametro(A, 'carteira.multa_atraso', '0.01', hoje, 'Política 2026', 'empreendimento', EMP-A1)`; sem motivo → erro; tipo incompatível → erro.
  2. `public.parametro_vigente('carteira.multa_atraso', ontem, A, 'empreendimento', EMP-A1)` = 0,02; hoje = 0,01; SPE herda do tenant.
  3. Nova venda C2 → `contratos.multa_atraso` 0,01; C1 continua 0,02 (copiado na venda).
  4. Cobrança de C1 envia multa 0,02 ao Asaas.
  5. Vigência futura substituída → removida com auditoria (D-019); sobreposição impedida (`parametro_valores_sem_sobreposicao`).
  6. `comercial.prazo_reserva_horas` 24 → nova reserva expira em 24 h.
- **Tabelas afetadas:** `parametro_valores`, `contratos`, `reservas`, `auditoria`.
- **Estado antes / depois:** duas vigências; anterior encerrada, não apagada.
- **Validações financeiras (centavos):** multa de C1 sobre 225.000 = 4.500; de C2 = 2.250.
- **Validações de segurança:** `parametros.editar` (dono, financeiro); escrita só pela função; outro tenant não lê.
- **Invariantes:** INV-012, 013, 018, 020.
- **Critério de aprovação:** contrato existente nunca muda de encargo por mudança de parâmetro.
- **Cobertura:** Coberto parcialmente por `005_parametros_com_vigencia.test.sql`, `010_contratos_carteira.test.sql` ("encargos vêm dos parâmetros vigentes"), `apps/web/e2e/parametros.spec.ts`, `packages/aplicacao/src/parametros.test.ts`.

## FLX-036 — Falha de integração: Asaas fora do ar

- **Objetivo:** garantir ausência de estado parcial (INV-020) quando o Asaas falha.
- **Módulos:** cobrança, webhook, conciliação agendada, aditivos, portal.
- **Pré-condições:** `privado.asaas_chamar` simulado para lançar exceção (timeout) ou devolver 500/503.
- **Dados de teste:** parcelas 8–10 de Joana.
- **Sequência:**
  1. `public.gerar_cobranca(p8)` com 503 → erro hint `asaas`; nenhuma linha em `cobrancas`/`asaas_clientes`.
  2. `public.segunda_via(p8)` no portal → erro amigável; nada gravado.
  3. `public.cancelar_cobranca(co9, 'Renegociação')` com 500 → erro; cobrança continua `pendente`; renegociação continua bloqueada.
  4. Webhook com GET falhando por exceção → a função aborta, a rota devolve 500 e o Asaas reenvia (nada gravado em `asaas_eventos`); com GET 500 → `'erro_consulta'` gravado (ver FLX-005, passo 8).
  5. `public.conciliar_cobrancas()` com uma cobrança que lança exceção → `raise warning` e segue com as demais.
  6. Serviço volta → varredura baixa o pagamento.
- **Tabelas afetadas:** `cobrancas`, `asaas_eventos`, `recebimentos`.
- **Estado antes / depois:** sem linhas órfãs; pendências resolvidas pela varredura.
- **Validações financeiras (centavos):** nenhuma parcela baixada sem confirmação do Asaas.
- **Validações de segurança:** mensagens de erro do Asaas não expõem a chave.
- **Invariantes:** INV-007, 008, 020.
- **Critério de aprovação:** nenhuma cobrança local sem correspondente no Asaas e vice-versa (exceto o caso documentado da emissão aceita no Asaas e falha local posterior — **HIPÓTESE**: a cobrança criada no Asaas ficaria sem registro local).
- **Cobertura:** Não automatizado (o `012_cobranca_asaas.test.sql` cobre só "chave recusada pelo Asaas não é gravada").

## FLX-037 — Falha de integração: Resend fora do ar ou sem chave

- **Objetivo:** confirmar que e-mail não bloqueia o fluxo de negócio.
- **Módulos:** e-mail, chamados, convites do portal, lembretes, vitrine.
- **Pré-condições:** segredo `resend_api_key` ausente ou `privado.resend_chamar` simulado com 500.
- **Dados de teste:** chamado de Joana; convite de Pedro; lead da vitrine.
- **Sequência:**
  1. `public.abrir_chamado` → chamado gravado; `envios_email.situacao` `falhou` com `erro` ("Chave do Resend não configurada." ou "HTTP 500").
  2. `public.enviar_convite_portal(token)` → convite continua válido; link copiável na tela (D-116).
  3. `public.registrar_interesse` → lead gravado.
  4. Resend volta; nova chamada de `public.enviar_convite_portal(token)` → `'repetido'`. **ACHADO:** envio com `falhou` nunca é reenviado, porque a idempotência (`on conflict (tenant_id, tipo, referencia) do nothing`) vale também para falhas. Lembrete que falhou no dia não é reenviado na mesma etapa.
- **Tabelas afetadas:** `envios_email`, `chamados`, `chamado_mensagens`, `leads`.
- **Estado antes / depois:** registros de negócio gravados; envios `falhou`.
- **Validações financeiras (centavos):** não se aplica.
- **Validações de segurança:** chave só no Vault; erro truncado a 500 caracteres.
- **Invariantes:** INV-008, 020.
- **Critério de aprovação:** negócio nunca desfeito por falha de e-mail; falhas visíveis à loteadora.
- **Cobertura:** Não automatizado.

## FLX-038 — Concorrência: duas reservas, reserva × venda, duas baixas

- **Objetivo:** validar RN-C02 e a serialização por `select … for update`.
- **Módulos:** comercial, carteira, cobrança, créditos.
- **Pré-condições:** duas conexões independentes (Playwright/`pg` em paralelo, como em `apps/web/e2e/comercial.spec.ts`).
- **Dados de teste:** lote A-10; parcela 12 de Joana (225.000).
- **Sequência:**
  1. 50 chamadas simultâneas a `public.reservar_lote(A-10, ...)` → exatamente 1 sucesso.
  2. `public.vender_lote(A-10)` pelo gestor × `public.cancelar_reserva` pelo corretor ao mesmo tempo → resultado serializado (venda com reserva `convertida` ou cancelamento seguido de venda sem reserva).
  3. Duas `public.vender_lote(A-9)` simultâneas → uma falha (`vendas_ativa_por_lote_idx` / status `vendido`).
  4. Duas `public.registrar_recebimento(p12, hoje, 225000)` simultâneas → `privado.baixar_parcela` trava parcela e contrato; a segunda falha (`parcela_fechada`).
  5. Webhook e baixa manual simultâneos → um recebimento; cobrança `divergente` ou `paga`.
  6. Duas `public.aplicar_credito` simultâneas do mesmo crédito somando mais que o saldo → uma falha (crédito travado com `for update`).
  7. Duas `public.estornar_recebimento(r)` simultâneas → uma falha ("já foi estornado").
- **Tabelas afetadas:** `reservas`, `vendas`, `lotes`, `recebimentos`, `parcelas`, `usos_credito`.
- **Estado antes / depois:** um vencedor por recurso.
- **Validações financeiras (centavos):** `pago_centavos` nunca > `valor_centavos`; crédito nunca negativo.
- **Validações de segurança:** não se aplica além das permissões normais.
- **Invariantes:** INV-005, 006, 007, 014, 020.
- **Critério de aprovação:** sem deadlock não tratado; sem duplicidade.
- **Cobertura:** Coberto parcialmente por `apps/web/e2e/comercial.spec.ts` ("50 reservas simultâneas do mesmo lote: exatamente 1 vence"). Demais casos: Não automatizado.

## FLX-039 — Convites de equipe com escopo

- **Objetivo:** validar D-017, D-026 e a hierarquia tenant → empresa → SPE → empreendimento.
- **Módulos:** acessos (`convites`, `membros`, `atribuicoes_papel`), RLS, todas as telas.
- **Pré-condições:** A com duas SPEs e EMP-A1/EMP-A2.
- **Dados de teste:** `eng2@a.exemplo.test` (engenharia, escopo `empreendimento` EMP-A2); `fin2@a.exemplo.test` (financeiro, escopo `spe`).
- **Sequência:**
  1. `dona`: `public.criar_convite(A, 'eng2@a.exemplo.test', 'engenharia', 'empreendimento', EMP-A2, 7)`; validade 31 → erro.
  2. `fin`: `public.criar_convite` → erro (só `membros.gerenciar`).
  3. Outro e-mail aceita → erro; e-mail com maiúsculas → aceito; reutilizar → erro; expirado → erro.
  4. `eng2`: edita lotes só de EMP-A2; `public.registrar_medicao` em EMP-A1 → erro; `public.ratear_despesa` com EMP-A1 → erro.
  5. `eng2` tenta inserir `atribuicoes_papel` como `dono` → erro ("membro não se promove a dono").
  6. Desativar `membros.ativo` → `eng2` não vê nada.
- **Tabelas afetadas:** `convites`, `membros`, `atribuicoes_papel`, `auditoria`.
- **Estado antes / depois:** membro com papel e escopo; depois inativo.
- **Validações financeiras (centavos):** não se aplica.
- **Validações de segurança:** convite guarda só o hash; corretor não vê convites.
- **Invariantes:** INV-012, 013, 018.
- **Critério de aprovação:** escopo respeitado em leitura e escrita.
- **Cobertura:** Coberto parcialmente por `004_papeis_e_convites.test.sql`, `apps/web/e2e/convite.spec.ts`. **NÃO IMPLEMENTADO** envio de convite de equipe por e-mail (só o convite do portal sai por e-mail, D-116; convite de equipe é link copiável, D-023). Cancelamento de convite de equipe: não há função; é feito por `update` de `convites.cancelado_em` sob a política `"dono cancela convites"` e conferido por `public.aceitar_convite` (incluir o passo "convite cancelado é recusado" — hoje Não automatizado).

## FLX-040 — Venda antes do registro do loteamento (RN-C01)

- **Objetivo:** validar D-040 e PL-01.
- **Módulos:** comercial, parâmetros, empreendimentos, auditoria, importação.
- **Pré-condições:** EMP-A2 sem `data_registro`.
- **Dados de teste:** lote B-1; justificativa "Promessa condicionada ao registro, aprovada pelo jurídico".
- **Sequência:**
  1. `corretor1`: `public.reservar_lote(B-1, ...)` → permitido (reserva não é promessa).
  2. `gestor`: `public.vender_lote(B-1, ...)` → erro hint `sem_registro`.
  3. `dona`: `public.definir_parametro(A, 'comercial.permite_venda_sem_registro', 'true', hoje, 'Decisão jurídica', 'empreendimento', EMP-A2)`.
  4. `gestor`: venda com justificativa curta (< 10) → erro; com justificativa → `vendas.justificativa_sem_registro` preenchida; auditoria com o motivo.
  5. Importar carteira em EMP-A2 → venda importada com justificativa "Importada de …" (sem conferir o parâmetro — **ACHADO**: `public.importar_carteira` não aplica RN-C01).
- **Tabelas afetadas:** `reservas`, `vendas`, `lotes`, `parametro_valores`, `auditoria`.
- **Estado antes / depois:** venda registrada com justificativa.
- **Validações financeiras (centavos):** não se aplica além da venda normal.
- **Validações de segurança:** parâmetro só por `parametros.editar`.
- **Invariantes:** INV-005, 013.
- **Critério de aprovação:** sem parâmetro, venda impossível. **VALIDAR COM ADVOGADO** (PL-01).
- **Cobertura:** Coberto parcialmente por `009_comercial.test.sql` ("venda bloqueada sem registro"). Exceção com parâmetro e importação: Não automatizado.

## FLX-041 — Proposta × reserva de outro corretor × aprovação de desconto vencida

- **Objetivo:** cobrir interações entre propostas, reservas e aprovações.
- **Módulos:** propostas, reservas, aprovação de desconto, comercial.
- **Pré-condições:** A-6 reservado por corretor1; limite de desconto 0,05; `comercial.validade_aprovacao_desconto_dias` 7.
- **Dados de teste:** propostas de corretor1 e do gestor.
- **Sequência:**
  1. `corretor2`: `public.criar_proposta(A-6, ...)` → erro; `gestor` → permitido (é gestor).
  2. `gestor`: `public.decidir_proposta(p1, true)`; aceitar outra do mesmo lote → erro (uma aceita por lote); proposta vencida → erro.
  3. `gestor`: `public.solicitar_aprovacao_desconto` com desconto dentro do limite → erro ("não precisa de aprovação"); fora → `pendente`; novo pedido → anterior `cancelada` ("Substituída por novo pedido").
  4. `dona` aprova; simular `valida_ate` passado → `public.vender_lote` não encontra aprovação → erro `desconto_acima_limite`.
  5. `gestor`: `public.cancelar_proposta(p1, 'Cliente desistiu')`; corretor1 cancela a própria reserva (`public.cancelar_reserva`) → lote `disponivel`.
- **Tabelas afetadas:** `propostas`, `reservas`, `aprovacoes_desconto`, `lotes`.
- **Estado antes / depois:** lote livre, sem proposta aceita.
- **Validações financeiras (centavos):** aprovação cobre preço igual ou maior que o aprovado, nunca menor.
- **Validações de segurança:** corretor não aceita a própria proposta; não vê propostas de outro.
- **Invariantes:** INV-006, 012, 013.
- **Critério de aprovação:** uma aceita por lote (`propostas_aceita_por_lote_idx`) e um pedido pendente por lote (`aprovacoes_desconto_pendente_idx`).
- **Cobertura:** Coberto parcialmente por `030_propostas.test.sql`, `028_tabela_precos.test.sql`.

## FLX-042 — Reajuste com cobrança pendente → aviso divergente → baixa manual

- **Objetivo:** expor a interação reajuste × cobrança já emitida.
- **Módulos:** reajuste, cobrança Asaas, carteira.
- **Pré-condições:** cobrança pendente emitida na parcela 13 (225.000) antes do aniversário; índices publicados com fator 1,045.
- **Dados de teste:** parcela 13 de Joana.
- **Sequência:**
  1. `public.executar_reajustes(hoje)` → parcela 13 passa a 235.125; `cobrancas.valor_centavos` continua 225.000 (o reajuste não consulta cobranças).
  2. Joana paga o boleto de 225.000; aviso → `'divergente'` (saldo da parcela ≠ valor da cobrança).
  3. `fin`: `public.registrar_recebimento(p13, data, 225000)` → baixa parcial; saldo 10.125 em aberto; nova cobrança pela diferença com `public.gerar_cobranca(p13)` (a divergente não é `pendente`).
- **Tabelas afetadas:** `reajustes`, `parcelas`, `cobrancas`, `recebimentos`.
- **Estado antes / depois:** cobrança `divergente`; parcela `aberta` com 10.125.
- **Validações financeiras (centavos):** 235.125 − 225.000 = 10.125.
- **Validações de segurança:** padrão.
- **Invariantes:** INV-003, 007, 008.
- **Critério de aprovação:** a divergência é visível e resolvível sem recebimento duplicado. **ACHADO** não documentado (D-049 não trata cobranças emitidas).
- **Cobertura:** Não automatizado.

## FLX-043 — Distrato com crédito em aberto, cobrança pendente e parcela paga

- **Objetivo:** cobrir bloqueios e sobras do distrato.
- **Módulos:** distrato, créditos, cobrança, devoluções, portal.
- **Pré-condições:** contrato de Joana com crédito de 50.000 não usado e cobrança pendente na parcela 9 (de qualquer situação).
- **Dados de teste:** devolução calculada 400.000 em 4 parcelas de 100.000.
- **Sequência:**
  1. `public.executar_distrato` → erro hint `cobranca_pendente` (a função confere qualquer cobrança `pendente` do contrato, mesmo de parcela já paga).
  2. Cancelar a cobrança; parcelas da devolução somando 399.999 → erro hint `devolucao_inconsistente`; parcela com valor 0 → erro.
  3. Executar o distrato → contrato `distratado`.
  4. Crédito de 50.000 continua com saldo; `public.aplicar_credito` → erro (`privado.baixar_parcela`: parcela não está em aberto); `public.devolver_credito(cr, hoje, 50000)` → aceito.
  5. `public.estornar_recebimento` de um pagamento antigo → erro ("O contrato não aceita estorno nesta situação.").
- **Tabelas afetadas:** `distratos`, `devolucoes`, `parcelas`, `contratos`, `vendas`, `lotes`, `usos_credito`.
- **Estado antes / depois:** crédito devolvido; distrato concluído.
- **Validações financeiras (centavos):** devolução ≥ 0, em parcelas positivas, Σ = `devolucao_centavos`. **HIPÓTESE:** o crédito em aberto não é considerado no cálculo do distrato; deve ser devolvido à parte.
- **Validações de segurança:** distrato por `venda.registrar` ou `carteira.receber`; pagar devolução só `carteira.receber`.
- **Invariantes:** INV-009, 014, 020.
- **Critério de aprovação:** nenhum valor do comprador fica sem destino após o distrato.
- **Cobertura:** Não automatizado. **NÃO IMPLEMENTADO**: cancelamento/estorno de distrato e estorno de pagamento de devolução (`devolucoes.pago_em` não tem função de reversão).

## FLX-044 — Consistência entre painel consolidado, carteira, sócios e contabilidade

- **Objetivo:** provar RN-F01/RN-F10 (um número só em todas as telas).
- **Módulos:** painel consolidado, carteira, custos, distrato, sócios, contabilidade, assistente (ferramentas de leitura).
- **Pré-condições:** massa dos fluxos 001, 002, 010 e 018 aplicada.
- **Dados de teste:** mês corrente.
- **Sequência:**
  1. `public.painel_consolidado(A)` → recebido, vencido, carteira, custos pagos, devoluções por empreendimento.
  2. Somar `recebimentos` não estornados, `pagamentos` não estornados, `devolucoes` com `pago_em` → iguais ao painel.
  3. `public.eventos_contabeis` no mesmo período → caixa = recebimentos − devoluções − custos pagos.
  4. Assistente (D-090) responde "quanto recebi este mês" → mesmo valor (conferência de números, D-091).
- **Tabelas afetadas:** leitura.
- **Estado antes / depois:** sem escrita.
- **Validações financeiras (centavos):** VGV vendido nunca somado ao caixa; igualdade ao centavo entre as quatro fontes.
- **Validações de segurança:** corretor não vê o consolidado; o assistente usa o cliente do usuário (RLS).
- **Invariantes:** INV-009, 012, 018.
- **Critério de aprovação:** diferença zero.
- **Cobertura:** Coberto parcialmente por `019_painel_consolidado.test.sql` (inclui carga de 3.000 lotes / < 2 s), `packages/integracoes/src/assistente.test.ts`. Comparação cruzada: Não automatizado.

## FLX-045 — Portais do sócio e do permutante: convite, extrato e isolamento

- **Objetivo:** validar RN-S03, RN-T05, D-070, D-073.
- **Módulos:** portais, sócios, permutas, convites, projeção (`apurarRepasses`).
- **Pré-condições:** Ana sócia em SPE-1 (não em SPE-2); Rui permutante de EMP-A1.
- **Dados de teste:** convites para `ana@exemplo.test` e `rui@exemplo.test`.
- **Sequência:**
  1. `fin`: `public.criar_convite_portal(A, 'socio', Ana, ...)` → erro (só `socios.gerenciar`); `dona` → ok.
  2. `fin`: `public.criar_convite_portal(A, 'permutante', Rui, ...)` → ok (`permutas.gerenciar`).
  3. Ana e Rui aceitam; `public.meu_portal()` → Ana só SPE-1; Rui só as permutas dele.
  4. Rui: `public.eventos_permuta(pf)` → vendas, recebimentos e devoluções do empreendimento, sem dados pessoais de compradores (**HIPÓTESE** — conferir o conteúdo do JSON).
  5. Joana: `public.eventos_permuta(pf)` → erro.
- **Tabelas afetadas:** `convites_portal`, `socios`, `permutantes`.
- **Estado antes / depois:** usuários vinculados.
- **Validações financeiras (centavos):** extrato do permutante = extrato da gestão.
- **Validações de segurança:** nenhuma tabela interna com política para portais.
- **Invariantes:** INV-012, 018.
- **Critério de aprovação:** cada portal só o que é do usuário.
- **Cobertura:** Coberto parcialmente por `020_portais.test.sql` ("permutante e sócio veem suas permutas e sociedades", "compradora não vê o extrato do permutante").

---

## Resumo

- **Fluxos:** 45 (FLX-001 a FLX-045).
- **Funcionalidades constatadas como NÃO IMPLEMENTADAS:** cancelamento de aditivo; cancelamento/estorno de distrato; estorno de pagamento de devolução; estorno de devolução de crédito; encerramento de permuta e devolução de lote permutado; registro, pagamento e consulta de comissão (inclusive a visão do corretor prevista em RN-C07); liberação de funcionalidades por plano (`privado.tem_funcionalidade` sem uso); cancelamento de rateio como um todo; envio de convite de equipe por e-mail; aviso de alertas por e-mail/WhatsApp; WhatsApp; assinatura eletrônica; leiautes contábeis específicos; situação `cedido` nunca gravada.
- **Achados de comportamento a confirmar com o dono do produto:** ver os itens marcados **ACHADO** (FLX-002, 004, 005, 006, 007, 009, 013, 017, 019, 025, 029, 030, 037, 040, 042).
