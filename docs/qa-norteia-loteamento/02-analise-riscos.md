# QA — Análise de risco e priorização

> Data: 15/11/2026. Severidade: **CRÍTICA** (erro financeiro, vazamento entre tenants, cobrança indevida, perda de dados), **ALTA** (fluxo principal quebrado, relatório errado, falha de autorização), **MÉDIA** (erro contornável, validação ausente), **BAIXA** (apresentação).
> A "situação identificada" vem dos testes executados (`07-relatorio-execucao.md`). A ordem segue a criticidade **observada**, não só a teórica.

| #   | ID   | Área                                                                                    | Probabilidade            | Gravidade | Prioridade | Situação identificada                                                                                                                                                |
| --- | ---- | --------------------------------------------------------------------------------------- | ------------------------ | --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | R-01 | Isolamento entre tenants (tabelas, RPCs, portal)                                        | Baixa                    | Crítica   | P0         | **Aprovado:** 0 vazamentos em 74 funções × 3 perfis, 66 tabelas e chaves compostas                                                                                   |
| 2   | R-02 | Validação no banco dos valores calculados pelo app (plano, encargos, desconto, datas)   | Média                    | Alta      | P0         | **Falhou:** achados A-01 a A-05 (o banco grava o que o chamador mandar)                                                                                              |
| 3   | R-03 | Concorrência em regras que somam (participações; em geral "verificar e depois inserir") | Média                    | Alta      | P0         | **Falhou:** A-09, 10/10 corridas com 120% de participação                                                                                                            |
| 4   | R-04 | Limites de plano e status protegidos (plano, lote em permuta)                           | Média                    | Alta      | P0         | **Falhou:** A-08 (o cliente troca o próprio plano) e A-06 (lote do permutante volta ao estoque e é vendido)                                                          |
| 5   | R-05 | Desempenho da carteira com volume (RLS aninhada)                                        | Alta em clientes grandes | Alta      | P1         | **Falhou:** A-11, consulta da tela da carteira em 14,7 s com tempo limite de 8 s                                                                                     |
| 6   | R-06 | Cálculo de parcelas, amortização e arredondamento (Price/SAC)                           | Baixa                    | Crítica   | P1         | **Aprovado:** motor = oráculo BigInt em 1.000+ planos; A-07 (resíduo concentrado na última parcela com taxa e prazo altos)                                           |
| 7   | R-07 | Recebimentos, estornos e idempotência                                                   | Baixa                    | Crítica   | P1         | **Aprovado com ressalva:** estorno duplo, saldo e aviso duplicado protegidos, também sob corrida; A-10 (nova baixa após estorno some em silêncio)                    |
| 8   | R-08 | Integração Asaas (webhook, conciliação, divergência)                                    | Média                    | Crítica   | P1         | **Parcial:** token, idempotência e multa/juros testados (012); webhook com erro de consulta só se recupera na varredura de 6 h (regra implícita)                     |
| 9   | R-09 | Distrato e devolução (art. 32-A)                                                        | Média                    | Crítica   | P1         | **Parcial:** cálculo testado (016, 035); a fonte oficial não pôde ser consultada (rede bloqueada); não há reversão de distrato; todos os percentuais pendentes PL-02 |
| 10  | R-10 | Reajuste monetário                                                                      | Baixa                    | Alta      | P2         | **Aprovado:** índice não publicado, repetição, parcela paga e revisão (011); índice negativo "ignorar" não compensa depois (regra implícita, PL-03)                  |
| 11  | R-11 | Integridade de lotes, reservas e vendas                                                 | Baixa                    | Alta      | P2         | **Aprovado:** unicidade sob corrida (CONC-001, 002, 010); exceto o status permuta (A-06)                                                                             |
| 12  | R-12 | Contabilidade e fiscal (eventos, DIMOB, informe)                                        | Média                    | Alta      | P2         | **Parcial:** não há partidas dobradas persistidas; estorno depois da exportação não gera evento de estorno; leiaute DIMOB 2.8g por dado (021)                        |
| 13  | R-13 | Participação societária e permutas (repasse)                                            | Média                    | Alta      | P2         | **Falhou em concorrência** (A-09); repasse é digitado sem conferir o devido (regra implícita D-066)                                                                  |
| 14  | R-14 | Importação de carteira                                                                  | Baixa                    | Alta      | P3         | **Aprovado:** tudo ou nada; carga de 201.000 parcelas em 47 s; reimportação barrada só pelo status do lote                                                           |
| 15  | R-15 | Relatórios e painéis (coerência entre fontes)                                           | Média                    | Média     | P3         | **Parcial:** painel consolidado testado (019); falta conciliação automática entre banco, API, tela e exportação                                                      |

