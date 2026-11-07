# NorteIA Loteamento — Domínio

> Status: **proposta para aprovação** (v0.1, 07/11/2026).
> Este documento é a referência de vocabulário e de regras. Código, testes e telas usam estes termos e citam estas regras pelo número (ex.: `// RN-F03`).
> Itens marcados **VALIDAR COM CONTADOR** ou **VALIDAR COM ADVOGADO** estão listados em `docs/pendencias-legais.md`.

---

## 1. Glossário

### 1.1 Terra e projeto

| Termo                            | Definição                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gleba**                        | Área de terra bruta, ainda não parcelada, objeto de prospecção ou aquisição. Tem polígono georreferenciado, matrícula(s) e proprietário(s).     |
| **Matrícula**                    | Registro do imóvel no Cartório de Registro de Imóveis. Uma gleba pode ter várias.                                                               |
| **Área total**                   | Área da gleba conforme matrícula ou levantamento.                                                                                               |
| **Área aproveitável (vendável)** | Área destinada a lotes, descontadas áreas públicas (sistema viário, institucional, áreas verdes), APP e não edificáveis.                        |
| **Loteamento**                   | Parcelamento da gleba em lotes com abertura de vias, regido pela Lei 6.766/1979.                                                                |
| **Desmembramento**               | Parcelamento aproveitando o sistema viário existente. Tratado como tipo de empreendimento.                                                      |
| **Empreendimento**               | Unidade de gestão do produto: um loteamento (ou condomínio de lotes) com quadras, lotes, orçamento, viabilidade e carteira. Pertence a uma SPE. |
| **Etapa (fase de lançamento)**   | Subconjunto de quadras/lotes lançado em momento próprio. Opcional.                                                                              |
| **Quadra**                       | Agrupamento de lotes delimitado por vias.                                                                                                       |
| **Lote**                         | Unidade imobiliária vendável, com identificação (quadra + número), área, testada, preço de tabela e status.                                     |
| **Registro do loteamento**       | Ato do cartório que, após aprovação municipal, permite a venda dos lotes (art. 18 e art. 37 da Lei 6.766).                                      |
| **Licença / aprovação**          | Ato administrativo exigido para o empreendimento (diretrizes, aprovação municipal, licença ambiental etc.), com órgão, protocolo e prazos.      |
| **Contrapartida**                | Obra ou pagamento exigido pelo poder público como condição de aprovação. Entra como custo.                                                      |

### 1.2 Estrutura societária

| Termo                        | Definição                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Tenant (cliente NorteIA)** | O grupo loteador que contrata a plataforma. Unidade de isolamento de dados e de cobrança.                                                 |
| **Empresa**                  | Pessoa jurídica do grupo (holding, loteadora, administradora).                                                                            |
| **SPE**                      | Sociedade de Propósito Específico criada para um ou mais empreendimentos. Para o pequeno loteador pode ser a própria empresa.             |
| **Sócio**                    | Pessoa física ou jurídica com participação numa SPE.                                                                                      |
| **Participação**             | Percentual do sócio na SPE, com data de vigência (muda com entrada ou saída de sócios).                                                   |
| **Aporte**                   | Entrada de capital do sócio no caixa da SPE.                                                                                              |
| **Mútuo de sócio**           | Empréstimo do sócio à SPE (ou o contrário), com taxa e prazo. Não é capital e é devolvido antes da distribuição.                          |
| **Distribuição**             | Saída de lucro da SPE para os sócios.                                                                                                     |
| **Patrimônio de afetação**   | Segregação patrimonial do empreendimento. Opcional; regras tributárias próprias — **VALIDAR COM CONTADOR** a aplicabilidade a loteamento. |

### 1.3 Aquisição e permuta

| Termo                          | Definição                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Proprietário (da terra)**    | Dono da gleba antes da aquisição.                                                                                |
| **Permutante**                 | Proprietário que recebe parte do resultado em vez de, ou além de, dinheiro.                                      |
| **Permuta física**             | O permutante recebe **lotes** determinados. Esses lotes saem do estoque vendável.                                |
| **Permuta financeira**         | O permutante recebe **percentual** do VGV ou do valor efetivamente recebido, repassado conforme os recebimentos. |
| **Parceria**                   | Arranjo em que o dono da terra participa do resultado como sócio ou parceiro, não como vendedor.                 |
| **Valor econômico da permuta** | Valor de mercado dos lotes entregues na permuta física. Informação gerencial e fiscal, não é saída de caixa.     |
| **Repasse**                    | Valor devido ao permutante financeiro a cada recebimento.                                                        |

