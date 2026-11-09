# Fase 8 — IA e importação: situação

## Feito (8a — importação de carteira)

- Carteira → Importar carteira: planilha CSV (uma linha por parcela), planilha-modelo para baixar, mapeamento das colunas da origem (sugerido pelos nomes e lembrado para a próxima vez).
- Conferência no navegador: erros por linha (CPF, datas, valores, parcela repetida, lote em dois contratos, índice), totais contratado, recebido e saldo em aberto.
- Gravação tudo ou nada, só com o saldo conciliado com o do sistema de origem; vendas, contratos, parcelas e pagamentos marcados como importados; histórico das importações.
- Desempenho: 200 contratos com 24 mil parcelas em cerca de 2 s.

## Feito (8b — assistente)

- Menu Assistente: perguntas em português respondidas pelo Claude com ferramentas só de leitura (resumo da loteadora, carteira e viabilidade por empreendimento), citando a origem.
- Conferência dos números em toda resposta; aviso quando algum valor não veio das consultas.
- Conjunto de 50 perguntas de avaliação (`docs/avaliacao`), a rodar quando a chave estiver ativa.

## A fazer

- 8c: alertas de risco (aporte próximo, inadimplência crescente, desvio de custo).
- 8d: leitura de notas e recibos → sugestão de lançamento.

## Critérios

| Critério                                                                              | Situação                                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Importação de uma carteira real de piloto conciliada com o saldo do sistema de origem | 🟡 conciliação obrigatória pronta; falta a carteira real de um cliente piloto |
| 50 perguntas de avaliação com números idênticos aos do motor, citando a origem        | 🟡 conjunto e critério prontos; rodar com a chave ativa (custa tokens)        |
| Nenhuma ferramenta de IA acessa dados fora das permissões do usuário                  | ✅ ferramentas usam o cliente do usuário (RLS, já testada no pgTAP)           |
