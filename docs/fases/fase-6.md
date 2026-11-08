# Fase 6 — Distrato, permutas, sócios e painéis: situação

## Feito (6a — distrato)

- Simulação do distrato no contrato: pagos corrigidos pelo índice, cláusula penal, fruição pela posse, encargos moratórios, comissão e outros débitos; regras do cliente ajustáveis por contrato.
- Execução: parcelas canceladas, venda distratada, lote de volta ao estoque, devolução parcelada com registro de pagamento.
- Fluxo atual: devolução como saída; a venda distratada sai do VGV e o lote volta ao estoque projetado.

## Feito (6b — permutas)

- Permuta física: lotes do permutante saem do estoque; valor econômico gerencial.
- Permuta financeira: percentual sobre o recebido, a amortização ou o VGV; extrato apurado dos fatos, repasses registrados e estornáveis; saldo a repassar no fluxo atual.

## Critérios

| Critério                                                               | Situação                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Distrato bate com cálculo independente                                 | ✅ motor (`distrato.test.ts`); cenário oficial a definir com o advogado de cada cliente |
| Soma dos resultados por sócio = resultado da SPE                       | ⏳ 6c                                                                                   |
| Painel consolidado de 10 empreendimentos e 3.000 lotes em menos de 2 s | ⏳ 6d                                                                                   |

## Pendente

- Portal do permutante (Fase 7): extrato somente leitura com login próprio.
- **6c:** sócios, participações com vigência, aportes, mútuos, distribuições e retorno por sócio.
- **6d:** painéis por empreendimento, SPE, sócio e consolidado.