### 1.4 Comercial e contratos

| Termo                                                 | Definição                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tabela de preços**                                  | Preço de cada lote numa data, com vigência.                                                                                                              |
| **Reserva**                                           | Bloqueio temporário de um lote para um interessado, com prazo de expiração.                                                                              |
| **Proposta**                                          | Condições negociadas (preço, entrada, prazo, sistema de amortização) antes do contrato.                                                                  |
| **Contrato de venda (compromisso de compra e venda)** | Instrumento que vincula comprador, lote e plano de pagamento.                                                                                            |
| **Aditivo**                                           | Alteração formal de um contrato vigente (renegociação, troca de lote, reajuste técnico).                                                                 |
| **Cessão de contrato**                                | Transferência da posição do comprador a terceiro.                                                                                                        |
| **Quitação**                                          | Pagamento integral do contrato, que habilita a escritura.                                                                                                |
| **Escritura**                                         | Ato de transferência da propriedade após quitação.                                                                                                       |
| **Distrato**                                          | Desfazimento do contrato por iniciativa ou inadimplência do comprador (art. 32-A da Lei 6.766), com devolução de valores conforme regras parametrizadas. |
| **Comissão**                                          | Remuneração do corretor ou imobiliária, paga no ato ou proporcional ao recebido.                                                                         |

### 1.5 Carteira e cobrança

| Termo                              | Definição                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Entrada (sinal)**                | Valor pago no ato da venda.                                                                                     |
| **Saldo financiado**               | Valor do contrato menos a entrada, pago em parcelas.                                                            |
| **Price**                          | Sistema de amortização com parcelas iguais (antes do reajuste).                                                 |
| **SAC**                            | Sistema com amortização constante e parcelas decrescentes.                                                      |
| **Juros do contrato**              | Taxa de financiamento cobrada do comprador. **Não é** a TMA.                                                    |
| **Reajuste (correção monetária)**  | Atualização do saldo e das parcelas por índice (IPCA, IGP-M, INCC ou outro) na data de aniversário do contrato. |
| **Data de aniversário**            | Data em que o contrato completa cada período de reajuste.                                                       |
| **Encargos de mora**               | Multa e juros cobrados sobre parcela paga em atraso.                                                            |
| **Carteira**                       | Conjunto de parcelas a receber de contratos vigentes.                                                           |
| **Carteira nominal**               | Soma das parcelas a receber, sem desconto.                                                                      |
| **Carteira a valor presente**      | Carteira descontada à TMA e ajustada pela inadimplência esperada.                                               |
| **Inadimplência**                  | Parcela vencida e não paga. Por contrato e por empreendimento: em valor, em número de parcelas e em dias.       |
| **Renegociação**                   | Novo plano de pagamento para débitos de um contrato, formalizado por aditivo.                                   |
| **Antecipação**                    | Pagamento de parcelas futuras antes do vencimento, com desconto dos juros não decorridos.                       |
| **Conciliação**                    | Vinculação automática de cada crédito recebido (boleto/Pix) à parcela correspondente.                           |
| **Régua de cobrança**              | Sequência configurável de mensagens antes e depois do vencimento.                                               |
| **Cessão/antecipação de carteira** | Venda de recebíveis a terceiro (securitizadora, fundo, banco) com deságio.                                      |

### 1.6 Finanças e indicadores

