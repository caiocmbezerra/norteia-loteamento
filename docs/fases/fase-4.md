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

## Feito (4b)

- Tabela de preços com vigência (D-098): publicada a partir de hoje ou de uma data futura, como reajuste sobre a vigente e/ou preço próprio por lote; histórico preservado; o preço de cadastro do lote segue a tabela vigente (rotina diária para as futuras).
- Aprovação de desconto (RN-C05): acima do limite configurado, o gestor comercial pede a aprovação do dono com motivo; a aprovação vale por prazo configurável e para aquele preço ou maior; a venda guarda o preço de tabela e quem aprovou.

- Planta de lotes (D-008, D-099): imagem ou PDF da planta como fundo (o PDF vira imagem no navegador), contorno de cada lote desenhado com toques; o mapa do empreendimento abre na planta com as cores da situação, filtros e zoom, e mantém a grade por quadra.

- Proposta como etapa separada (D-100): o corretor (ou a gestão) propõe as condições com simulação e validade; a gestão aceita ou recusa com motivo; a aceita abre a venda já preenchida e vira "convertida" quando a venda do lote é registrada (as abertas do lote são encerradas). O corretor só vê as próprias propostas (RN-C07).

## Pendente (4b)

- Metas comerciais e leads simples.
