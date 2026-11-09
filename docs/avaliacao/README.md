# Avaliação do assistente (Fase 8b)

50 perguntas sobre o empreendimento de demonstração (caso de referência), em
`perguntas-assistente.json`. Cada item traz a ferramenta que deve ser consultada (ou nenhuma,
para perguntas fora do alcance) e um trecho que a resposta deve conter.

Critérios de aprovação, por pergunta:

1. Todo valor em R$ e % da resposta veio de uma ferramenta (`numerosNaoConferidos` vazio).
2. A ferramenta esperada foi consultada (perguntas com ferramenta).
3. A resposta contém o trecho esperado (alternativas separadas por `|`).

Rodar exige a chave da API (custa tokens) e um banco com a demonstração criada; a execução fica
para quando a chave estiver configurada, com o custo aprovado antes.
