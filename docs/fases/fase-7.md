# Fase 7 — Portais, fiscal e contábil: situação

## Feito (7a — portais)

- Convite para o portal a partir do contrato (comprador), da permuta (permutante) e da SPE (sócio): link de uso único, 30 dias, aceito com o mesmo e-mail.
- Portal do comprador (`/portal`): saldo, atraso, próxima parcela com segunda via em um toque, parcelas com boleto/Pix, pagamentos e informe de pagamentos por ano.
- Portal do sócio: participação vigente, aportes, recebimentos e movimentos.
- Portal do permutante: extrato da permuta financeira apurado com a mesma regra da gestão; repasses recebidos.
- Tudo somente leitura, por funções de banco que conferem o vínculo a cada chamada (D-070).

## A fazer

- 7b: DIMOB e informe de IR formal (PL-19).
- 7c: exportação contábil configurável por cliente; visão caixa × competência.
- 7d: parâmetros IBS/CBS com vigência; PWA (manifesto e ícone); andamento da obra e documentos no portal.

## Critérios

| Critério                                                          | Situação                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| Comprador acessa e baixa a segunda via em até 3 toques no celular | ✅ e2e `portal.spec.ts` (entrar → enviar → segunda via) |
| Arquivo DIMOB validado pelo programa oficial da Receita           | ⏳ 7b                                                   |
| Contador de um cliente piloto importa a exportação sem ajuste     | ⏳ 7c                                                   |
