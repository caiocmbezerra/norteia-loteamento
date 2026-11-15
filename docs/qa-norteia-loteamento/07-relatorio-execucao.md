# QA — Relatório de execução

> **Data:** 15/11/2026, 02h às 05h (America/Sao_Paulo).
> **Código:** `main` em `5554111`, mais os arquivos de teste desta auditoria (branch `qa/auditoria-suite`).
> **Ambiente de escrita:** Supabase CLI local (`127.0.0.1:54322`, contêiner `supabase_db_norteia-loteamento`, PostgreSQL 17), migrations até `20261115090000`, igual à produção.
> **Produção** (`krmfljdyzuiipfsfpqvn`): só SELECT de invariantes e introspecção.
> **Salvaguardas:**
>
> - os scripts de escrita recusam bancos que não sejam o contêiner local;
> - os testes pgTAP rodam em `begin … rollback`;
> - só há dados sintéticos (`@exemplo.test`);
> - não foi usada nenhuma chave real (Asaas, Resend, Anthropic).
>
> **Classificação da suíte: PARCIAL** (ver §6). Nada foi corrigido no produto. Os achados estão documentados com evidência, reprodução e recomendação, e aguardam decisão do dono do produto.

## 1. Resumo

| Suíte                                             | Ferramenta                        | Arquivos              | Casos                                     | Resultado                                                |
| ------------------------------------------------- | --------------------------------- | --------------------- | ----------------------------------------- | -------------------------------------------------------- |
| Unidade (pacotes e web)                           | Vitest 5.1                        | 31                    | 274 (233 existentes + 41 novos)           | PASSOU (motor com 100% de cobertura)                     |
| Oráculo matemático independente (novo)            | Vitest                            | 1                     | 41 (≈ 1.000 planos e 3.500 datas gerados) | PASSOU; teste de mutação: 6 falhas com `ROUND_HALF_UP`   |
| Banco, linha de base                              | pgTAP                             | 46                    | 514                                       | PASSOU                                                   |
| Isolamento por RPC e matriz de papéis (novo, 046) | pgTAP                             | 1                     | 28                                        | PASSOU                                                   |
| Achados e salvaguardas (novo, 047)                | pgTAP                             | 1                     | 24 (13 `todo`)                            | 11 PASSARAM e **13 FALHARAM** (achados conhecidos)       |
| Invariantes após ciclo completo (novo, 048)       | pgTAP                             | 1                     | 3                                         | PASSOU                                                   |
| Concorrência real (novo)                          | `scripts/qa/concorrencia.sh`      | 10 cenários × 10      | 100 corridas                              | 90 PASSARAM e **10 FALHARAM** (CONC-008)                 |
| Carga sintética (novo)                            | `scripts/qa/carga.sh`             | 14 medições           | —                                         | **4 acima do tempo limite de 8 s** (ver §4)              |
| Invariantes em produção (somente leitura)         | SQL                               | 22                    | —                                         | 21 sem violação; INV-026 = 18 (demonstração)             |
| E2E + acessibilidade (regressão)                  | Playwright 1.65 + axe             | 32 specs × 2 projetos | 82                                        | **79 PASSARAM**, 3 pulados (pulos condicionais da suíte) |
| Qualidade                                         | prettier, eslint, fronteiras, tsc | —                     | —                                         | PASSOU                                                   |

## 2. Achados

**Severidade:**

- **CRÍTICA:** nenhum achado confirmado.
- **ALTA:** A-01, A-02, A-06, A-08, A-09, A-11, A-12 e A-13.
- **MÉDIA:** A-03, A-04, A-05, A-07 e A-10.
- **BAIXA:** B-01 a B-04.

### A-01 (ALTA) — `criar_contrato` não confere o plano com a venda — **CORRIGIDO** (migration `20261115120000`, D-121)

- **Evidência:** `047` (CON-BANCO-101, 102), FALHOU como esperado. Uma venda Price a 1% a.m. em 2× recebeu um contrato com parcelas **sem juros** e outro com **vencimentos em 2099**, e ambos foram gravados.
- **Reprodução:** com `venda.registrar`, chamar `rpc/criar_contrato` direto pelo PostgREST com parcelas cuja soma das amortizações é igual ao preço.
- **Causa:** a função confere só a soma das amortizações, a entrada, a quantidade e a faixa de números (`00-auditoria` §2).
- **Impacto:** a regra RN-K01 ("plano gerado pelo motor") vale só no app. Extrato, DIMOB, informe de IR e distrato herdam o plano gravado.
- **Recomendação:** recalcular o plano no banco (Price/SAC em `numeric`, espelhando o motor e testado contra `oraculo.test.ts`) ou conferir cada parcela com uma tolerância de 0 centavo.

