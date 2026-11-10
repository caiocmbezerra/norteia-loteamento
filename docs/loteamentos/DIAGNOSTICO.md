# Diagnóstico — "Prompt mestre: arquitetura, contratos de loteamento e governança"

> Data: 10/11/2026. Situação: **aprovado** pelo dono do produto em 10/11/2026 (decisões na seção 8).

## 1. Conclusão em uma frase

O NorteIA Loteamento já implementa, testa e roda em produção quase tudo o que o prompt pede (Fases 0 a 8 do `docs/roadmap.md`, 38 migrations, 35 arquivos pgTAP, 69 testes e2e). Recomendo **não recriar** o modelo com as tabelas sugeridas no prompt (`loteamento_contracts`, `installments` etc.) e **completar apenas as lacunas** da seção 4. Uma regra do prompt está juridicamente incorreta para loteamento (seção 3.1).

## 2. Requisito do prompt × o que já existe

| Requisito do prompt                                     | Situação                                                                                                                                                                       | Onde está                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Gleba original (matrícula mãe)                          | ✅ `glebas` com situação, área, `matriculas text[]`, polígono PostGIS                                                                                                          | `20261107210200_fundacao_cadastros.sql`        |
| Projeto aprovado e registrado                           | ✅ `empreendimentos.data_registro`, `registro_matricula`; venda bloqueada sem registro (RN-C01, Lei 6.766 art. 37)                                                             | idem; `vender_lote`                            |
| Desmembramento em lotes                                 | ✅ `quadras` e `lotes` criados em lote (`criar_empreendimento_com_lotes`), planta sobre imagem/PDF                                                                             | D-099                                          |
| Matrícula individual de cada lote                       | ⚠️ **lacuna**: não há campo por lote                                                                                                                                           | seção 4.2                                      |
| Lote: disponível, reservado, vendido                    | ✅ `lote_status` (+ bloqueado, permuta) com transições só pelo fluxo comercial (RN-C04)                                                                                        | —                                              |
| Lote "quitado"                                          | ⚠️ a quitação existe **no contrato** (`contratos.situacao = 'quitado'`, `quitado_em`); não há status no lote                                                                   | seção 4.4                                      |
| Compromisso de compra e venda com financiamento próprio | ✅ `vendas` → `contratos` → `parcelas`, modelos Word próprios do cliente                                                                                                       | Fases 4–5                                      |
| Price e SAC                                             | ✅ motor puro; arredondamento na última parcela (RN-K02)                                                                                                                       | `packages/motor-financeiro/src/amortizacao.ts` |
| Correção monetária                                      | ✅ IPCA, IGP-M, INCC; reajuste anual só com índice publicado (RN-K03)                                                                                                          | `20261108180000_reajuste_indices.sql`          |
| Correção pelo **INPC**                                  | ⚠️ **lacuna**: índice não cadastrado                                                                                                                                           | seção 4.1                                      |
| Juros e multa legais                                    | ✅ multa e juros de mora como parâmetros com vigência e tetos configuráveis (RN-K04, PL em aberto)                                                                             | `encargos.ts`, `parametros`                    |
| Inadimplência                                           | ✅ régua de atraso, alertas de inadimplência crescente, histórico                                                                                                              | D-09x, Fase 8c                                 |
| Distrato (Lei 13.786/2018)                              | ✅ art. 32-A da Lei 6.766: fruição, cláusula penal, encargos, comissão, devolução parcelada — tudo parametrizado (RN-D01 a RN-D04)                                             | `distrato.ts`, `20261109090000_distrato.sql`   |
| Portal do adquirente: boleto/Pix                        | ✅ segunda via pelo Asaas, informe de pagamentos, documentos                                                                                                                   | `(portal)/portal`                              |
| Portal: andamento das obras                             | ✅ orçado × pago por etapa da infraestrutura (`obra_portal`)                                                                                                                   | D-08x                                          |
| Portal: **chamados de atendimento**                     | ⚠️ **lacuna**                                                                                                                                                                  | seção 4.3                                      |
| Multi-tenant com RLS                                    | ✅ toda tabela de `public` com RLS e política (teste `000_rls_obrigatorio`); `privado.pode(permissão, tenant, escopo, id)`                                                     | `fundacao_acessos.sql`                         |
| Perfis: gestor de vendas, diretor financeiro            | ✅ `comercial_gestor`, `financeiro` (+ dono, engenharia, corretor, contador, sócio, permutante)                                                                                | enum `papel`                                   |
| Perfil **operacional de cartório**                      | ⚠️ **lacuna**                                                                                                                                                                  | seção 4.2                                      |
| Adquirente só vê o que é dele                           | ✅ `privado.e_comprador` nas políticas do portal; testes pgTAP 020 e 025                                                                                                       | —                                              |
| Dinheiro em centavos inteiros (BIGINT)                  | ✅ `*_centavos bigint` em todo o banco; `Centavos`/`Decimal` no motor; lint proíbe ponto flutuante no motor                                                                    | CLAUDE.md                                      |
| Trilha de auditoria imutável                            | ✅ `auditoria` só por gatilho; `update`/`delete`/`truncate` bloqueados por gatilho e por grant (RN-G03)                                                                        | `fundacao_utilitarios.sql`                     |
| LGPD                                                    | ✅ parcial: dados pessoais com leitura restrita por papel, chaves fora do código (Vault), sem service role no app. Falta política de retenção e exportação de dados do titular | seção 4.5                                      |

