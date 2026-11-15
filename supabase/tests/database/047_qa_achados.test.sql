-- Auditoria de QA (docs/qa-norteia-loteamento/07-relatorio-execucao.md): achados de integridade
-- financeira. Cada achado é um teste do comportamento ESPERADO marcado como `todo`: aparece no
-- relatório do pgTAP como falha conhecida sem quebrar o CI e, quando o produto for corrigido,
-- passa a acusar "passou inesperadamente" — então retire o `todo`. Nenhuma correção foi feita.
-- Também ficam aqui as salvaguardas que a auditoria confirmou funcionando.
begin;
\ir ../auxiliares/testes.psql
\ir ../auxiliares/qa_cenario.psql
select plan(37);

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

-- ── A-01 (ALTA, CORRIGIDO em 20261115120000): o plano do contrato é exatamente o da venda ──
-- RN-K01: o banco recalcula o plano (privado.plano_da_venda, idêntico ao motor) e recusa divergência.
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
select lives_ok($$ select public.criar_contrato(testes.id('v2'), testes.plano_da_venda(testes.id('v2'))) $$,
  'CON-BANCO-103: o plano oficial da venda (Price 1% a.m.) é aceito');
select is((select string_agg(p.valor_centavos || '/' || p.juros_centavos, ' ' order by p.numero) from public.parcelas p
            join public.contratos c on c.id = p.contrato_id where c.venda_id = testes.id('v2')),
  '11000000/0 507512/10000 507513/5025', 'CON-BANCO-104: Price 2× sobre 10.000,00 a 1% a.m. (prestação 5.075,12; a última fecha o centavo)');

-- ── A-02…A-05 (CORRIGIDOS em 20261115130000, D-122): regras de cada loteadora ──
-- Decisão do dono do produto: "cada loteadora tem suas regras". Sem regra definida vale a sugestão
-- da plataforma, que mantém o comportamento anterior; definida a regra, o banco a aplica.

-- A-02: encargos do recebimento manual.
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p3'), '2026-05-01', 100000, 500000, 0) $$,
  'REC-BANCO-107: sem regra da loteadora (sugestão "informado"), encargos informados pela equipe são aceitos');
select public.definir_parametro(testes.id('a_tenant'), 'carteira.encargos_recebimento', '"contrato"', '2026-01-01', 'Encargos conferidos com o contrato (QA)');
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 100000, 500000, 0) $$,
  '23514', null, 'REC-BANCO-108: com a regra "contrato", pagamento no dia do vencimento não tem multa');
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-11', 100000, 50000, 0) $$,
  '23514', null, 'REC-BANCO-109: multa acima da do contrato (2% de 1.000,00 = 20,00) é recusada');
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-11', 100000, 2000, 333) $$,
  'REC-BANCO-110: encargos do contrato (multa 20,00 + juros 1% a.m. × 10/30 dias = 3,33) são aceitos');
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-11', 100000, 2000, 333, 2333) $$,
  'REC-BANCO-111a: a dispensa dos encargos entra como desconto');

-- A-03: pagamento antes da data da venda (01/02/2026).
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-01-20', 1000, 0, 0) $$,
  'REC-BANCO-112a: sem regra, sinal pago antes da venda é aceito');
select public.definir_parametro(testes.id('a_tenant'), 'carteira.pagamento_antes_venda_dias', '15', '2020-01-01', 'Sinal até 15 dias antes (QA)');
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-01-10', 1000, 0, 0) $$,
  '23514', null, 'REC-BANCO-113a: com a regra de 15 dias, pagamento 22 dias antes da venda é recusado');
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-01-20', 1000, 0, 0) $$,
  'REC-BANCO-114: e 12 dias antes é aceito');

-- A-04: desconto no recebimento.
select public.definir_parametro(testes.id('a_tenant'), 'carteira.desconto_recebimento_maximo', '0.05', '2020-01-01', 'Até 5% sem o dono (QA)');
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 100000, 0, 0, 99999) $$,
  'REC-BANCO-115: o dono da loteadora concede desconto acima do limite');
select set_config('teste.cfin', public.criar_convite(testes.id('a_tenant'), 'fin.qa@exemplo.test', 'financeiro'), true);
reset role;
select testes.guardar('fin', testes.criar_usuario('fin.qa@exemplo.test', 'Financeiro QA'));
select testes.entrar(testes.id('fin'));
select public.aceitar_convite(current_setting('teste.cfin'));
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 100000, 0, 0, 99999) $$,
  '23514', null, 'REC-BANCO-116: financeiro não concede desconto acima de 5% sem o dono');
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 100000, 0, 0, 5000) $$,
  'REC-BANCO-117: dentro do limite, o financeiro concede o desconto');
select testes.entrar(testes.id('dona_a'));

-- A-05: condições da venda.
select lives_ok($$ select public.vender_lote(testes.id('a_l7'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 0, 'parcelas', 480, 'juros_mensal', 0.5,
  'sistema', 'price', 'primeira_parcela_em', '2026-03-01')) $$, 'VEN-BANCO-101: sem regra, juros de 50% a.m. são aceitos');