### A-02 (ALTA) — multa e juros de mora informados livremente no recebimento — **CONFIGURÁVEL POR LOTEADORA** (migration `20261115130000`, D-122)

- **Evidência:** `047` (REC-BANCO-107, 108). Uma multa de R$ 5.000,00 sobre R$ 1.000,00 pagos **no dia do vencimento** foi gravada. Também foi aceita uma multa acima do percentual do contrato (1,5%).
- **Impacto:** encargos fora da RN-K04 e da D-045 entram na DIMOB (que soma encargos por padrão), no informe de IR e no distrato (dedução de encargos).
- **Recomendação:** calcular multa e juros no banco a partir de `contratos.multa_atraso`/`juros_mora_mensal` e dos dias de atraso. Uma dispensa, quando houver, entra como desconto com motivo.

### A-03 (MÉDIA) — recebimento datado antes da venda é aceito — **CONFIGURÁVEL POR LOTEADORA** (`carteira.pagamento_antes_venda_dias`, migration `20261115130000`, D-122)

- **Evidência:** `047` (REC-BANCO-109): pagamento em 01/01/2020 numa venda de 01/02/2026.
- **Recomendação:** recusar `data_pagamento < vendas.data_venda`.

### A-04 (MÉDIA, regra a confirmar) — desconto no recebimento sem limite nem alçada — **CONFIGURÁVEL POR LOTEADORA** (migration `20261115130000`, D-122)

- **Evidência:** `047` (REC-BANCO-110): desconto de R$ 999,99 sobre R$ 1.000,00, sem aprovação.
- **Pendência:** a regra não está documentada. O DP precisa definir o limite ou a alçada (análogo ao `comercial.desconto_maximo_sem_aprovacao`).

### A-05 (MÉDIA, regra a confirmar) — condições de venda sem plausibilidade — **CONFIGURÁVEL POR LOTEADORA** (migration `20261115130000`, D-122)

- **Evidência:** `047` (VEN-BANCO-101…103). O banco aceitou:
  - juros de **50% a.m.** em 480×;
  - 1ª parcela **antes** da venda;
  - venda datada **+400 dias**.
- **Pendência:** o DP define os limites.

### A-06 (ALTA) — status "permuta" do lote editável direto — **CORRIGIDO** (migration `20261115100000`, D-119)

> **Correção aplicada:** sair de `permuta` passou a ser recusado enquanto o lote estiver numa permuta física vigente. A marcação manual de "permuta" no cadastro, sem contrato, foi **mantida**: é uma funcionalidade do cadastro inicial e tem e2e próprio (`cadastro-inicial.spec.ts`). A demonstração passou a criar a permuta física de verdade.

- **Evidência:** `047` (LOT-BANCO-101, 102). O lote de uma **permuta física vigente** voltou a `disponivel` por `update` e foi **vendido**. Um lote também foi marcado `permuta` sem contrato de permuta.
- **Confirmação nos dados:** a invariante INV-026 acusa 36 lotes no banco local e **18 em produção**: os lotes da demonstração, que a carga do caso de referência grava com `update … status = 'permuta'` (`packages/aplicacao/src/viabilidade.ts:248`).
- **Causa:** `privado.validar_status_lote` protege só `reservado`/`vendido`.
- **Impacto:** RN-T01 e RN-C04 ("permuta é fixo"); risco de vender o lote prometido ao dono da terra. A tela não oferece essa troca, então o risco vem de chamada direta à API (papéis com `empreendimento.editar`: dono, engenharia e comercial_gestor).
- **Recomendação:** tratar `permuta` como `reservado`/`vendido` no gatilho. A demonstração passaria a criar uma permuta física de verdade.

### A-07 (MÉDIA, decisão de produto) — resíduo de arredondamento concentrado na última parcela

- **Evidência:** `oraculo.test.ts` (MOT-UNID-113). A soma fecha em centavos (RN-K02 cumprida), mas o resíduo capitaliza:
  - 2% a.m. em 480× sobre R$ 90.000,00: prestação R$ 1.800,13 e **última R$ 4.307,84**;
  - 5% a.m. em 480×: a amortização mensal fica em 0 e **todo o principal vai para a última parcela**;
  - em condições usuais (0,5–1% a.m., até 240×), a diferença ficou dentro do limite teórico (MOT-UNID-112).
