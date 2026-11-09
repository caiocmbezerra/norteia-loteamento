# Fase 7 — Portais, fiscal e contábil: situação

## Feito (7a — portais)

- Convite para o portal a partir do contrato (comprador), da permuta (permutante) e da SPE (sócio): link de uso único, 30 dias, aceito com o mesmo e-mail.
- Portal do comprador (`/portal`): saldo, atraso, próxima parcela com segunda via em um toque, parcelas com boleto/Pix, pagamentos e informe de pagamentos por ano.
- Portal do sócio: participação vigente, aportes, recebimentos e movimentos.
- Portal do permutante: extrato da permuta financeira apurado com a mesma regra da gestão; repasses recebidos.
- Tudo somente leitura, por funções de banco que conferem o vínculo a cada chamada (D-070).

## Feito (7b — DIMOB)

- DIMOB por SPE e ano: prévia com operações e totais, pendências (CNPJ, endereço e município da SPE, CPF do responsável, CPF do comprador, CEP e município do empreendimento) corrigíveis na própria tela.
- Arquivo de importação para o PGD Dimob, no leiaute oficial guardado com vigência (PGD 2.8g); original ou retificadora.
- Número sequencial de contrato por loteadora.

## Feito (7b-2 — informe de IR)

- Informe de pagamentos por ano (DOCX no modelo do cliente, padrão provisório): pagamentos do ano, total do ano e acumulado até 31/12; baixado na tela do contrato e no portal do comprador.

## Feito (7c — contábil)

- Configurações → Contabilidade: plano de contas (colado do contador), regra por evento (débito, crédito, histórico) e formato do arquivo (separador, decimal, data, colunas).
- SPE → Contábil: caixa × competência por mês, pendências de regra, prévia e arquivo CSV dos lançamentos.

## Feito (7d — reforma, app e obra)

- IBS/CBS como parâmetros com vigência (teste de 2026; 2027+ a definir), redução de imóveis e redutor social; simulação em Parâmetros.
- App instalável (manifesto, ícones, atalho para o portal).
- Andamento da obra no portal do comprador: avanço financeiro por etapa da infraestrutura.

- Contrato e termo de quitação para download no portal do comprador.

## A fazer (com os clientes)

- Importar a DIMOB no PGD, piloto da exportação contábil e validação de PL-19 a PL-22.

## Critérios

| Critério                                                          | Situação                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Comprador acessa e baixa a segunda via em até 3 toques no celular | ✅ e2e `portal.spec.ts` (entrar → enviar → segunda via)                                                    |
| Arquivo DIMOB validado pelo programa oficial da Receita           | 🟡 gerado no leiaute oficial e testado por posição; falta importar no PGD (Windows) com o contador (PL-20) |
| Contador de um cliente piloto importa a exportação sem ajuste     | 🟡 formato configurável pronto; falta o piloto com o contador (PL-21)                                      |
