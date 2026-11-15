# QA — Auditoria técnica (somente leitura)

> Data: 15/11/2026. Versão auditada: `main` em `5554111` (PR #67).
> Ambiente de teste: Supabase local do CLI (contêiner `supabase_db_norteia-loteamento`, `127.0.0.1:54322`), isolado e com dados sintéticos. A produção (`krmfljdyzuiipfsfpqvn`) **não recebeu escrita nenhuma**.
> Esta etapa não alterou código nem dados. Todos os números abaixo vêm de introspecção do banco (`pg_catalog`), de leitura do repositório ou de execução registrada em `07-relatorio-execucao.md`.

## 1. Arquitetura confirmada

| Camada                         | Tecnologia (versão)                                                                                                               | Onde                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Monorepo                       | pnpm 10.28 + Turborepo 2.11, Node ≥ 22                                                                                            | `package.json`, `turbo.json`                  |
| Web                            | Next.js 16.4.5, React 19.3.1, `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.119                                               | `apps/web`                                    |
| Regras de aplicação            | TypeScript, consultas pelo cliente Supabase com a sessão do usuário (sem chave de serviço, D-022)                                 | `packages/aplicacao`                          |
| Motor financeiro               | TypeScript puro, `decimal.js` 10.6 (34 dígitos, meio-para-par), sem I/O                                                           | `packages/motor-financeiro`                   |
| Projeção, domínio, integrações | TypeScript puro (DIMOB, contábil, DOCX, importação CSV, IA)                                                                       | `packages/projecao`, `dominio`, `integracoes` |
| Banco                          | Supabase/PostgreSQL 17, esquemas `public` (exposto) e `privado` (não exposto)                                                     | `supabase/migrations` (54 migrations)         |
| Rotinas                        | `pg_cron` (6 tarefas), sem Edge Functions (pasta `supabase/functions` não existe)                                                 | ver §5                                        |
| Integrações externas           | Asaas (HTTP do banco via `privado.asaas_chamar`), Resend (e-mail), BCB/SGS (índices), Anthropic (assistente)                      | migrations e `packages/integracoes`           |
| Testes                         | Vitest 5.1 (unidade, cobertura 100% no motor), pgTAP (`supabase test db`), Playwright 1.65 + axe-core 4.14 (e2e e acessibilidade) | ver §6                                        |
| CI                             | GitHub Actions `ci.yml`: format, lint, fronteiras, typecheck, unidade, build; banco (test db, db lint); e2e                       | `.github/workflows/ci.yml`                    |

**Confirmado:** o sistema usa Supabase/PostgreSQL e **não tem Edge Functions**. Integrações rodam de dentro do banco (extensão `http`) e de server actions do Next.js.

## 2. Inventário do banco (introspecção do banco local, idêntico às migrations de `main`)

- **76 tabelas** em `public`. **Todas** têm RLS ligada (`relrowsecurity`). O teste `000_rls_obrigatorio` impõe isso.
- **66 tabelas com `tenant_id`.** As 10 sem `tenant_id` são: `tenants`, que é a própria loteadora; `perfis`, que é por usuário; e os catálogos globais somente leitura `planos`, `plano_funcionalidades`, `funcionalidades`, `papel_permissoes`, `parametros`, `indices_economicos`, `indice_valores` e `leiautes_declaracao`.
- **Autoria:** `criado_por`/`atualizado_por` existem em 65 tabelas, preenchidos pelo gatilho `privado.carimbar`. Esse gatilho também **impede mudar o `tenant_id`** de um registro ("Um registro não pode mudar de cliente"), o que foi confirmado por teste (SEG-RPC-025).
- **Auditoria:** gatilho `auditar` em 65 tabelas, grava antes, depois e campos alterados. A tabela `auditoria` é imutável (gatilhos `auditoria_imutavel` e `auditoria_sem_truncate`). **Sem gatilho de auditoria:** `asaas_eventos` (é ele mesmo um log), `modelos_documento`, `tabela_preco_itens` (itens imutáveis, D-098) e os catálogos globais.
- **Escrita da carteira só por função:** o gatilho `carteira_somente_por_funcao` bloqueia INSERT/UPDATE/DELETE direto em `contratos`, `parcelas`, `recebimentos`, `cobrancas`, `aditivos`, `distratos`, `devolucoes`, `reajustes`, `permutas`, `permuta_lotes`, `repasses_permuta`, `participacoes` e `movimentos_socio`.
- **Isolamento por chave composta:** todas as FKs para tabelas com `tenant_id` incluem `tenant_id`, como `(tenant_id, comprador_id) → compradores (tenant_id, id)`. **Única exceção:** `vendas.importacao_id → importacoes(id)`. Essa coluna só é gravada por `importar_carteira`, e a invariante INV-012 verifica o tenant.
- **Unicidade de negócio no banco:**
  - `vendas_ativa_por_lote_idx`, `reservas_ativa_por_lote_idx`, `cobrancas_pendente_por_parcela_idx`;
  - `recebimentos_referencia_idx (tenant_id, origem, referencia_externa)`, que dá a idempotência da baixa;
  - `contratos_numero_unico`, `parcelas (contrato_id, numero)`, `lotes (quadra_id, numero)`, `medicoes (contrato_id, numero)`;
  - exclusão GiST `participacoes_sem_sobreposicao`, por sócio.
- **Checks financeiros:**
  - parcelas: `valor = amortização + juros + correção`, `0 ≤ pago ≤ valor` e `paga ⇔ pago = valor`;
  - recebimentos: `valor = principal + multa + juros − desconto`, com principal e valor > 0;
  - vendas: `entrada ≤ preço`, `parcelas ≤ 480`, `juros ≥ 0`, sem teto;
  - contratos: multa e juros de mora entre 0 e 1.
- **Funções:**
  - 79 em `public`; 74 executáveis por `authenticated`, 76 SECURITY DEFINER, **todas com `search_path` fixo** (zero sem `search_path`);
  - 4 executáveis por `anon`: `webhook_asaas`, `vitrine_publica`, `registrar_interesse`, `descadastrar_lembretes`;
  - 65 em `privado`, esquema **sem USAGE para `anon`** e fora da API (PostgREST expõe só `public` e `graphql_public`).
- **Views:** nenhuma em `public`.
- **Papéis e permissões** (`papel_permissoes`): `dono` 30, `financeiro` 16, `comercial_gestor` 11, `engenharia` 10, `contador` 9, `socio_leitura` 4, `corretor` 3. O papel `permutante_leitura` existe no enum e não tem permissões. Os escopos são `tenant`, `empresa`, `spe` e `empreendimento`.
- **Tempo limite:** `authenticated` 8 s, `anon` 3 s (`pg_roles.rolconfig`).

## 3. Segredos

- Nenhum segredo real no repositório: a busca por padrões de chave encontrou só valores fictícios de teste, como `$aact_hmlg_x`.
- A chave do Asaas fica no **Vault** (`integracoes_asaas.segredo_id`), e o token do webhook é guardado como **hash** (`webhook_token_hash`).
- A chave do Resend fica no Vault (`resend_api_key`). A chave de serviço não aparece em `apps/` nem em `packages/`.

## 4. Fluxos implementados (confirmados por função de banco)

| Área                 | Funções / tabelas                                                                                                                                                                                                      | Situação                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tenancy e convites   | `criar_tenant`, `criar_convite`, `aceitar_convite`, `aceitar_convites_pendentes`                                                                                                                                       | Implementado                                                                                                                         |
| Estrutura física     | `criar_empreendimento_com_lotes`, glebas/etapas/quadras/lotes (RLS direta), planta (Storage), matrícula                                                                                                                | Implementado                                                                                                                         |
| Comercial            | `publicar_tabela_preco`, `preco_tabela`, `reservar_lote`, `cancelar_reserva`, `criar_proposta`, `decidir_proposta`, `solicitar_aprovacao_desconto`, `decidir_aprovacao_desconto`, `vender_lote`, metas, leads, vitrine | Implementado                                                                                                                         |
| Contratos e carteira | `criar_contrato`, `registrar_recebimento`, `estornar_recebimento`, `antecipar_parcelas`, créditos (`registrar/aplicar/devolver/cancelar_credito`)                                                                      | Implementado                                                                                                                         |
| Reajuste             | `reajustar_contrato`, rotina `executar_reajustes`, importação diária de índices (IPCA, IGP-M, INPC, INCC)                                                                                                              | Implementado                                                                                                                         |
| Asaas                | `configurar_asaas`, `gerar_cobranca`, `cancelar_cobranca`, `segunda_via`, `webhook_asaas`, conciliação a cada 6 h                                                                                                      | Implementado (sandbox validado)                                                                                                      |
| Aditivos             | `renegociar_contrato`, `ceder_contrato`, `trocar_lote`                                                                                                                                                                 | Implementado; **não há cancelamento de aditivo**                                                                                     |
| Distrato             | `executar_distrato`, `pagar_devolucao`, itens de desconto                                                                                                                                                              | Implementado; **não há reversão de distrato nem estorno de devolução**                                                               |
| Permutas             | `criar_permuta`, `registrar_repasse`, `estornar_repasse`, `eventos_permuta`                                                                                                                                            | Implementado; **não há encerramento de permuta**                                                                                     |
| Sócios               | `definir_participacao`, `registrar_movimento_socio`, `estornar_movimento_socio`                                                                                                                                        | Implementado                                                                                                                         |
| Custos e obra        | fornecedores, contratos, contas, pagamentos (RLS direta), `registrar_medicao`, `ratear_despesa`, anexos                                                                                                                | Implementado                                                                                                                         |
| Viabilidade          | `aprovar_viabilidade`, `plano_versoes` imutável                                                                                                                                                                        | Implementado                                                                                                                         |
| Contábil e fiscal    | `eventos_contabeis`, plano de contas, regras, formatos CSV, `dados_dimob`, `informe_pagamentos`, IBS/CBS (motor)                                                                                                       | Implementado; **não há partidas dobradas persistidas** (exportação por eventos)                                                      |
| Portal               | `meu_portal`, `portal_contrato`, `documento_portal`, `obra_portal`, chamados, LGPD (`dados_titular`)                                                                                                                   | Implementado                                                                                                                         |
| E-mail               | `privado.enviar_email` (Resend), lembretes, chamados, convites                                                                                                                                                         | Implementado (desligado por padrão)                                                                                                  |
| Importação           | `importar_carteira`, mapeamentos                                                                                                                                                                                       | Implementado                                                                                                                         |
| Comissões            | colunas `comissao_percentual`/`comissao_modo` em `vendas`                                                                                                                                                              | **Parcial:** não há tabela de comissões, pagamento nem estorno de comissão                                                           |
| Planos               | `planos.max_lotes` + gatilho `verificar_limite_lotes`                                                                                                                                                                  | **Parcial:** `privado.tem_funcionalidade` existe mas nenhuma política ou função a usa; o plano é editável pelo cliente (achado A-08) |

## 5. Rotinas agendadas (`cron.job`)

| Tarefa                  | Agenda (UTC)     | Idempotência                                              |
| ----------------------- | ---------------- | --------------------------------------------------------- |
| `expirar-reservas`      | a cada 5 min     | Reserva vencida não bloqueia nem antes da rotina (RN-C03) |
| `importar-indices`      | 09:17 diário     | Testada: importação repetida não regrava (011)            |
| `executar-reajustes`    | 09:47 diário     | Testada: rotina repetida não reajusta de novo (011)       |
| `conciliar-cobrancas`   | a cada 6 h (:23) | Referência única por evento ou pagamento                  |
| `aplicar-tabelas-preco` | 03:10 diário     | —                                                         |
| `lembretes-vencimento`  | 11:07 diário     | `envios_email unique (tenant_id, tipo, referencia)`       |

## 6. Testes que já existiam (linha de base executada em 15/11/2026)

| Suíte                  | Arquivos | Casos                           | Resultado |
| ---------------------- | -------- | ------------------------------- | --------- |
| Vitest (pacotes e web) | 30       | 233                             | PASSOU    |
| pgTAP                  | 46       | 514                             | PASSOU    |
| Playwright e2e + axe   | 32 specs | 79 (última execução registrada) | ver 07    |

## 7. Respostas às verificações obrigatórias

| Verificação                                     | Resposta                                                                                                                 | Evidência               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Todas as tabelas de negócio com RLS ativa?      | **Sim** (76/76)                                                                                                          | introspecção; teste 000 |
| Todas com `tenant_id`?                          | Sim (66), exceto `tenants`, `perfis` e 8 catálogos globais                                                               | §2                      |
| Autoria `criado_por`/`atualizado_por`?          | Sim, em 65 tabelas; as outras são logs, catálogos ou imutáveis                                                           | §2                      |
| Relações respeitam o tenant?                    | Sim, por FK composta; exceção controlada em `vendas.importacao_id`                                                       | §2, INV-012             |
| Tabelas sem isolamento?                         | Nenhuma tabela de cliente                                                                                                | 001, 046                |
| RPCs que ignoram o tenant?                      | **Nenhuma**, na varredura das 74 funções com ids reais de outra loteadora                                                | SEG-RPC-001…017         |
| SECURITY DEFINER com `search_path`?             | Todas fixas (`''` ou explícito)                                                                                          | introspecção            |
| Funções sem autorização?                        | As 4 anônimas são públicas por desenho e cada uma tem proteção própria (token, slug publicado ou token de webhook)       | SEG-RPC-012…016         |
| Processos assíncronos com risco de duplicidade? | Cron e webhook são idempotentes; **corrida em `definir_participacao`** (achado A-09)                                     | CONC-008                |
| Idempotência?                                   | Baixa por referência externa; e-mails por chave única; reajuste por aniversário                                          | 010, 011, 012, CONC-004 |
| Auditoria de operações financeiras?             | Sim, em todas as tabelas financeiras                                                                                     | INV-013                 |
| Integridade no banco?                           | Forte (checks, FKs compostas, índices parciais); lacunas de validação de valores informados pelo app (achados A-01…A-05) | 047                     |