- **Recomendação:** junto com o A-05, limitar taxa e prazo; ou redistribuir o resíduo (decisão do DP).

### A-08 (ALTA) — o cliente troca o próprio plano — **CORRIGIDO** (migration `20261115100000`, D-119)

- **Evidência:** `047` (TEN-SEG-101). O dono passou de Essencial (200 lotes) para **Empresarial (sem limite)** com `update tenants set plano_id = 'empresarial'`. Isso também foi reproduzido manualmente no banco local.
- **Causa:** a política `UPDATE` de `tenants` (tenant.administrar) não restringe colunas, e `authenticated` tem `UPDATE` em `plano_id`.
- **Impacto:** RN-G07 e INV-019; perda de receita.
- **Recomendação:** `revoke update (plano_id) on tenants from authenticated`, ou um gatilho que só permita a troca pela plataforma.

### A-09 (ALTA) — corrida em `definir_participacao` — **CORRIGIDO** (migration `20261115100000`, D-119; CONC-008 passou 5/5 depois da correção)

- **Evidência:** `concorrencia.sh`, CONC-008 **falhou em 10 de 10** corridas. Com um sócio em 20% desde 01/07/2026, duas sessões simultâneas definiram outros dois sócios em 50%, e a soma ficou em **120%** nessa data. O banco local guarda as 11 ocorrências (INV-010 = 11).
- **Em sequência**, o mesmo caso é recusado (`018_socios`).
- **Causa:** a soma é conferida antes de inserir, sem trava por SPE; a exclusão GiST é por sócio, não por SPE.
- **Impacto:** o rateio de resultado (RN-S01) e o portal do sócio ficam errados.
- **Recomendação:** `perform pg_advisory_xact_lock(hashtextextended('participacao:' || p_spe, 0))` ou `select … for update` na SPE antes de conferir, como já é feito em `verificar_limite_lotes`.

### A-10 (MÉDIA) — nova baixa com a referência de um recebimento estornado some em silêncio — **CORRIGIDO** (migration `20261115120000`, D-121)

- **Evidência:** `047` (REC-BANCO-111). Depois do estorno, `registrar_recebimento(…, p_referencia => 'aviso-77')` devolve o id do recebimento **estornado**, sem erro, e a parcela continua em aberto.
- **Impacto:** quem chamou acredita que baixou. No Asaas, um pagamento estornado e refeito com o mesmo id seria ignorado.
- **Recomendação:** quando o recebimento da referência estiver estornado, recusar com mensagem clara ou registrar um novo com sufixo.

### A-11 (ALTA, desempenho) — consulta de recebimentos com RLS aninhada — **CORRIGIDO** (migration `20261115110000`, D-120)

- **Evidência:** CAR-006 com p50 de **14,25 s**. A consulta da tela da carteira (`packages/aplicacao/src/carteira.ts:490`, recebimentos do mês por empreendimento) foi **cancelada pelo tempo limite de 8 s** do papel `authenticated`. O volume era de 3.000 contratos, 201.000 parcelas e 56.750 recebimentos.
- **Plano de execução:** a política de `recebimentos` faz `EXISTS (parcelas ⨝ contratos … privado.pode())`. A RLS de `parcelas` é aplicada outra vez dentro do EXISTS, o que dá 201.000 avaliações de `privado.pode`; não há índice por `data_pagamento`.
- **Recomendação:**
  - política de `recebimentos` por função SECURITY DEFINER estável que receba `parcela_id` e leia `contratos` sem RLS, ou `empreendimento_id` denormalizado em `recebimentos`;
  - índice `(tenant_id, data_pagamento)`;
  - medir de novo com `carga.sh`.

### A-12 (ALTA, desempenho) — `inadimplencia_historico` não escala — **CORRIGIDO** (migration `20261115110000`, D-120)

- **Evidência:** CAR-009 com **mais de 180 s**, mesmo com uma única data (cancelado). Afeta os alertas de inadimplência (D-093) e o gráfico da carteira.
- **Plano:** `Seq Scan on recebimentos` para cada parcela (subconsulta lateral por `parcela_id`). Os índices existentes começam por `tenant_id`, `(tenant_id, parcela_id)`, e não servem para um filtro só por `parcela_id`.
- **Recomendação:** índice `recebimentos (parcela_id) where estornado_em is null` ou incluir `r.tenant_id = p.tenant_id` na subconsulta; agregar os recebimentos uma vez por data.

