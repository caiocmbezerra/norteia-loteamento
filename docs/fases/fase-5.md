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

## Feito (5c-1)

- Renegociação por aditivo com prévia do novo plano, encargos incorporados opcionalmente e histórico das parcelas substituídas (RN-K07).
- Antecipação de parcelas a vencer com desconto dos juros não decorridos (RN-K08); quitação antecipada.
- Termo de quitação para imprimir/PDF (texto-modelo, PL-17).

## Feito (5c-3a)

- Cessão do contrato a outro comprador por aditivo (adimplência exigida conforme parâmetro do cliente).
- Troca de lote por aditivo, com a diferença de preço no novo plano e o lote anterior de volta ao estoque.

## Feito (5c-3b)

- Modelos de documentos em Word por cliente (Configurações → Modelos de documentos): contrato, termo de quitação e aditivos; baixar, editar no Word, enviar (conferido) e voltar ao padrão.
- Contrato, termo e aditivos baixados em Word já preenchidos, na página do contrato.

## Critérios

| Critério                                                               | Situação                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Entrada + amortizações = preço, em centavos                            | ✅ motor (teste) e banco (`criar_contrato` recusa)   |
| Mesmo aviso de pagamento não baixa duas vezes (RN-K05)                 | ✅ pgTAP 010                                         |
| Pagamento a menor mantém saldo em aberto (RN-K06)                      | ✅ pgTAP 010                                         |
| Quitação só com saldo zero (RN-K09)                                    | ✅ pgTAP 010; estorno reabre                         |
| Reajuste de 1.000 contratos por rotina idempotente, com auditoria      | ✅ pgTAP 011                                         |
| Webhook duplicado não gera baixa dupla                                 | ✅ pgTAP 012 (API simulada)                          |
| Ciclo venda → cobrança → pagamento → baixa → fluxo no sandbox do Asaas | ✅ em produção, 11 e 12/11/2026 (em dia e em atraso) |
| Recebimento com encargos em até 2 toques no celular                    | ✅ e2e/carteira.spec.ts (Pixel 7)                    |

## Feito depois

- Crédito por pagamento a maior (D-114): saldo a favor no contrato; a loteadora aplica numa parcela em aberto ou devolve. O comprador vê o saldo no portal.

## Pendente

- **5c-2:** régua de cobrança (e-mail/WhatsApp, opt-out — RN-K10), com envio dos links do Asaas.
- Assinatura eletrônica dos documentos (Clicksign/D4Sign — PL-06), quando o cliente tiver conta.
