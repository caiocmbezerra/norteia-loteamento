-- Fase 8c: inadimplência da carteira reconstruída em datas passadas e limites dos alertas.
begin;
\ir ../auxiliares/testes.psql
select plan(5);

select testes.guardar('ana', testes.criar_usuario('ana@alertas.com.br', 'Ana (dona)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@alertas.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Alertas'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Alertas', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 90,
    'preco_centavos', 100000, 'entrada_centavos', 0, 'parcelas', 2, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date - 50)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 1, 'vencimento', current_date - 50, 'valor_centavos', 50000, 'amortizacao_centavos', 50000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date - 20, 'valor_centavos', 50000, 'amortizacao_centavos', 50000, 'juros_centavos', 0))::jsonb));
-- Parcela 1 paga com atraso, há 10 dias; parcela 2 continua em aberto.
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1), current_date - 10, 50000);

select set_config('teste.h', public.inadimplencia_historico(testes.id('emp'), array[current_date - 60, current_date - 30, current_date])::text, true);
select is((current_setting('teste.h')::jsonb #>> '{0,vencido}')::bigint || '/' || (current_setting('teste.h')::jsonb #>> '{0,saldo}'),
  '0/100000', 'há 60 dias: nada vencido, saldo total');
select is((current_setting('teste.h')::jsonb #>> '{1,vencido}')::bigint, 50000::bigint, 'há 30 dias: a parcela 1 estava vencida (paga só depois)');
select is((current_setting('teste.h')::jsonb #>> '{2,vencido}')::bigint || '/' || (current_setting('teste.h')::jsonb #>> '{2,saldo}'),
  '50000/50000', 'hoje: só a parcela 2 vencida');
select is(public.parametro_vigente('alertas.desvio_plano', current_date, testes.id('tenant')) #>> '{}', '0.05', 'limite sugerido pela plataforma');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.inadimplencia_historico(testes.id('emp'), array[current_date]) $$, '42501', null, 'quem não é da loteadora não vê');

select * from finish();
rollback;
