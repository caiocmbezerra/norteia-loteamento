# Fase 6 — Distrato, permutas, sócios e painéis: situação

## Feito (6a — distrato)

- Simulação do distrato no contrato: pagos corrigidos pelo índice, cláusula penal, fruição pela posse, encargos moratórios, comissão e outros débitos; regras do cliente ajustáveis por contrato.
- Execução: parcelas canceladas, venda distratada, lote de volta ao estoque, devolução parcelada com registro de pagamento.
- Fluxo atual: devolução como saída; a venda distratada sai do VGV e o lote volta ao estoque projetado.

## Feito (6b — permutas)

- Permuta física: lotes do permutante saem do estoque; valor econômico gerencial.
- Permuta financeira: percentual sobre o recebido, a amortização ou o VGV; extrato apurado dos fatos, repasses registrados e estornáveis; saldo a repassar no fluxo atual.

## Feito (6c — sócios)

- SPE → sócios, participações com vigência, aportes, mútuos, devoluções e distribuições.
- Resultado da SPE rateado pela participação vigente em cada mês; retorno (TIR) por sócio sobre os movimentos realizados.

## Feito (6d — painéis)

- Painel consolidado na página inicial: totais da loteadora e tabela por empreendimento e SPE (vendidos, recebido, carteira, vencido, TIR do plano).
- Simulação de cessão de carteira na carteira de cada empreendimento.
- Já existentes: plano × atual (TIR, VPL, exposição, necessidade de aporte) e estresse por empreendimento; resultado por SPE e por sócio.

## Critérios

| Critério                                                               | Situação                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Distrato bate com cálculo independente                                 | ✅ motor (`distrato.test.ts`); cenário oficial a definir com o advogado de cada cliente |
| Soma dos resultados por sócio = resultado da SPE                       | ✅ propriedade em `socios.test.ts`                                                      |
| Painel consolidado de 10 empreendimentos e 3.000 lotes em menos de 2 s | ✅ `019_painel_consolidado.test.sql`                                                    |

## Pendente

- Portal do permutante (Fase 7): extrato somente leitura com login próprio.
- Portal do sócio (Fase 7): a RLS já restringe cada sócio aos próprios dados.