## Detalhamento

### R-01 — Isolamento entre tenants

- **Impacto:** vazamento de dados financeiros e pessoais entre loteadoras (LGPD) e escrita em carteira alheia.
- **Testes necessários:**
  - varredura de todas as RPCs com ids reais de outro tenant;
  - DML direta em todas as tabelas;
  - portal com vínculo de outro comprador;
  - membro de duas loteadoras;
  - anônimo.
- **Critério de aprovação:** zero linhas lidas ou alteradas de outro tenant e impressão digital (hash) dos dados de A igual antes e depois.
- **Situação:** aprovado (001, 020, 046).

### R-02 — Valores calculados pelo app e gravados sem conferência

- **Impacto:** quem tem `carteira.receber` ou `venda.registrar` grava por chamada direta à API (PostgREST, com o próprio JWT):
  - um plano de parcelas que não corresponde à venda;
  - multa e juros de mora fora do contrato;
  - descontos sem alçada;
  - datas impossíveis.
- **Efeitos:** extrato, DIMOB, informe de IR, distrato e contábil herdam esses valores.
- **Probabilidade:** média, porque exige papel interno, mas não exige falha do app. A D-045 já reconhece que encargos "nunca vêm do navegador".
- **Testes necessários:** chamadas RPC diretas com valores incoerentes (047).
- **Critério de aprovação:** o banco recalcula, ou confere com o motor, e recusa com 23514.
- **Situação:** **falhou** (A-01 a A-05).

### R-03 — Concorrência

- **Impacto:**
  - soma de participações acima de 100%, o que distorce o rateio de resultado entre sócios (RN-S01) e o portal do sócio;
  - o mesmo padrão "conferir e depois inserir" sem trava pode existir em outras funções.
- **Testes necessários:** duas sessões reais liberadas por barreira e repetidas 10 vezes (`scripts/qa/concorrencia.sh`).
- **Critério de aprovação:** estado final válido em 10 de 10 corridas.
- **Situação:** 9 cenários aprovados em 10/10 cada; participações **falharam em 10/10**.

### R-04 — Plano e status protegidos

- **Impacto:**
  - A-08, perda de receita: o cliente sai do plano Essencial (200 lotes) para o Empresarial (sem limite) sem contratar;
  - A-06, risco jurídico e financeiro: o lote prometido ao dono da terra é vendido a terceiro com a permuta vigente.
- **Situação:** **falhou**.

### R-05 — Desempenho com volume

- **Impacto:** a tela da carteira de um empreendimento com 3.000 contratos cai no tempo limite de 8 s.
- **Causa:** a política de `recebimentos` faz EXISTS em `parcelas`, que tem RLS própria, com join em `contratos`, e chama `privado.pode` 201 mil vezes. Também não há índice por data de pagamento.
- **Situação:** **falhou** (CAR-006, CAR-014). Recomendação em 07.

### R-06 — Parcelas e amortização

- **Critério de aprovação:**
  - entrada + amortizações = preço, em centavos;
  - saldo final 0;
  - nenhuma amortização negativa;
  - motor idêntico a um oráculo independente.
- **Situação:** aprovado. O A-07 é efeito do método documentado (RN-K02) e depende de decisão do produto.

### R-07 a R-15

Os testes, critérios e a situação de cada um estão no catálogo (`03-catalogo-testes.md`, módulos REC, ASA, DIS, REA, COM, CTB, SOC, PER, IMP, CAR e PAI) e nos fluxos FLX-001 a FLX-045 (`04-fluxos-cruzados.md`).