| Termo                                 | Definição                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VGV (Valor Geral de Vendas)**       | Soma dos preços de todos os lotes vendáveis. **VGV total** = estoque inteiro; **VGV vendido** = soma dos contratos firmados. Conceito comercial, não é caixa. |
| **Recebido**                          | Dinheiro que efetivamente entrou no caixa.                                                                                                                    |
| **Resultado**                         | Receitas menos custos e tributos (econômico).                                                                                                                 |
| **Fluxo de caixa**                    | Lista de lançamentos datados de entradas e saídas, agregados por mês. Fonte única de todos os indicadores.                                                    |
| **Lançamento**                        | Item do fluxo: data, empresa, SPE, empreendimento, centro de custo, natureza, categoria, valor e origem.                                                      |
| **Natureza**                          | **Realizado** (aconteceu), **comprometido** (contratado e não pago), **carteira** (a receber de contratos), **projetado** (previsto a partir de premissas).   |
| **Origem**                            | O registro que gerou o lançamento (parcela, pagamento, contrato de fornecedor, premissa etc.).                                                                |
| **Centro de custo**                   | Classificação do lançamento no plano de contas (terreno, aprovação, terraplenagem, drenagem, comissão…).                                                      |
| **Orçado / revisado**                 | Custo previsto na viabilidade aprovada / na última revisão.                                                                                                   |
| **Custo final projetado**             | Realizado + comprometido + projetado restante.                                                                                                                |
| **TMA (taxa mínima de atratividade)** | Taxa de desconto definida pelo usuário para VPL e payback descontado.                                                                                         |
| **TIR**                               | Taxa que zera o VPL do fluxo. Mensal (fluxo mensal) e anual equivalente.                                                                                      |
| **XIRR**                              | TIR calculada com as datas reais de cada lançamento.                                                                                                          |
| **VPL**                               | Soma do fluxo descontado à TMA até a data-base.                                                                                                               |
| **Payback simples / descontado**      | Primeiro mês em que o saldo acumulado (simples / descontado à TMA) volta a ser ≥ 0.                                                                           |
| **Exposição máxima de caixa**         | O valor mais negativo do saldo acumulado e o mês em que ocorre. Indica quanto capital o empreendimento consome no pior momento.                               |
| **Necessidade de aporte**             | Valor que precisa entrar, mês a mês, para que o caixa não fique abaixo do mínimo definido.                                                                    |
| **Margem sobre VGV**                  | Resultado ÷ VGV.                                                                                                                                              |
| **Retorno sobre capital próprio**     | Resultado (ou TIR) calculado sobre o fluxo dos sócios: aportes e distribuições.                                                                               |
| **Cenário**                           | Conjunto de premissas (pessimista, base, otimista ou personalizado).                                                                                          |
| **Teste de estresse**                 | Aplicação de choques (vendas mais lentas, obra mais cara, mais inadimplência, preço menor, atraso) sobre um cenário.                                          |
| **Data-base / mês 0**                 | Mês de referência do fluxo, contado a partir de 0.                                                                                                            |
| **Valores reais / nominais**          | Reais: em moeda da data-base, sem inflação projetada. Nominais: com inflação projetada.                                                                       |
| **Visão caixa / competência**         | Gerencial (quando o dinheiro entra ou sai) / contábil (quando o fato ocorre).                                                                                 |

---

## 2. Regras de negócio

As regras são numeradas por grupo. **Nenhuma pode ser violada por configuração**, exceto quando o texto diz que é parâmetro.

### 2.1 Gerais e de plataforma (RN-G)

- **RN-G01** — Todo dado de cliente pertence a um tenant. Nenhum usuário lê, cria, altera ou apaga dado de tenant do qual não é membro com permissão. A garantia é feita no banco (RLS), não apenas na aplicação.
- **RN-G02** — O sistema é multiempresa e multi-SPE desde o primeiro dia. O pequeno loteador recebe uma empresa e uma SPE criadas automaticamente, sem precisar configurá-las.
- **RN-G03** — Toda alteração em contrato, parcela, custo, parâmetro, preço, status de lote ou permissão gera registro de auditoria com quem, quando, valor anterior, valor novo e, quando exigido, motivo.
- **RN-G04** — Registros financeiros não são apagados. Cancelamentos são lógicos e correções são feitas por estorno.
- **RN-G05** — Valores monetários são armazenados em centavos (inteiro). Cálculos intermediários usam decimal de precisão fixa. Ponto flutuante nunca é usado para dinheiro.
- **RN-G06** — Parâmetros legais, tributários e contratuais (alíquotas, índices, multas, juros de mora, percentuais de distrato, regras de permuta) não existem no código. Vivem em tabelas com vigência e escopo (plataforma → empresa → empreendimento → contrato). Alterar um parâmetro cria nova vigência; não sobrescreve a anterior.
- **RN-G07** — Funcionalidades e limites (ex.: número de lotes sob gestão) são liberados por plano contratado.
- **RN-G08** — Interface em português do Brasil; moeda `R$ 1.234,56`; datas `dd/mm/aaaa`; fuso `America/Sao_Paulo`.