## 3. Divergências do prompt que exigem decisão

### 3.1 "Multa compensatória de até 25%" — **incorreto para loteamento**

A Lei 13.786/2018 criou duas regras diferentes:

- **Loteamento** (art. 32-A da Lei 6.766/1979, que é o caso deste produto):
  - fruição de até 0,75% ao mês sobre o valor atualizado do contrato;
  - cláusula penal e despesas administrativas de **até 10%** do valor atualizado;
  - encargos moratórios, débitos de tributos do imóvel e comissão de corretagem (esta só se integrar o preço);
  - devolução em até 12 parcelas.
- **Incorporação imobiliária** (art. 67-A da Lei 4.591/1964): pena de até 25%, ou até 50% com patrimônio de afetação.

O sistema segue o art. 32-A, com todos os valores como parâmetros por cliente e marcados para validação (PL-02, **VALIDAR COM ADVOGADO**). **Recomendo manter.** Usar 25% em loteamento exporia a loteadora a ação de restituição.

### 3.2 Nomes em inglês (`loteamento_contracts`, `installments`)

O código de domínio é em português por regra do projeto (CLAUDE.md), e as tabelas equivalentes já existem: `contratos` e `parcelas`. Renomear quebraria 38 migrations, as funções, os testes e a produção sem ganho funcional. **Recomendo manter.**

### 3.3 "Desmembramento automático em sub-matrículas"

Quem abre a matrícula de cada lote é o cartório de registro de imóveis, depois do registro do loteamento. O sistema não pode criá-la; pode **guardar** o número da matrícula de cada lote e acompanhar quais já foram abertas (seção 4.2).

### 3.4 "Juros legais permitidos" e INPC/IGP-M

Os tetos de juros e multa variam conforme o contrato e o entendimento de cada advogado. Por isso ficam em aberto, como parâmetros por cliente (PL-03, PL-04), conforme decidido com o dono do produto. Nada será fixado no código.

## 4. Lacunas reais e proposta (para aprovação)

Tudo segue os padrões já usados: RLS com `privado.pode`, gatilho de auditoria, centavos e parâmetros com vigência.

### 4.1 Índice INPC

```sql
insert into public.indices_economicos (codigo, nome, fonte, serie_sgs)
values ('INPC', 'Índice Nacional de Preços ao Consumidor', 'IBGE via BCB/SGS', 188);
```

- No app: incluir `'INPC'` em `INDICES_REAJUSTE` e na importação de índices.
- Esforço: pequeno.
- Antes de ativar: confirmar o código 188 no SGS, como foi feito com o INCC.

### 4.2 Matrícula por lote e papel "cartório"

```sql
alter type public.papel add value 'cartorio';
alter table public.lotes
  add column matricula text check (matricula is null or length(trim(matricula)) between 1 and 40),
  add column matricula_aberta_em date,
  add column inscricao_imobiliaria text;
insert into public.papel_permissoes (papel, permissao) values
  ('cartorio', 'cadastro.ler'), ('cartorio', 'registro.editar'),
  ('dono', 'registro.editar'), ('engenharia', 'registro.editar');
```

- **Edição:** como `lotes` hoje só aceita escrita com `empreendimento.editar`, a matrícula seria gravada por uma função `registrar_matricula_lote(lote, matricula, data)` com a permissão `registro.editar`, sem abrir a edição do lote ao papel cartório.
- **Leitura:** o papel cartório vê o cadastro (empreendimento, glebas, lotes, matrículas). Não vê financeiro, carteira nem dados de compradores além do necessário à escritura. **Esse ponto precisa de decisão sua.**
- **Telas:** coluna de matrícula na grade, progresso "N de M lotes com matrícula" e importação de planilha.

### 4.3 Chamados no portal do adquirente

```sql
create table public.chamados (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contrato_id uuid not null,
  assunto text not null check (length(trim(assunto)) between 3 and 120),
  categoria text not null check (categoria in ('financeiro', 'documentos', 'obra', 'escritura', 'outro')),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'em_atendimento', 'resolvido')),
  criado_em timestamptz not null default now(), criado_por uuid,
  atualizado_em timestamptz not null default now(), atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict
);
create table public.chamado_mensagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chamado_id uuid not null,
  autor_comprador boolean not null,
  texto text not null check (length(trim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now(), criado_por uuid default auth.uid(),
  foreign key (tenant_id, chamado_id) references public.chamados (tenant_id, id) on delete cascade
);
-- RLS (mesmo padrão do portal):
--   comprador: lê e escreve só nos chamados dos próprios contratos (privado.e_comprador);
--   loteadora: lê e responde com carteira.ler / carteira.editar no empreendimento do contrato;
--   mensagens não se alteram nem se apagam (só inserção); auditoria por gatilho.
```

