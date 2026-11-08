-- Fase 7b-2: informe de pagamentos do comprador (IR).
begin;
\ir ../auxiliares/testes.psql
select plan(6);

select testes.guardar('ana', testes.criar_usuario('ana@informe.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@informe.com.br', 'Joana (compradora)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@informe.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Informe'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Informe', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));
select set_config('teste.ano', extract(year from current_date)::text, true);
select set_config('teste.d1', make_date(current_setting('teste.ano')::int - 1, 12, 10)::text, true);
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', testes.id('comprador'), 'data_venda', current_setting('teste.d1'), 'preco_centavos', 100000,
    'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date - 1)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_setting('teste.d1'), 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date - 1, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
-- Entrada paga no ano anterior; parte da parcela 1 neste ano.
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_setting('teste.d1')::date, 10000);
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1), current_date - 1, 30000);
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', testes.id('comprador'), 'joana@informe.com.br'), true);

select is(jsonb_array_length(public.informe_pagamentos(testes.id('contrato'), current_setting('teste.ano')::int) -> 'pagamentos'), 1,
  'só os pagamentos do ano');
select is((public.informe_pagamentos(testes.id('contrato'), current_setting('teste.ano')::int) ->> 'pago_ate_fim_do_ano')::bigint, 40000::bigint,
  'total pago até 31/12 inclui anos anteriores');
select is((public.informe_pagamentos(testes.id('contrato'), current_setting('teste.ano')::int - 1) ->> 'pago_ate_fim_do_ano')::bigint, 10000::bigint,
  'e para o ano anterior, só o que foi pago até lá');

select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
select is(public.informe_pagamentos(testes.id('contrato'), current_setting('teste.ano')::int) #>> '{comprador,nome}', 'Joana Compradora',
  'a compradora tira o próprio informe pelo portal');
select throws_ok($$ select public.informe_pagamentos(testes.id('contrato'), current_setting('teste.ano')::int + 1) $$, '23514', 'Ano-calendário inválido.',
  'ano futuro é recusado');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.informe_pagamentos(testes.id('contrato'), current_setting('teste.ano')::int) $$, '42501', null,
  'outra pessoa não vê o informe');

select * from finish();
rollback;