### 2.2 Motor financeiro (RN-F)

- **RN-F01** — Todo indicador é calculado a partir de **um único fluxo de caixa mensal com datas reais**. Nenhum indicador é digitado ou editado.
- **RN-F02** — Cada lançamento tem data, empresa, SPE, empreendimento, centro de custo, natureza (realizado, comprometido, carteira, projetado), categoria e origem.
- **RN-F03** — Sem dupla contagem: orçado = realizado + comprometido + projetado restante, por centro de custo. Um contrato de fornecedor substitui o orçamento correspondente; um pagamento substitui o comprometido correspondente.
- **RN-F04** — O fluxo é indexado a partir do **mês 0** (data-base). O mês 0 não é descontado.
- **RN-F05** — **TIR anual = (1 + TIR mensal)^12 − 1.** O sistema também oferece XIRR com datas reais (base 365 dias).
- **RN-F06** — Quando o fluxo tiver mais de uma TIR possível (várias trocas de sinal), o sistema avisa em vez de escolher uma em silêncio.
- **RN-F07** — O VPL usa a **TMA configurada pelo usuário**, nunca a taxa de juros do contrato do comprador.
- **RN-F08** — **Payback** (simples ou descontado) é o primeiro mês em que o saldo acumulado volta a ser ≥ 0, depois de ter ficado negativo.
- **RN-F09** — **Exposição máxima** é o menor saldo acumulado do fluxo, apresentado em valor absoluto, junto com o mês em que ocorre.
- **RN-F10** — As telas e os relatórios separam sempre: **VGV vendido** (comercial), **recebido** (financeiro), **carteira a receber** e **resultado** (econômico). VGV vendido nunca é apresentado como caixa.
- **RN-F11** — Projeções são feitas por padrão em **valores reais**, com TMA real. A visão nominal aplica uma premissa de inflação e exige TMA nominal. O motor recusa combinar fluxo real com taxa nominal e vice-versa.
- **RN-F12** — Receita de juros do financiamento ao comprador e receita de reajuste são classificadas separadamente da receita imobiliária (preço do lote).
- **RN-F13** — A inadimplência esperada nas projeções é um percentual aplicado proporcionalmente a cada parcela futura. Por padrão, a entrada não sofre inadimplência (parâmetro).
- **RN-F14** — Tributos sobre receita incidem sobre o valor **efetivamente recebido**, no mês do recebimento, conforme o regime e a vigência dos parâmetros da SPE.
- **RN-F15** — O motor é determinístico: a data de referência ("hoje") é sempre um parâmetro de entrada.
- **RN-F16** — Ao aprovar uma viabilidade, o sistema grava um **plano original imutável** (premissas e fluxo). Revisões geram nova versão; só o papel Dono pode revisar, com justificativa. A comparação mostra original × última revisão × realizado+projetado.
- **RN-F17** — O motor reproduz o **caso de referência** (seção 3) dentro das tolerâncias. Esse teste nunca pode ser desativado.

### 2.3 Terreno e permuta (RN-T)

- **RN-T01** — Na permuta física, os lotes do permutante ficam com status **permuta**, saem do VGV vendável e não podem ser reservados nem vendidos pelo loteador.
- **RN-T02** — Na permuta física, o custo do terreno entra no fluxo apenas pelo que foi efetivamente desembolsado. O valor econômico dos lotes permutados não é lançado como saída de caixa, para não contar o terreno duas vezes. **VALIDAR COM CONTADOR** o tratamento contábil e fiscal.
- **RN-T03** — Na permuta financeira, o repasse é calculado **a cada recebimento**, pelo percentual e pela base definidos no contrato de permuta (VGV ou recebido).
- **RN-T04** — Se e como a inadimplência e o distrato abatem o repasse ao permutante são definidos no contrato de permuta (parâmetros), não no código.
- **RN-T05** — O permutante tem acesso a um extrato somente leitura com a base de cálculo e cada repasse.

### 2.4 Comercial (RN-C)