- Aviso por e-mail ao abrir e ao responder, quando o Resend estiver contratado.
- Anexos no bucket privado `documentos`, numa pasta própria.

### 4.4 Lote "quitado" no mapa

Não proponho novo status no lote: isso duplicaria a informação que já existe no contrato. Proponho mostrar "Quitado" na grade, na planta e nos filtros a partir de `contratos.situacao = 'quitado'`, com uma cor própria.

### 4.5 LGPD: direitos do titular

- Exportar os dados de um comprador (cadastro, contratos, parcelas, pagamentos) em um arquivo, a pedido.
- Anonimizar um comprador sem contrato ativo. Os registros financeiros e a auditoria ficam, por obrigação legal; o nome e o CPF são substituídos.
- **VALIDAR COM ADVOGADO** os prazos de guarda (fiscais e contábeis) antes de anonimizar.

## 5. Motor de cálculo (como já funciona, para referência)

- **Pureza e determinismo.** `packages/motor-financeiro` não acessa banco, rede ou relógio, nem usa aleatoriedade; o lint garante isso, e a cobertura de testes é de 100%. A mesma entrada sempre gera o mesmo resultado, e a data de referência é sempre recebida como argumento.
- **Amortização.**
  - Price e SAC usam `Decimal` e arredondam para centavos em cada parcela.
  - A diferença de arredondamento vai para a última parcela, de modo que a soma das amortizações seja igual ao saldo financiado (RN-K02).
- **Correção.**
  - O reajuste é aplicado no aniversário do contrato pelo índice escolhido, usando só competências já publicadas.
  - A deflação é ignorada por padrão (parâmetro, PL-03).
  - A rotina é idempotente, e o histórico fica em `reajustes`.
- **Encargos.**
  - A multa e os juros de mora pro rata die são calculados no servidor a partir dos parâmetros do contrato; o navegador nunca envia valores de encargo.
  - Pagamento parcial gera baixa parcial (RN-K06), e a conciliação com o Asaas é idempotente (RN-K05).
- **Distrato (art. 32-A).**
  - O motor calcula: valor pago, fruição pelo tempo de posse, cláusula penal sobre o valor atualizado, encargos e comissão (quando aplicáveis), tributos e o saldo a devolver.
  - O saldo é dividido em até N parcelas, com carência.
  - Cada percentual vem de parâmetro com vigência do cliente.
- **Antecipação.** O desconto é o saldo menos o valor presente à taxa da venda, pro rata die.
- **Distrato no banco.** O banco só grava o que o motor calculou, dentro da mesma transação, e tudo passa pela trilha de auditoria.

## 6. Roadmap proposto (somente as lacunas)

| Ordem | Entrega                                             | Depende de                                              |
| ----- | --------------------------------------------------- | ------------------------------------------------------- |
| L1    | INPC (seção 4.1)                                    | conferir a série no SGS                                 |
| L2    | "Quitado" visível no mapa e nos filtros (seção 4.4) | —                                                       |
| L3    | Matrícula por lote e papel cartório (seção 4.2)     | sua decisão sobre o que o cartório pode ver             |
| L4    | Chamados no portal (seção 4.3)                      | — (aviso por e-mail quando o Resend estiver contratado) |
| L5    | LGPD: exportação e anonimização (seção 4.5)         | advogado: prazos de guarda                              |

Cada entrega segue o padrão do projeto: migration com RLS e auditoria, teste pgTAP, e2e e acessibilidade, decisão registrada em `docs/decisoes.md` e um PR por entrega.

## 7. O que preciso que você aprove

1. **Distrato:** manter as regras do art. 32-A (cláusula penal até 10%, parametrizável) em vez dos 25% do prompt.
2. **Nomes:** manter as tabelas atuais em português, sem recriar o modelo em inglês.
3. **Lacunas:** fazer L1 a L5, nessa ordem ou em outra que você preferir.
4. **Papel cartório:** definir o que ele pode ver (proposta: só cadastro e matrículas, sem financeiro).

## 8. Decisões do dono do produto (10/11/2026)

1. **Distrato:** cláusula penal padrão de 10% (art. 32-A), ajustável por cliente. Cada cliente pode cadastrar outros custos a descontar (documentação, taxas etc.), cada um marcado como dentro ou fora do limite de 10%; o sistema avisa quando o que conta dentro do limite passa de 10%. **VALIDAR COM ADVOGADO** (PL-02).
2. **Nomes:** as tabelas atuais em português ficam.
3. **Matrícula:** o cartório abre; o sistema só guarda o número e a data de cada lote, preenchidos pela equipe da loteadora. Sem papel "cartório" por enquanto.
4. **Ordem de execução:**
   1. itens de desconto do distrato por cliente;
   2. INPC (L1);
   3. "quitado" no mapa (L2);
   4. matrícula por lote (L3);
   5. portal: extrato em PDF e simulação de quitação antecipada;
   6. chamados no portal (L4);
   7. LGPD (L5).
