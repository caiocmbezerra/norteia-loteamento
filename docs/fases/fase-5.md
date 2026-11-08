# Fase 5 — Contratos e carteira: situação

## Feito (5a)

- Contrato gerado na venda (ou depois, pela carteira), com índice de reajuste escolhido e parcelas calculadas pelo motor (entrada + Price/SAC, centavos exatos).
- Multa e juros de mora fixados no contrato a partir dos parâmetros vigentes (padrão provisório 2% + 1% a.m. — PL-04).
- Recebimento manual com cálculo ao vivo dos encargos, desconto, baixa parcial, idempotência por referência e estorno com motivo.
- Quitação automática quando não há parcelas em aberto.
- Painel da carteira: saldo a receber, vencido, recebido no mês, faixas de atraso e contratos em atraso.
- Fluxo atual (TIR, exposição) passa a usar o recebido real e o saldo da carteira.

## Feito (5b-1)

- Reajuste anual por índice (RN-K03): rotina diária idempotente, só com índices publicados, deflação ignorada por padrão (PL-03); botão "Aplicar reajustes pendentes" no contrato e histórico de reajustes.
- Importação diária do IPCA e do IGP-M do BCB/SGS; carteira mostra o último mês disponível de cada índice.

## Feito (5b-2)

- Integração com o Asaas da própria loteadora (Configurações → Integrações): chave conferida no Asaas e guardada no Vault; token do webhook mostrado uma vez.
- Boleto + Pix por parcela no contrato, com multa e juros do contrato; cancelamento com motivo.
- Baixa automática pelo webhook (conferindo o pagamento no Asaas) e varredura a cada 6 horas.

## Critérios

| Critério                                                               | Situação                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| Entrada + amortizações = preço, em centavos                            | ✅ motor (teste) e banco (`criar_contrato` recusa) |
| Mesmo aviso de pagamento não baixa duas vezes (RN-K05)                 | ✅ pgTAP 010                                       |
| Pagamento a menor mantém saldo em aberto (RN-K06)                      | ✅ pgTAP 010                                       |
| Quitação só com saldo zero (RN-K09)                                    | ✅ pgTAP 010; estorno reabre                       |
| Reajuste de 1.000 contratos por rotina idempotente, com auditoria      | ✅ pgTAP 011                                       |
| Webhook duplicado não gera baixa dupla                                 | ✅ pgTAP 012 (API simulada)                        |
| Ciclo venda → cobrança → pagamento → baixa → fluxo no sandbox do Asaas | ⏳ depende da chave sandbox do cliente             |
| Recebimento com encargos em até 2 toques no celular                    | ✅ e2e/carteira.spec.ts (Pixel 7)                  |

## Pendente

- Validar no sandbox os campos do pagamento em atraso (`value`, `originalValue`, `interestValue`) — marcado `VALIDAR NO SANDBOX` no código.
- Crédito por pagamento a maior; régua de cobrança com envio automático dos links (5c).
- Conferir o código do INCC no SGS e ativar a série.
- **5c:** régua de cobrança (e-mail/WhatsApp, opt-out — RN-K10), renegociação e antecipação por aditivo (RN-K07, RN-K08), cessão, termo de quitação, modelos de contrato e assinatura eletrônica (PL-06).