select public.definir_parametro(testes.id('a_tenant'), 'comercial.juros_mensal_maximo', '0.02', '2020-01-01', 'Até 2% a.m. (QA)');
select public.definir_parametro(testes.id('a_tenant'), 'comercial.primeira_parcela_antes_venda', 'false', '2020-01-01', 'Não permite (QA)');
select public.definir_parametro(testes.id('a_tenant'), 'comercial.venda_dias_futuro_maximo', '30', '2020-01-01', 'Até 30 dias à frente (QA)');
select throws_ok($$ select public.vender_lote(testes.id('a_l8'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 0, 'parcelas', 480, 'juros_mensal', 0.03,
  'sistema', 'price', 'primeira_parcela_em', '2026-03-01')) $$, '23514', null,
  'VEN-BANCO-102: com teto de 2% a.m., juros de 3% a.m. são recusados');
select throws_ok($$ select public.vender_lote(testes.id('a_l8'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', '2026-02-01', 'preco_centavos', 12000000, 'entrada_centavos', 0, 'parcelas', 2, 'juros_mensal', 0,
  'sistema', 'sac', 'primeira_parcela_em', '2025-01-01')) $$, '23514', null,
  'VEN-BANCO-103: com a regra, a 1ª parcela não vence antes da venda');
select throws_ok($$ select public.vender_lote(testes.id('a_l10'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', current_date + 400, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0,
  'juros_mensal', 0, 'sistema', 'sac')) $$, '23514', null, 'VEN-BANCO-104: com limite de 30 dias, venda +400 dias é recusada');
select lives_ok($$ select public.vender_lote(testes.id('a_l10'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', current_date + 10, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0,
  'juros_mensal', 0, 'sistema', 'sac')) $$, 'VEN-BANCO-105: e dentro das regras a venda entra');

-- ── A-06 (ALTA, CORRIGIDO em 20261115100000): lote de permuta física vigente não volta ao estoque ──
-- Antes, quem tinha empreendimento.editar devolvia ao estoque um lote de permuta física vigente,
-- e ele podia ser vendido. A marcação simples de "permuta" no cadastro (sem contrato) continua.
select testes.guardar('fisica', public.criar_permuta(testes.id('a_emp'), testes.id('a_perm'),
  '{"tipo":"fisica","valor_economico_centavos":100}', array[testes.id('a_l11')]));
select throws_ok($$ update public.lotes set status = 'disponivel' where id = testes.id('a_l11') $$,
  '23514', null, 'LOT-BANCO-101: lote de permuta física vigente não volta ao estoque por edição direta');
select lives_ok($$ update public.lotes set status = 'permuta' where id = testes.id('a_l12') $$,
  'LOT-BANCO-102: pelo cadastro, o lote ainda pode ser marcado como permuta sem contrato (cadastro inicial)');
select throws_ok($$ select public.vender_lote(testes.id('a_l11'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', current_date, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0, 'juros_mensal', 0, 'sistema', 'sac')) $$,
  '23514', null, 'LOT-BANCO-103: o lote do permutante continua fora do estoque e não é vendido');

select lives_ok($$ update public.lotes set status = 'disponivel' where id = testes.id('a_l12') $$,
  'LOT-BANCO-104: lote marcado permuta sem contrato pode voltar ao estoque');

-- ── A-08 (ALTA, CORRIGIDO em 20261115100000): o cliente não troca o próprio plano (RN-G07) ──
select throws_ok($$ update public.tenants set plano_id = 'empresarial' where id = testes.id('a_tenant') $$,
  '42501', null, 'TEN-SEG-101: o cliente não troca o próprio plano (só a plataforma)');
select is((select plano_id from public.tenants where id = testes.id('a_tenant')), 'essencial',
  'TEN-SEG-102: o plano continua Essencial (200 lotes)');
select lives_ok($$ update public.tenants set nome = 'Loteadora QA a (renomeada)' where id = testes.id('a_tenant') $$,
  'TEN-SEG-103: o dono continua alterando o nome da loteadora');

-- ── A-10 (MÉDIA, CORRIGIDO em 20261115120000): referência de recebimento estornado é recusada ──
-- Antes a idempotência (RN-K05) devolvia o id do recebimento ESTORNADO, sem erro e sem baixa.
select testes.guardar('r77', public.registrar_recebimento(testes.id('a_p4'), '2026-06-01', 2500000, p_referencia => 'aviso-77'));
select public.estornar_recebimento(testes.id('r77'), 'Banco devolveu o pagamento (QA)');
select throws_ok($$ select public.registrar_recebimento(testes.id('a_p4'), '2026-06-05', 2500000, p_referencia => 'aviso-77') $$,
  '23514', null, 'REC-BANCO-111: nova baixa com a referência de um recebimento estornado é recusada com mensagem clara');
select lives_ok($$ select public.registrar_recebimento(testes.id('a_p4'), '2026-06-01', 2500000, p_referencia => 'aviso-77b') $$,
  'REC-BANCO-112: com outra referência, a nova baixa entra');
select is((select pago_centavos from public.parcelas where id = testes.id('a_p4')), 2500000::bigint,
  'REC-BANCO-113: e a parcela fica paga');


select * from finish();
rollback;