### A-13 (ALTA, desempenho) — `dados_dimob` com 3.000 contratos — **CORRIGIDO** (migration `20261115110000`, D-120)

- **Evidência:** CAR-011 com **28,7 s**, acima do limite de 8 s.
- **Impacto:** a geração da DIMOB anual falharia num cliente desse porte.
- **Causa provável:** a mesma do A-12 (recebimentos sem índice por parcela). **A confirmar** com EXPLAIN.

### Baixa severidade (registro)

- **B-01:** `modelos_documento` não tem gatilho de auditoria (as escritas só ocorrem por `publicar_modelo` e `usar_modelo_padrao`).
- **B-02:** `vendas.importacao_id` é a única FK sem `tenant_id`. Hoje ela é coberta pela função e pela INV-012.
- **B-03:** a política `remover anexos de contas` (DELETE) contradiz a D-102.
- **B-04:** `descadastrar_lembretes(token)` devolve o nome da loteadora a quem tem o token (é capacidade por desenho; o token é o link do e-mail).

## 3. Segurança e isolamento: o que passou (evidência)

- **046, SEG-RPC-001…017.** Foram chamadas as 73 funções executáveis por `authenticated` (todas menos o descadastro por token, testado à parte), com **ids reais** de tenant, contrato, parcela, recebimento, crédito, venda, lote, proposta, reserva, sócio, permuta e repasse da loteadora A. Os chamadores foram:
  - a dona da loteadora B;
  - um usuário sem loteadora;
  - o anônimo.
- **Resultado:**
  - só executaram funções neutras, que leem os próprios dados ou são públicas;
  - nenhum retorno trouxe id ou nome de A;
  - todas as recusas foram de permissão (42501) ou validação;
  - a **impressão digital (md5 por tabela) das 66 tabelas de A** ficou idêntica depois de mais de 200 chamadas.
- **046, SEG-RPC-018…024: matriz papel × função**, que vira regressão de permissões:
  - corretor: só `criar_proposta` (RN-C07);
  - contador e sócio: só leitura;
  - engenharia: nada de carteira;
  - gestor comercial: vende, mas não recebe;
  - financeiro: recebe e estorna, mas não vende.
- **046, SEG-RPC-025…028:** quem é dona das duas loteadoras não move registro entre elas. O `tenant_id` é imutável, a FK composta recusa o comprador de A numa venda em B, e não há rateio entre loteadoras.
- **Segredos:** nenhum segredo real no repositório; a chave do Asaas está no Vault e o token do webhook é guardado como hash.

## 4. Carga (banco local, papel `authenticated` com RLS)

Volume: 5.000 lotes, 3.000 contratos, 201.000 parcelas, 56.750 recebimentos e cerca de 287.000 linhas de auditoria. Preparação: 5.000 lotes em 0,8 s; 10 importações de 300 contratos em 47,3 s (≈ 4,7 s por arquivo).

| ID      | Operação                                                 | p50                         | p95           | Situação          |
| ------- | -------------------------------------------------------- | --------------------------- | ------------- | ----------------- |
| CAR-001 | Lista de lotes (50)                                      | 1,9 ms                      | 6,5 ms        | OK                |
| CAR-002 | Busca de lote                                            | 2,2 ms                      | 6,8 ms        | OK                |
| CAR-003 | Mapa completo (5.000 lotes)                              | 169 ms                      | 175 ms        | OK                |
| CAR-004 | Parcelas vencidas em aberto                              | 228 ms                      | 299 ms        | OK                |
| CAR-005 | Saldo a receber por contrato                             | 355 ms                      | 387 ms        | OK                |
| CAR-006 | Recebimentos do mês                                      | **14.252 ms**               | **14.823 ms** | **FALHOU (A-11)** |
| CAR-007 | Extrato de um contrato                                   | 7,8 ms                      | 14,7 ms       | OK                |
| CAR-008 | `painel_consolidado`                                     | 184 ms                      | 204 ms        | OK                |
| CAR-009 | `inadimplencia_historico` (1 data)                       | **> 180 s**                 | —             | **FALHOU (A-12)** |
| CAR-010 | `eventos_contabeis` do ano                               | 470 ms                      | —             | OK                |
| CAR-011 | `dados_dimob`                                            | **28,7 s**                  | —             | **FALHOU (A-13)** |
| CAR-012 | `registrar_recebimento` (50 baixas)                      | 0,6 ms                      | 1,5 ms        | OK                |
| CAR-013 | Invariantes no banco inteiro                             | ~1 s                        | —             | OK                |
| CAR-014 | Consulta da tela da carteira (recebimentos do mês, join) | **14,7 s, cancelada a 8 s** | —             | **FALHOU (A-11)** |

