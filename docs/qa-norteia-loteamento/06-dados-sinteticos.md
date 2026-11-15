# QA — Dados sintéticos de teste

> Data: 15/11/2026. **Todos os dados são fictícios.**
>
> - E-mails usam o domínio reservado `@exemplo.test`.
> - Nomes são genéricos ("Comprador QA a", "Comprador sintético 17").
> - CPFs são números de teste matematicamente válidos (`52998224725`, `11144477735`), usados só como exemplo de formato e sem vínculo com pessoa conhecida.
> - Não há CNPJ, telefone, documento, token ou dado financeiro real.
> - Os índices econômicos dos testes pgTAP são séries sintéticas declaradas em cada teste. O banco local carrega as séries do SGS/BCB apenas pelas migrations (IPCA 433, IGP-M 189, INPC 188, INCC 192).

## 1. Cenário padrão: `testes.qa_cenario(r)` (`supabase/tests/auxiliares/qa_cenario.psql`)

Criado pelo usuário logado, que vira dono da loteadora. Os ids ficam em `teste.<r>_<nome>`.

| Grupo            | Conteúdo                                                                                                              | Ids                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Tenant           | "Loteadora QA r" com empresa e SPE automáticas; parâmetro próprio de multa 1,5% e limite de desconto de 5%            | `r_tenant`, `r_spe`                    |
| Estrutura        | "Residencial QA r" (Goiânia/GO), registrado em 15/01/2026, em vendas; quadra A com 12 lotes de 300 m² a R$ 120.000,00 | `r_emp`, `r_l1`…`r_l12`                |
| Comprador        | "Comprador QA r", CPF de teste, `comprador.r@exemplo.test` e token de descadastro                                     | `r_comprador`, `r_token_lembrete`      |
| Venda e contrato | Lote 1: R$ 120.000,00 = entrada de 20.000,00 + 4 × 25.000,00 (SAC, 0%, 1ª em 01/03/2026), índice IPCA                 | `r_venda`, `r_contrato`, `r_p0`…`r_p4` |
| Recebimentos     | Entrada paga (referência `qa-r-0`); parcela 1 parcial (10.000,00)                                                     | `r_rec0`, `r_rec1`                     |
| Crédito          | R$ 50,00 por pagamento em duplicidade                                                                                 | `r_cred`                               |
| Comercial        | Reserva no lote 2; proposta no lote 3 (Price 0,5%, 12×); pedido de desconto no lote 4 (R$ 90.000,00)                  | `r_res`, `r_prop`, `r_aprov`           |
| Sócios           | "Sócio QA r", 100% desde 01/01/2026; aporte de R$ 1.000,00                                                            | `r_socio`, `r_mov`                     |
| Permuta          | Permutante com CPF de teste; permuta financeira de 10% do recebido; repasse de R$ 10,00                               | `r_perm`, `r_permuta`, `r_rep`         |
| Custos           | Fornecedor; contrato de terraplenagem de R$ 10.000,00; conta de administração de R$ 500,00 paga                       | `r_forn`, `r_cf`, `r_conta`            |
| Portal           | Convite de comprador (token em `teste.r_convite_portal`)                                                              | —                                      |

**Tenants dos testes:**

- **A:** dona com todas as permissões, dados completos.
- **B:** outra dona com dados completos, usada como "atacante" com permissão máxima em B.
- **C:** usuário autenticado sem loteadora (`intruso@exemplo.test`).
- Também o papel anônimo.

**Usuários por papel** (046): dono, financeiro, comercial_gestor, engenharia, contador, socio_leitura e corretor, todos convidados para A. Também há a dona de A que é membro de B (como `dono`).

## 2. Datas de borda

| Origem                               | Casos                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oraculo.test.ts` (MOT-UNID-2xx/3xx) | Vencimento 31 nos meses de 30 dias e em fevereiro; 28/02 → 01/03 em ano comum (1 dia) e bissexto (2 dias); 2100 não bissexto e 2000 bissexto; virada de ano; 1 dia, 30 dias, 1 ano e 5 anos de atraso; 3.000 pares aleatórios entre 1900 e 2100; todo dia de 2023 a 2029 somado de −24 a +36 meses |
| 011 (pgTAP)                          | Aniversário de reajuste, índice não publicado, revisão de índice                                                                                                                                                                                                                                   |
| 047                                  | Pagamento antes da venda, venda +400 dias, 1ª parcela antes da venda                                                                                                                                                                                                                               |

## 3. Dados de concorrência (`scripts/qa/concorrencia.sh`)

A cada repetição, uma loteadora nova `c<epoch><n>` é criada com o cenário padrão, mais dois sócios extras. O sócio 1 cai para 20% em 01/07/2026. As duas sessões disputam:

- lote 5 (reservas);
- lote 6 (vendas);
- parcelas 2 e 3 (baixas);
- crédito (usos);
- recebimento 1 (estornos);
- pedido de desconto (decisões);
- participações de 50% + 50% (com os 20% existentes);
- contrato de fornecedor (medições de 60%);
- lote 7 (reserva × venda).

## 4. Dados de carga (`scripts/qa/carga.sh`)

| Item         | Volume                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Lotes        | 5.000 (50 quadras × 100; 250–449 m²; R$ 90.000,00–94.900,00)                                                 |
| Contratos    | 3.000 por `importar_carteira` (10 arquivos de 300), vendas mensais de jan/2024 a jun/2026                    |
| Parcelas     | 201.000 (entrada de 9.000,00 + 66 parcelas; a última fecha o centavo)                                        |
| Recebimentos | 56.750 (vencidas pagas; 1 em cada 12 contratos em atraso a partir da 4ª; 1 em cada 20 com pagamento parcial) |
| Auditoria    | ~287.000 linhas geradas pelos gatilhos                                                                       |

O plano do tenant de carga é trocado para "Empresarial" pelo dono do banco, só na preparação.

## 5. Estratégia de limpeza segura

1. **pgTAP:** cada arquivo roda em `begin … rollback`, então nada persiste.
2. **Concorrência e carga:** só rodam no contêiner local do Supabase CLI; o script recusa outro banco. Os dados ficam no banco local até `pnpm exec supabase db reset`, que recria tudo a partir das migrations. Nenhum script apaga linha a linha, porque registros financeiros não são apagáveis (RN-G04).
3. **Produção:** só leitura (`scripts/qa/invariantes.sh` usa `begin transaction read only`).