- **RN-C01** — **Venda de lote só depois do registro do loteamento** (Lei 6.766). Sem a data de registro, o sistema bloqueia a venda. A exceção (se existir) exige permissão específica e justificativa, gravadas em auditoria. **VALIDAR COM ADVOGADO** se a exceção deve existir ou se o bloqueio é absoluto.
- **RN-C02** — Um lote tem no máximo **uma reserva ativa** e no máximo **um contrato vigente ou aguardando assinatura**. Garantido no banco, inclusive quando duas pessoas tentam ao mesmo tempo.
- **RN-C03** — Uma reserva expira no prazo configurado. Reserva expirada não bloqueia o lote, mesmo antes de a rotina de limpeza rodar.
- **RN-C04** — Transições de status do lote: disponível → reservado → vendido; disponível ↔ bloqueado; permuta é fixo; vendido → disponível somente por distrato concluído.
- **RN-C05** — A venda usa o preço da tabela vigente na data. Desconto acima do limite configurado exige aprovação de um papel autorizado.
- **RN-C06** — A comissão é calculada pela regra do corretor ou da imobiliária: no ato ou proporcional ao recebido. No modo proporcional, a comissão acompanha a inadimplência e o distrato conforme a regra configurada.
- **RN-C07** — O corretor vê disponibilidade, as próprias reservas, propostas e comissões. Não vê dados financeiros do empreendimento.

### 2.5 Contratos e carteira (RN-K)

- **RN-K01** — O plano de pagamento do contrato é gerado pelo motor (Price ou SAC), com entrada, número de parcelas, taxa de juros e data da primeira parcela.
- **RN-K02** — Na tabela Price, a diferença de arredondamento vai para a **última parcela**, de modo que a soma das amortizações seja exatamente igual ao saldo financiado.
- **RN-K03** — O reajuste por índice é aplicado na data de aniversário, com o índice e a periodicidade definidos no contrato, usando somente índices **já publicados**. **VALIDAR COM ADVOGADO** a periodicidade mínima e as regras de índice negativo.
- **RN-K04** — Multa e juros de mora são parâmetros do contrato, limitados pelos tetos legais configurados. **VALIDAR COM ADVOGADO** os tetos.
- **RN-K05** — A conciliação é idempotente: o mesmo aviso de pagamento recebido duas vezes não baixa a parcela duas vezes.
- **RN-K06** — Pagamento a menor gera baixa parcial, e o saldo continua em aberto. Pagamento a maior gera crédito a devolver ou a abater, conforme configuração.
- **RN-K07** — Renegociação e troca de lote são feitas por **aditivo**. O plano anterior é preservado no histórico.
- **RN-K08** — Na antecipação, os juros não decorridos são descontados pela taxa do contrato.
- **RN-K09** — A quitação só é emitida com saldo zero e sem encargos pendentes.
- **RN-K10** — A régua de cobrança respeita o pedido de descadastramento (opt-out) e registra cada mensagem enviada.

### 2.6 Distrato (RN-D)

- **RN-D01** — Simulação e execução do distrato seguem o art. 32-A da Lei 6.766 (incluído pela Lei 13.786/2018), com **todos os percentuais e prazos como parâmetros** por empresa e por contrato (cláusula penal e despesas administrativas, taxa de fruição, encargos, número de parcelas da devolução, prazos). **VALIDAR COM ADVOGADO** os valores padrão e a jurisprudência aplicável.
- **RN-D02** — A devolução é corrigida pelo índice do contrato, conforme os parâmetros.
- **RN-D03** — Concluído o distrato, as parcelas futuras são canceladas, a devolução entra no fluxo como saída (categoria própria) e o lote volta ao estoque com status disponível.
- **RN-D04** — O distrato reflete em comissão e em repasse a permutante conforme as regras de cada contrato (RN-C06, RN-T04).

### 2.7 Sócios (RN-S)

- **RN-S01** — O resultado e o fluxo são rateados entre os sócios pela participação **vigente na data de cada lançamento**.
- **RN-S02** — Aporte, mútuo e distribuição são lançamentos do fluxo da SPE e também do fluxo de cada sócio, para cálculo do retorno sobre capital próprio.
- **RN-S03** — O sócio só vê, no portal, as SPEs em que participa.