**Depois da correção (D-120, mesma massa):** CAR-006 2,1 s; CAR-009 (1 data) 0,6 s, 12 meses ≈ 4,4 s; CAR-011 0,58 s; CAR-014 0,98 s; CAR-012 sem alteração (0,6 ms). Todas abaixo do limite de 8 s.

**Metas sugeridas** (recomendação; o produto não tem requisito formal): leituras de tela com p95 < 1 s e relatórios anuais < 8 s (o tempo limite atual) no volume acima.

## 5. E2E e acessibilidade

A suíte Playwright existente (32 specs, axe-core WCAG 2.1 A/AA, D-097) foi executada como regressão no fim desta auditoria. O resultado está em §5.1. **Nenhum teste e2e novo** foi criado: a tela a 375 px e o duplo clique em operação financeira estão nas lacunas (`08-lacunas.md`).

### 5.1 Resultado

Execução de 15/11/2026, depois de `supabase db reset`: **79 passaram, 3 foram pulados e 0 falharam** (2,7 min; projetos `celular` e `desktop`). Com a mesma base, o pgTAP passou com 49 arquivos e 569 asserções (13 `todo`), `db lint` não acusou erros e Vitest, prettier, eslint, fronteiras e tsc passaram.

## 6. Critérios de aprovação da suíte (prompt §27)

| #   | Critério                                   | Situação                                                    |
| --- | ------------------------------------------ | ----------------------------------------------------------- |
| 1   | Sem falha crítica pendente                 | Atendido (nenhuma crítica)                                  |
| 2   | Sem falha alta sem decisão formal          | **Não atendido:** 8 altas aguardam o DP                     |
| 3   | Testes financeiros obrigatórios executados | Atendido (oráculo, 010, 011, 012, 016, 047, 048)            |
| 4   | Segurança com papéis reais                 | Atendido (046: 7 papéis, outro tenant, sem tenant, anônimo) |
| 5   | Nenhum teste essencial ignorado            | Atendido; os bloqueados estão listados em 08                |
| 6   | Fluxos críticos aprovados                  | Parcial: 40 dos 45 com cobertura parcial (04)               |
| 7   | Invariantes financeiras verificadas        | Atendido (teste, local e produção)                          |
| 8   | Integridade entre tenants comprovada       | Atendido                                                    |
| 9   | Concorrência executada                     | Atendido; 1 falha (A-09)                                    |
| 10  | Regressão essencial aprovada               | Atendido (§5.1)                                             |
| 11  | Falhas restantes documentadas              | Atendido                                                    |
| 12  | Limitações explicitadas                    | Atendido (08)                                               |
| 13  | Sem alteração não autorizada no produto    | Atendido: só arquivos de teste, scripts e docs              |

**Classificação: PARCIAL.** Há falhas altas abertas, a fonte legal não foi consultada (rede), não houve teste de restauração e os 5 fluxos que dependem de funcionalidade inexistente não foram executados.

## 7. Arquivos gerados

- **Documentação:** `docs/qa-norteia-loteamento/00` a `09` e `README`.
- **Testes:**
  - `packages/motor-financeiro/src/oraculo.test.ts`;
  - `supabase/tests/database/046_qa_isolamento_rpc.test.sql`, `047_qa_achados.test.sql`, `048_qa_invariantes.test.sql`.
- **Auxiliares:** `supabase/tests/auxiliares/qa_cenario.psql` (cenário e varredura), `qa_invariantes.psql` (fonte única das invariantes).
- **Scripts:** `scripts/qa/concorrencia.sh`, `carga.sh`, `invariantes.sh` (com proteção contra banco não local onde há escrita).
- **Evidências locais** (não versionadas, em `test-results/`): `qa-concorrencia.txt`, `qa-carga*.txt`.
