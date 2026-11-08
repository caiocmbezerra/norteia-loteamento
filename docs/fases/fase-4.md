# Fase 4 — Comercial: situação

## Feito (4a)

- Compradores (CPF validado), imobiliárias e corretores (comissão no ato ou sobre o recebido, acesso opcional à plataforma).
- Reserva com prazo (parâmetro por empreendimento), cancelamento com motivo, expiração automática.
- Venda com simulador de parcelas ao vivo (o mesmo motor do fluxo), bloqueio antes do registro (Lei 6.766) e trava contra venda duplicada.
- Painel comercial: vendidos, VGV vendido, reservas ativas, estoque, comissões por corretor.
- Vendas reais alimentam o fluxo atual (TIR, exposição) no lugar das vendas previstas.

## Critérios

| Critério                                                                  | Situação                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 50 tentativas simultâneas de reservar o mesmo lote → exatamente 1 sucesso | ✅ teste automatizado (e2e/comercial.spec.ts)                           |
| Reservar → propor → vender em até 3 telas no celular                      | ✅ grade → lote (reserva) → venda com simulação (Playwright em Pixel 7) |
| Venda gera os lançamentos no motor imediatamente                          | ✅ projeção de receitas reais, sem cache                                |

## Pendente (4b)

- Planta de lotes desenhada sobre imagem/PDF (D-008).
- Tabela de preços com vigência e aprovação de desconto acima do limite (RN-C05).
- Proposta como etapa separada (hoje a venda já registra as condições).
- Metas comerciais e leads simples.