### 2.8 Fiscal e contábil (RN-X)

- **RN-X01** — Alíquotas e regras tributárias são parâmetros por regime e por período de vigência. O primeiro regime implementado é o lucro presumido. **VALIDAR COM CONTADOR** a composição usada (PIS, COFINS, IRPJ, CSLL) e as bases de cálculo.
- **RN-X02** — A transição IBS/CBS (LC 214/2025) é modelada como parâmetros com vigência: alíquota reduzida para operações com imóveis, redutor de ajuste e redutor social por lote, aplicados por pagamento e, em parceria, proporcionalmente a cada parceiro. Nenhum valor fixo no código. **VALIDAR COM CONTADOR** todos os valores e regras de transição.
- **RN-X03** — A visão gerencial (caixa) e a visão contábil (competência) são relatórios distintos e nunca se misturam numa mesma tela sem rótulo.
- **RN-X04** — DIMOB e informe de rendimentos do comprador são gerados a partir dos recebimentos registrados, não de projeções.

### 2.9 Inteligência artificial (RN-I)

- **RN-I01** — A IA **nunca calcula indicadores financeiros**: consulta o motor por ferramentas e explica o resultado, citando a origem.
- **RN-I02** — A IA respeita as permissões do usuário que pergunta.
- **RN-I03** — Lançamentos sugeridos pela IA (ex.: leitura de nota fiscal) exigem confirmação humana.

---

## 3. Caso de referência (teste obrigatório do motor)

Fonte: especificação do produto. Implementado como teste automatizado e como **empreendimento de demonstração** no ambiente de testes.

### 3.1 Premissas (valores reais)

| Item                 | Valor                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Lotes                | 120 (18 em permuta física ao dono da terra; 102 à venda a R$ 90.000)                        |
| Terreno              | R$ 400.000 no mês 0                                                                         |
| Aprovação e registro | R$ 350.000, igual nos meses 1–12                                                            |
| Infraestrutura       | R$ 3.000.000, igual nos meses 13–30                                                         |
| Marketing e stand    | R$ 300.000, igual nos meses 13–36                                                           |
| Administração        | R$ 8.000/mês, meses 1–48                                                                    |
| Vendas               | A partir do mês 13, 4 lotes/mês (último mês 2; termina no mês 38)                           |
| Pagamento            | 10% de entrada no mês da venda; 90% em 120 parcelas Price a 0,5% a.m., a 1ª no mês seguinte |
| Comissão             | 5% do valor do lote, no mês da venda                                                        |
| Inadimplência        | 7% de cada parcela nunca recebido; entrada recebida integralmente                           |
| Tributos             | 5,93% sobre todo valor recebido                                                             |
| TMA                  | 1,2% a.m.                                                                                   |

### 3.2 Resultados esperados

| Indicador             | Esperado               | Tolerância  |
| --------------------- | ---------------------- | ----------- |
| VGV vendido           | R$ 9.180.000           | exato       |
| Total recebido        | R$ 11.154.525          | ± R$ 1.000  |
| Custos (sem tributos) | R$ 4.893.000           | exato       |
| Tributos              | R$ 661.463             | ± R$ 100    |
| Lucro nominal         | R$ 5.600.062           | ± R$ 1.000  |
| TIR mensal            | 1,48%                  | ± 0,01 p.p. |
| TIR anual             | 19,3%                  | ± 0,1 p.p.  |
| VPL a 1,2% a.m.       | R$ 515.116             | ± R$ 1.000  |
| Exposição máxima      | R$ 3.447.951 no mês 30 | ± R$ 1.000  |
| Payback simples       | mês 76                 | exato       |
| Payback descontado    | mês 115                | exato       |

### 3.3 Estresse (TIR anual esperada)

| Choque                         | TIR anual |
| ------------------------------ | --------- |
| Vendas de 2 lotes/mês          | 15,3%     |
| Infraestrutura de R$ 3.450.000 | 16,6%     |
| Inadimplência de 15%           | 16,9%     |
| Preço de R$ 81.000             | 16,2%     |

Um protótipo descartável reproduziu todos esses valores com as regras RN-F04, RN-F08, RN-F09, RN-F13 e RN-F14 (ver `docs/arquitetura.md`, §15).
