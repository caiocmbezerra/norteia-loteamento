# Fase 3 — Custos e obra: situação

## Feito (PR desta fase)

- Plano de contas por cliente, com o padrão de loteamento (16 centros, subcentros de infraestrutura), criado automaticamente.
- Orçamento revisado (copiado do plano aprovado e editável); orçamento original congelado no plano.
- Fornecedores, contratos de empreitada, contas a pagar (de contrato ou avulsas), pagamentos e estornos.
- Projeção de custos (realizado, comprometido, projetado) alimentando o motor — 100% de cobertura, invariante RN-F03 testado.
- Tela de custos: orçado, pago, contratado, a contratar e custo final por centro; desvio; TIR e exposição do plano × atual; custo por lote e por m².
- Testes: 9 arquivos pgTAP; projeção 12 testes; ponta a ponta do ciclo contrato → medição → pagamento → estorno.

## Critérios

| Critério                                                     | Situação                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Orçado = realizado + comprometido + projetado em cada centro | ✅ teste de propriedade na projeção e conferência na tela (e2e)                    |
| Lançar pagamento atualiza TIR e exposição em menos de 5 s    | ✅ cálculo sob demanda, sem cache: a tela já mostra o novo valor no recarregamento |

## Feito depois

- Anexo de notas, boletos e recibos às contas a pagar (D-102): o arquivo lido no lançamento fica anexado; dá para anexar depois; abre por link assinado curto.

- Medições por percentual acumulado executado (D-103): o banco calcula o valor da diferença para o acumulado anterior e cria a conta a pagar; a soma das medições fecha exatamente com o valor do contrato; barra de execução por contrato.

## Pendente

- Rateio de despesas comuns entre empreendimentos.
- Telas para criar centros de custo próprios, encerrar contrato e cancelar conta (o banco já suporta).
