# NorteIA Loteamento — Roadmap

> Status (09/11/2026): **código das Fases 0 a 8 entregue e em produção.** O que falta para fechar os critérios depende de clientes piloto, contadores e contas externas; está em cada `docs/fases/fase-N.md` e no roteiro por cliente (`docs/pendencias-legais.md`).
>
> Pendências fora do código: chave da API da Anthropic na Vercel (assistente e leitura de notas), avaliação das 50 perguntas, DIMOB importada no PGD, piloto da exportação contábil, carteira real importada, teste do Asaas em sandbox, contas Resend/WhatsApp Business/assinatura eletrônica.
> Cada fase termina com: testes passando no CI, migrations versionadas, dados de demonstração atualizados e um resumo em `docs/fases/fase-N.md` (feito × pendente).
> As fases são sequenciais no núcleo; itens marcados _(paralelo)_ podem começar antes, se houver capacidade.

## Visão geral

| Fase | Nome                                | Resultado para o cliente                                                | Marco comercial                                      |
| ---- | ----------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| 0    | Esqueleto técnico                   | —                                                                       | —                                                    |
| 1    | Fundação                            | Cadastros, acessos e auditoria                                          | —                                                    |
| 2    | Motor + viabilidade                 | Estudo de viabilidade com TIR, VPL, payback e estresse                  | **Demonstração para prospects** (caso de referência) |
| 3    | Custos e obra                       | Orçado × comprometido × pago × projetado                                | —                                                    |
| 4    | Comercial                           | Mapa de lotes, reserva, venda, comissão                                 | —                                                    |
| 5    | Contratos e carteira                | Parcelas, reajuste, boleto/Pix, conciliação, régua                      | **MVP vendável para o pequeno loteador**             |
| 6    | Distrato, permutas, sócios, painéis | Inteligência financeira completa                                        | **Produto para o médio loteador**                    |
| 7    | Portais, fiscal, contábil           | Comprador, sócio e permutante; DIMOB, IR, exportação                    | —                                                    |
| 8    | IA e importação                     | Perguntas em linguagem natural, leitura de notas, migração de carteiras | —                                                    |

---

## Fase 0 — Esqueleto técnico

**Entregas**

- Monorepo (pnpm + Turborepo) com `apps/web`, `packages/{motor-financeiro,dominio,aplicacao,projecao,integracoes,db,ui}` e `supabase/`.
- TypeScript estrito, ESLint (com regras de fronteira entre pacotes), Prettier, Vitest, Playwright, pgTAP.
- CI no GitHub Actions: lint, typecheck, testes, build.
- Supabase CLI local; projeto remoto ligado ao repositório, **sem deploy automático em produção**; ambiente de staging definido.
- Next.js com shadcn/ui, tema, formatadores pt-BR (moeda, data, percentual).

**Critérios de conclusão**

- `pnpm test` e o CI verdes num PR de exemplo.
- Página inicial publicada em ambiente de preview.
- Regra de fronteira comprovada: importar banco dentro do motor quebra o lint.

## Fase 1 — Fundação

**Entregas**

- Autenticação (e-mail/senha, link mágico; MFA para Dono e Financeiro).
- Tenants, planos e funcionalidades por plano; empresas, SPEs (criação automática para o pequeno), usuários, convites, papéis com escopo.
- Empreendimentos, etapas, quadras, lotes (cadastro, importação por planilha, geração em grade).
- Glebas com polígono (MapLibre + PostGIS) e importação KML/KMZ — cadastro básico.
- Trilha de auditoria por gatilho; parâmetros com vigência (estrutura genérica); índices econômicos (tabela + importação BCB).
- Onboarding guiado do pequeno loteador (1 tela).

**Critérios de conclusão**

- Testes pgTAP: nenhum usuário acessa dados de outro tenant em **todas** as tabelas; o CI falha se surgir tabela sem RLS.
- Toda alteração em lote, empreendimento ou parâmetro aparece na auditoria com antes e depois.
- Um pequeno loteador cria conta, empreendimento e 100 lotes em menos de 15 minutos (teste de usabilidade com roteiro).
- Advisors de segurança do Supabase sem alertas críticos.

## Fase 2 — Motor financeiro e viabilidade

**Entregas**

- `packages/motor-financeiro`: fluxo mensal, TIR (mensal, anual), XIRR, VPL, paybacks, exposição, necessidade de aporte, Price/SAC, sensibilidade, estresse, valor presente da carteira, rateio por sócio.
- Viabilidade: premissas, cenários (pessimista/base/otimista), matriz de sensibilidade, choques de estresse, aprovação com **plano original imutável** e revisões.
- Parâmetros tributários do lucro presumido com vigência.
- Painel de viabilidade (mobile e desktop).
- **Empreendimento de demonstração** com o caso de referência.

**Critérios de conclusão**

