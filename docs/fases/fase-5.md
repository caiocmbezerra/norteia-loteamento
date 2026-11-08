# Fase 5 — Contratos e carteira: situação

## Feito (5a)

- Contrato gerado na venda (ou depois, pela carteira), com índice de reajuste escolhido e parcelas calculadas pelo motor (entrada + Price/SAC, centavos exatos).
- Multa e juros de mora fixados no contrato a partir dos parâmetros vigentes (padrão provisório 2% + 1% a.m. — PL-04).
- Recebimento manual com cálculo ao vivo dos encargos, desconto, baixa parcial, idempotência por referência e estorno com motivo.
- Quitação automática quando não há parcelas em aberto.
- Painel da carteira: saldo a receber, vencido, recebido no mês, faixas de atraso e contratos em atraso.
- Fluxo atual (TIR, exposição) passa a usar o recebido real e o saldo da carteira.

## Critérios

| Critério                                               | Situação                                           |
| ------------------------------------------------------ | -------------------------------------------------- |
| Entrada + amortizações = preço, em centavos            | ✅ motor (teste) e banco (`criar_contrato` recusa) |
| Mesmo aviso de pagamento não baixa duas vezes (RN-K05) | ✅ pgTAP 010                                       |
| Pagamento a menor mantém saldo em aberto (RN-K06)      | ✅ pgTAP 010                                       |
| Quitação só com saldo zero (RN-K09)                    | ✅ pgTAP 010; estorno reabre                       |
| Recebimento com encargos em até 2 toques no celular    | ✅ e2e/carteira.spec.ts (Pixel 7)                  |

## Pendente

- **5b:** reajuste anual por índice publicado (RN-K03) com importação do BCB/SGS; boleto/Pix pelo Asaas (sandbox) com webhook e conciliação idempotente; crédito por pagamento a maior.
- **5c:** régua de cobrança (e-mail/WhatsApp, opt-out — RN-K10), renegociação e antecipação por aditivo (RN-K07, RN-K08), cessão, termo de quitação, modelos de contrato e assinatura eletrônica (PL-06).
