-- Auditoria de QA (docs/qa-norteia-loteamento/07-relatorio-execucao.md): achados de integridade
-- financeira. Cada achado é um teste do comportamento ESPERADO marcado como `todo`: aparece no
-- relatório do pgTAP como falha conhecida sem quebrar o CI e, quando o produto for corrigido,
-- passa a acusar "passou inesperadamente" — então retire o `todo`. Nenhuma correção foi feita.
-- Também ficam aqui as salvaguardas que a auditoria confirmou funcionando.
begin;
\ir ../auxiliares/testes.psql
\ir ../auxiliares/qa_cenario.psql
select plan(24);

select testes.guardar('dona_a', testes.criar_usuario('dona.a@exemplo.test', 'Dona A'));
select testes.entrar(testes.id('dona_a'));
select testes.qa_cenario('a');

-- Venda Price a 1% a.m.: 110.000,00 de entrada + 2 parcelas sobre 10.000,00.
select testes.guardar('v2', public.vender_lote(testes.id('a_l6'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 11000000, 'parcelas', 2,
  'juros_mensal', 0.01, 'sistema', 'price', 'primeira_parcela_em', '2026-03-01')));
select testes.guardar('v3', public.vender_lote(testes.id('a_l9'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 11000000, 'parcelas', 2,
  'juros_mensal', 0.01, 'sistema', 'price', 'primeira_parcela_em', '2026-03-01')));

-- ── Salvaguardas confirmadas ──
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), current_date + 365, 100000) $$,
  '23514', null, 'REC-BANCO-101: pagamento com data no futuro é recusado');
select lives_ok($$ select public.estornar_recebimento(testes.id('a_rec1'), 'Estorno de teste QA') $$, 'REC-BANCO-102: estorno');
select throws_ok($$ select public.estornar_recebimento(testes.id('a_rec1'), 'Estorno repetido QA') $$,
  null, 'O recebimento já foi estornado.', 'REC-BANCO-103: o mesmo recebimento não é estornado duas vezes (INV-009)');
select is((select pago_centavos || '/' || situacao from public.parcelas where id = testes.id('a_p1')), '0/aberta',
  'REC-BANCO-104: estorno devolve a parcela ao saldo anterior');
select is((select count(*) from public.recebimentos where id = testes.id('a_rec1') and estornado_em is not null), 1::bigint,
  'REC-BANCO-105: o recebimento estornado continua no histórico (RN-G04)');
select throws_ok($$ select public.aplicar_credito(testes.id('a_cred'), testes.id('a_p2'), 5001) $$,
  null, 'O valor deve ser positivo e no máximo o saldo do crédito.', 'CRE-BANCO-101: crédito não é usado acima do saldo (INV-014)');
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 2500001) $$,
  null, null, 'REC-BANCO-106: principal acima do saldo da parcela é recusado (RN-K06: o excedente vira crédito)');

-- ── A-01 (ALTA): o banco aceita plano de parcelas que não corresponde às condições da venda ──
-- RN-K01: o plano é gerado pelo motor (Price/SAC, taxa, prazo, 1ª parcela). criar_contrato só
-- confere soma das amortizações, entrada, quantidade e números; juros e datas não são conferidos.
select todo('A-01: criar_contrato não confere juros nem vencimentos com a venda', 2);
select throws_ok($$ select public.criar_contrato(testes.id('v2'), '[
  {"numero":0,"vencimento":"2026-02-01","valor_centavos":11000000,"amortizacao_centavos":11000000,"juros_centavos":0},
  {"numero":1,"vencimento":"2026-03-01","valor_centavos":500000,"amortizacao_centavos":500000,"juros_centavos":0},
  {"numero":2,"vencimento":"2026-04-01","valor_centavos":500000,"amortizacao_centavos":500000,"juros_centavos":0}]'::jsonb) $$,
  '23514', null, 'CON-BANCO-101: venda Price a 1% a.m. não aceita parcelas sem juros');
select throws_ok($$ select public.criar_contrato(testes.id('v3'), '[
  {"numero":0,"vencimento":"2026-02-01","valor_centavos":11000000,"amortizacao_centavos":11000000,"juros_centavos":0},
  {"numero":1,"vencimento":"2099-03-01","valor_centavos":507512,"amortizacao_centavos":497512,"juros_centavos":10000},
  {"numero":2,"vencimento":"2099-04-01","valor_centavos":507513,"amortizacao_centavos":502488,"juros_centavos":5025}]'::jsonb) $$,
  '23514', null, 'CON-BANCO-102: vencimentos precisam seguir a 1ª parcela da venda (março e abril de 2026)');

-- ── A-02 (ALTA): encargos de mora não são conferidos com o contrato nem com o atraso ──
-- RN-K04: multa e juros de mora são parâmetros do contrato (aqui multa 1,5%, juros 1% a.m.).
select todo('A-02: registrar_recebimento aceita multa e juros informados livremente', 2);
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 100000, 500000, 0) $$,
  '23514', null, 'REC-BANCO-107: pagamento no dia do vencimento não tem multa');
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-11', 100000, 50000, 0) $$,
  '23514', null, 'REC-BANCO-108: multa acima do percentual do contrato (1,5% de 1.000,00 = 15,00) é recusada');