- Caso de referência e os 4 testes de estresse passando dentro das tolerâncias (`docs/dominio.md` §3).
- Cobertura de 100% (linhas e ramos) no motor.
- Testes de propriedade (ex.: soma das amortizações = saldo financiado; VPL à TIR ≈ 0).
- Revisão por um especialista financeiro externo da sua escolha (recomendado).

## Fase 3 — Custos e obra

**Entregas**

- Plano de contas padrão de loteamento (editável); orçamento original e revisado por etapa.
- Fornecedores, contratos de empreitada, medições simples, contas a pagar, pagamentos, anexos de notas.
- Comprometido, pago e projetado alimentando o motor (sem dupla contagem); custo por lote e por m²; rateio de despesas comuns entre empreendimentos.

**Critérios de conclusão**

- Invariante orçado = realizado + comprometido + projetado testado em cada centro de custo.
- Lançar um pagamento atualiza TIR e exposição do empreendimento em menos de 5 segundos.

## Fase 4 — Comercial

**Entregas**

- Planta de lotes: imagem/PDF de fundo com desenho dos lotes por cima + grade automática; cores por status; uso no celular.
- Tabela de preços com vigência; reserva com prazo; simulador de parcelas; proposta; venda; trava de venda duplicada; bloqueio de venda antes do registro.
- Corretores, imobiliárias, comissões (no ato ou sobre o recebido), metas; leads simples.

**Critérios de conclusão**

- Teste de concorrência: 50 tentativas simultâneas de reservar o mesmo lote → exatamente 1 sucesso.
- Fluxo "reservar → propor → vender" em até 3 telas no celular (Playwright em 360 px).
- Venda gera os lançamentos projetados no motor imediatamente.

## Fase 5 — Contratos e carteira → **MVP do pequeno loteador**

**Entregas**

- Modelos de contrato em DOCX; geração; assinatura eletrônica (Clicksign); aditivos; cessão; quitação.
- Parcelas Price/SAC; reajuste por índice no aniversário; encargos de mora.
- Integração Asaas (conta do loteador): boleto + Pix, webhooks, conciliação automática, varredura diária de segurança.
- Régua de cobrança (e-mail + WhatsApp oficial); inadimplência por contrato e empreendimento; renegociação; antecipação.

**Critérios de conclusão**

- Ciclo completo em sandbox do Asaas: venda → cobrança → pagamento → baixa automática → lançamento realizado → indicador atualizado.
- Webhook duplicado não gera baixa dupla (teste).
- Reajuste de 1.000 contratos executado por rotina idempotente, com auditoria.
- Primeiro cliente piloto operando um empreendimento real.

## Fase 6 — Distrato, permutas, sócios e painéis → **produto para o médio loteador**

**Entregas**

- Distrato: simulador e execução parametrizados (art. 32-A), devolução parcelada, lote de volta ao estoque.
- Permuta física e financeira; repasse por recebimento; extrato do permutante.
- Sócios, participações com vigência, aportes, mútuos, distribuições; retorno por sócio.
- Painéis por empreendimento, SPE, sócio e consolidado; plano × realizado+projetado; estresse; simulação de cessão de carteira; necessidade de aporte nos próximos meses.

**Critérios de conclusão**

- Distrato do caso de referência (cenário de teste a definir com o advogado) bate com cálculo independente.
- Soma dos resultados por sócio = resultado da SPE (teste de propriedade).
- Painel consolidado de um tenant com 10 empreendimentos e 3.000 lotes carrega em menos de 2 segundos.

## Fase 7 — Portais, fiscal e contábil

**Entregas**

- Portal/PWA do comprador: segunda via, extrato, informe de IR, andamento da obra, documentos.
- Portais somente leitura do sócio e do permutante.
- DIMOB; exportação contábil configurável; visão caixa × competência; parâmetros IBS/CBS com vigência.

**Critérios de conclusão**

- Comprador acessa e baixa a segunda via em até 3 toques no celular.
- Arquivo DIMOB validado pelo programa oficial da Receita.
- Contador de um cliente piloto importa a exportação sem ajuste manual.

## Fase 8 — IA e importação

**Entregas**

- Leitura de notas e recibos → sugestão de lançamento.
- Perguntas em linguagem natural respondidas por ferramentas que chamam o motor.
- Alertas de risco (aporte próximo, inadimplência crescente, desvio de custo).
- Importação de carteiras de outros sistemas (planilha padrão + mapeamentos).

**Critérios de conclusão**

- Conjunto de 50 perguntas de avaliação: respostas com números idênticos aos do motor, citando a origem.
- Nenhuma ferramenta de IA acessa dados fora das permissões do usuário (teste).
- Importação de uma carteira real de piloto conciliada com o saldo do sistema de origem.

---

## Itens contínuos (todas as fases)

- `docs/decisoes.md` e `docs/pendencias-legais.md` atualizados.
- Commits pequenos, em português.
- Advisors de segurança e desempenho do Supabase revisados ao fim de cada fase.
- Dados de demonstração atualizados com cada módulo novo.
