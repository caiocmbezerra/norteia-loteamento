# Fase 1 — Fundação: situação

## 1a · Banco (PR #2, na `main`)

Clientes, membros, papéis com escopo, convites, empresas, SPEs, glebas, empreendimentos, etapas, quadras, lotes, auditoria imutável, parâmetros com vigência, índices econômicos. 74 testes pgTAP.

## 1b · Telas (este PR)

- Login com senha e por link mágico; cadastro; saída; proteção de rotas (`proxy.ts`).
- **Cadastro inicial em uma tela** (`/comecar`): cria cliente, empresa, SPE, empreendimento e a grade de lotes.
- Painel com empreendimentos e situação dos lotes; página do empreendimento com **grade de lotes por quadra** (cores + texto, filtros); edição de lote e de empreendimento (data de registro libera vendas).
- Configurações: membros e convites (link), empresas e SPEs (limite de SPE pelo plano), auditoria com antes/depois.
- Testes: domínio (grade, validações em pt-BR, resumo de lotes), aplicação (tradução de erros), 8 testes de ponta a ponta (celular e desktop), 79 testes de banco.

## 1c · Pendente

- Glebas no mapa (MapLibre) com importação KML/KMZ.
- Importação de lotes por planilha.
- MFA obrigatório para Dono e Financeiro.
- Importação automática de índices (BCB/SGS).
- Teste de usabilidade com roteiro (critério: 100 lotes em menos de 15 minutos).

## Critérios da Fase 1

| Critério                                                                                | Situação                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Isolamento em todas as tabelas (pgTAP) e CI falha com tabela sem RLS                    | ✅                                                         |
| Alterações em lote, empreendimento e parâmetro aparecem na auditoria com antes e depois | ✅                                                         |
| Pequeno loteador cria conta, empreendimento e 100 lotes em menos de 15 minutos          | ✅ automatizado em ~3 s; falta o teste com pessoa real     |
| Advisors de segurança do Supabase sem alertas críticos                                  | pendente: depende das migrations no projeto remoto (D-021) |
