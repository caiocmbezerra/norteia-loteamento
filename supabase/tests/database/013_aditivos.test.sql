-- Fase 5c-1: renegociação por aditivo (RN-K07) e antecipação (RN-K08).
begin;
\ir ../auxiliares/testes.psql
select plan(18);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana Compradora');
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
-- R$ 1.000,00: entrada 100,00 + 3 × 300,00 (vencidas há 40 e 10 dias, e a vencer em 20)
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')),
    'data_venda', current_date - 70, 'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 3,
    'juros_mensal', 0.01, 'sistema', 'sac', 'primeira_parcela_em', current_date - 40)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 70, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date - 40, 'valor_centavos', 30000, 'amortizacao_centavos', 30000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date - 10, 'valor_centavos', 30000, 'amortizacao_centavos', 30000, 'juros_centavos', 0),
  json_build_object('numero', 3, 'vencimento', current_date + 20, 'valor_centavos', 30000, 'amortizacao_centavos', 30000, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_date - 70, 10000);
select testes.guardar('r1', public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1), current_date - 30, 5000));

-- Novo plano: saldo 85.000 + encargos 1.000 − desconto 500 = 85.500 em 2 parcelas (nº 4 e 5)
select set_config('teste.plano', json_build_array(
  json_build_object('numero', 4, 'vencimento', current_date + 30, 'valor_centavos', 43605, 'amortizacao_centavos', 42750, 'juros_centavos', 855),
  json_build_object('numero', 5, 'vencimento', current_date + 60, 'valor_centavos', 43178, 'amortizacao_centavos', 42750, 'juros_centavos', 428))::text, true);

select throws_ok($$ select public.renegociar_contrato(testes.id('contrato'), current_date, 'ok', 1000, 500, '{}', current_setting('teste.plano')::jsonb) $$,
  '23514', 'Informe o motivo da renegociação.', 'renegociação exige motivo');
select throws_ok($$ select public.renegociar_contrato(testes.id('contrato'), current_date, 'Acordo com a compradora', 1000, 0, '{}', current_setting('teste.plano')::jsonb) $$,
  '23514', 'O novo plano não confere com o saldo renegociado.', 'novo plano precisa somar o saldo renegociado');
select throws_ok($$ select public.renegociar_contrato(testes.id('contrato'), current_date, 'Acordo com a compradora', 1000, 500, '{}',
  replace(current_setting('teste.plano'), '"numero" : 4', '"numero" : 2')::jsonb) $$,
  '23514', null, 'novo plano continua a numeração do contrato');

-- Cobrança pendente bloqueia
reset role;
insert into public.cobrancas (tenant_id, parcela_id, asaas_id, valor_centavos, vencimento)
  values (testes.id('tenant'), (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 3), 'pay_t', 30000, current_date + 20);
select testes.entrar(testes.id('ana'));
select throws_ok($$ select public.renegociar_contrato(testes.id('contrato'), current_date, 'Acordo com a compradora', 1000, 500, '{}', current_setting('teste.plano')::jsonb) $$,
  '23514', 'Cancele as cobranças pendentes no Asaas antes de renegociar.', 'cobrança pendente no Asaas bloqueia a renegociação');
reset role;
select set_config('app.carteira', 'on', true);
delete from public.cobrancas where asaas_id = 'pay_t';
select set_config('app.carteira', '', true);

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.renegociar_contrato(testes.id('contrato'), current_date, 'Acordo com a compradora', 1000, 500, '{}', current_setting('teste.plano')::jsonb) $$,
  '42501', null, 'corretor não renegocia');

select testes.entrar(testes.id('ana'));
select testes.guardar('aditivo', public.renegociar_contrato(testes.id('contrato'), current_date, 'Acordo com a compradora',
  1000, 500, '{"parcelas":2,"juros_mensal":"0.01","sistema":"sac"}', current_setting('teste.plano')::jsonb));
select is((select saldo_anterior_centavos || ' ' || novo_saldo_centavos || ' ' || jsonb_array_length(parcelas_anteriores) from public.aditivos where id = testes.id('aditivo')),
  '85000 85500 3', 'aditivo guarda o saldo anterior, o novo e a foto das parcelas substituídas (RN-K07)');
select is((select string_agg(numero || ':' || situacao, ' ' order by numero) from public.parcelas where contrato_id = testes.id('contrato')),
  '0:paga 1:cancelada 2:cancelada 3:cancelada 4:aberta 5:aberta', 'parcelas antigas canceladas, novo plano em aberto');
select is((select pago_centavos from public.parcelas where contrato_id = testes.id('contrato') and numero = 1), 5000::bigint,
  'o pagamento parcial anterior continua registrado');
select is((select count(*) from public.parcelas where aditivo_cancelamento_id = testes.id('aditivo')), 3::bigint, 'parcelas substituídas apontam o aditivo');
select throws_ok($$ select public.estornar_recebimento(testes.id('r1'), 'cheque devolvido') $$, '23514', null,
  'recebimento de parcela renegociada não é estornado');
select throws_ok($$ update public.aditivos set motivo = 'outro motivo' $$, '42501', null, 'aditivo não é alterado');

-- Antecipação
select throws_ok($$ select public.antecipar_parcelas(testes.id('contrato'), current_date,
  json_build_array(json_build_object('parcela', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 4), 'desconto_centavos', 43605))::jsonb) $$,
  '23514', 'Desconto de antecipação inválido.', 'desconto não pode zerar a parcela');
select is(public.antecipar_parcelas(testes.id('contrato'), current_date,
  json_build_array(json_build_object('parcela', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 5), 'desconto_centavos', 852))::jsonb),
  1, 'parcela a vencer antecipada com desconto (RN-K08)');
select is((select r.valor_centavos || ' ' || r.principal_centavos || ' ' || r.desconto_centavos from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
  where p.contrato_id = testes.id('contrato') and p.numero = 5), '42326 43178 852', 'recebido = saldo − juros não decorridos');
select is((select situacao from public.contratos where id = testes.id('contrato')), 'vigente', 'contrato segue vigente com parcela em aberto');
select is(public.antecipar_parcelas(testes.id('contrato'), current_date,
  json_build_array(json_build_object('parcela', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 4), 'desconto_centavos', 430))::jsonb),
  1, 'última parcela antecipada');
select is((select situacao || ' ' || quitado_em from public.contratos where id = testes.id('contrato')), 'quitado ' || current_date,
  'sem parcelas em aberto, contrato quitado (RN-K09)');
select throws_ok($$ select public.renegociar_contrato(testes.id('contrato'), current_date, 'Acordo com a compradora', 0, 0, '{}', current_setting('teste.plano')::jsonb) $$,
  '23514', 'Só contratos vigentes são renegociados.', 'contrato quitado não é renegociado');

select * from finish();
rollback;