-- ── A-03 (MÉDIA): recebimento datado antes da venda ──
select todo('A-03: recebimento com data anterior à venda é aceito', 1);
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2020-01-01', 100000) $$,
  '23514', null, 'REC-BANCO-109: pagamento não pode ser anterior à venda (01/02/2026)');

-- ── A-04 (MÉDIA, HIPÓTESE de regra): desconto no recebimento sem limite nem aprovação ──
select todo('A-04: desconto de 99,99% no recebimento é aceito sem alçada (regra não documentada)', 1);
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 100000, 0, 0, 99999) $$,
  null, null, 'REC-BANCO-110: desconto acima de um limite configurado exige aprovação');

-- ── A-05 (MÉDIA, HIPÓTESE de regra): condições da venda sem limites de plausibilidade ──
select todo('A-05: venda aceita juros de 50% a.m., 1ª parcela antes da venda e data de venda no futuro', 3);
select throws_ok($$ select public.vender_lote(testes.id('a_l7'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 0, 'parcelas', 480, 'juros_mensal', 0.5,
  'sistema', 'price', 'primeira_parcela_em', '2026-03-01')) $$, '23514', null,
  'VEN-BANCO-101: taxa de juros acima de um teto configurado é recusada');
select throws_ok($$ select public.vender_lote(testes.id('a_l8'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 0, 'parcelas', 2, 'juros_mensal', 0,
  'sistema', 'sac', 'primeira_parcela_em', '2025-01-01')) $$, '23514', null,
  'VEN-BANCO-102: primeira parcela não pode vencer antes da venda');
select throws_ok($$ select public.vender_lote(testes.id('a_l10'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', current_date + 400, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0,
  'juros_mensal', 0, 'sistema', 'sac')) $$, '23514', null, 'VEN-BANCO-103: venda não é datada mais de um ano no futuro');

-- ── A-06 (ALTA): status "permuta" do lote muda por edição direta (RN-T01, RN-C04) ──
-- validar_status_lote protege só reservado/vendido. Quem tem empreendimento.editar devolve ao
-- estoque um lote de permuta física vigente — e ele pode ser vendido — ou marca "permuta" sem contrato.
select testes.guardar('fisica', public.criar_permuta(testes.id('a_emp'), testes.id('a_perm'),
  '{"tipo":"fisica","valor_economico_centavos":100}', array[testes.id('a_l11')]));
select todo('A-06: status permuta do lote não é protegido', 2);
select throws_ok($$ update public.lotes set status = 'disponivel' where id = testes.id('a_l11') $$,
  '23514', null, 'LOT-BANCO-101: lote de permuta física vigente não volta ao estoque por edição direta');
select throws_ok($$ update public.lotes set status = 'permuta' where id = testes.id('a_l12') $$,
  '23514', null, 'LOT-BANCO-102: status permuta só nasce de um contrato de permuta física');
select lives_ok($$ select public.vender_lote(testes.id('a_l11'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', current_date, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0, 'juros_mensal', 0, 'sistema', 'sac')) $$,
  'A-06 confirmado: o lote do permutante foi vendido com a permuta física ainda vigente');

-- ── A-08 (ALTA): dono troca o próprio plano direto pela API (RN-G07, INV-019) ──
-- A política de UPDATE de tenants (tenant.administrar) não restringe colunas e authenticated tem
-- UPDATE em plano_id: o limite de lotes do plano é contornado sem contratação.
select todo('A-08: plano_id do tenant é editável pelo próprio cliente', 1);
select throws_ok($$ update public.tenants set plano_id = 'empresarial' where id = testes.id('a_tenant') $$,
  null, null, 'TEN-SEG-101: o cliente não troca o próprio plano (só a plataforma)');
select is((select plano_id from public.tenants where id = testes.id('a_tenant')), 'empresarial',
  'A-08 confirmado: o plano mudou para Empresarial (sem limite de lotes)');

-- ── A-10 (MÉDIA): nova baixa com a referência de um recebimento estornado some em silêncio ──
-- A idempotência (RN-K05) devolve o id do recebimento ESTORNADO: sem erro, sem baixa.
select testes.guardar('r77', public.registrar_recebimento(testes.id('a_p4'), '2026-06-01', 2500000, p_referencia => 'aviso-77'));
select public.estornar_recebimento(testes.id('r77'), 'Banco devolveu o pagamento (QA)');
select todo('A-10: reuso da referência após estorno devolve o recebimento estornado sem baixar', 1);
select isnt(public.registrar_recebimento(testes.id('a_p4'), '2026-06-05', 2500000, p_referencia => 'aviso-77'), testes.id('r77'),
  'REC-BANCO-111: nova baixa após estorno não devolve o recebimento estornado (baixa ou recusa explícita)');
select is((select pago_centavos from public.parcelas where id = testes.id('a_p4')), 0::bigint,
  'A-10 confirmado: a parcela continua em aberto, e quem chamou recebeu um id como se tivesse baixado');

-- Confirmação de que os achados são reais (sem todo): o banco aceitou as operações acima.
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p3'), '2026-05-01', 100000, 500000, 0) $$,
  'A-02 confirmado: multa de 5.000,00 sobre 1.000,00 pagos no vencimento foi gravada');

select * from finish();
rollback;
