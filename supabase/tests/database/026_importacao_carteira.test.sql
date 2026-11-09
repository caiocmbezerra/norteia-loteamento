-- Fase 8a: importação de carteira (tudo ou nada, com conciliação do saldo).
begin;
\ir ../auxiliares/testes.psql
select plan(10);

select testes.guardar('ana', testes.criar_usuario('ana@importa.com.br', 'Ana (dona)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@importa.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Importa'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Importa', 'Goiânia', 'GO', '2023-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000},{"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2023-01-02' where id = testes.id('emp');

select set_config('teste.carteira', $j$[
  {"ref":"1001","quadra":"A","lote":"1","comprador":{"nome":"Maria da Silva","cpf":"52998224725","email":null,"telefone":null},
   "data_venda":"2024-01-10","preco":9000000,"indice":"IPCA","parcelas":[
     {"numero":0,"vencimento":"2024-01-10","valor":900000,"pago":900000,"data_pagamento":"2024-01-10"},
     {"numero":1,"vencimento":"2024-02-10","valor":135000,"pago":145000,"data_pagamento":"2024-02-20"},
     {"numero":2,"vencimento":"2024-03-10","valor":135000,"pago":0,"data_pagamento":null}]}]$j$, true);

select throws_ok($$ select public.importar_carteira(testes.id('emp'), 'Sistema Antigo', 'carteira.csv', 1, current_setting('teste.carteira')::jsonb) $$,
  '23514', 'O saldo em aberto da planilha (135000) não confere com o do sistema de origem (1).', 'sem conciliação não importa');
select is((select count(*) from public.vendas where empreendimento_id = testes.id('emp')), 0::bigint, 'e nada fica gravado');

select testes.guardar('imp', public.importar_carteira(testes.id('emp'), 'Sistema Antigo', 'carteira.csv', 135000, current_setting('teste.carteira')::jsonb));
select is((select status::text from public.lotes l join public.quadras q on q.id = l.quadra_id where q.empreendimento_id = testes.id('emp') and l.numero = '1'),
  'vendido', 'lote importado fica vendido');
select is((select string_agg(p.numero || ':' || p.situacao || ':' || p.pago_centavos, ',' order by p.numero) from public.parcelas p
            join public.contratos c on c.id = p.contrato_id where c.empreendimento_id = testes.id('emp')),
  '0:paga:900000,1:paga:135000,2:aberta:0', 'parcelas com o que já foi pago');
select is((select juros_mora_centavos from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
            join public.contratos c on c.id = p.contrato_id where c.empreendimento_id = testes.id('emp') and p.numero = 1),
  10000::bigint, 'pago acima da parcela vira encargo');
select is((select origem from public.recebimentos where tenant_id = testes.id('tenant') limit 1), 'importacao', 'recebimentos marcados como importados');
select is((select saldo_aberto_centavos from public.importacoes where id = testes.id('imp')), 135000::bigint, 'importação registrada com o saldo conciliado');
select is((select count(*) from public.reajustes r join public.contratos c on c.id = r.contrato_id
            where c.empreendimento_id = testes.id('emp') and r.fator_aplicado = 1 and r.aniversario <= current_date),
  ((extract(year from age(current_date, '2024-01-10'::date)))::int)::bigint,
  'aniversários já passados ficam marcados como embutidos na origem (sem reajustar de novo)');
select throws_ok($$ select public.importar_carteira(testes.id('emp'), 'Sistema Antigo', 'carteira.csv', 135000, current_setting('teste.carteira')::jsonb) $$,
  '23514', 'Contrato 1001: o lote 1 da quadra A já está vendido.', 'não importa o mesmo lote duas vezes');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.importar_carteira(testes.id('emp'), 'X', null, 135000, current_setting('teste.carteira')::jsonb) $$,
  '42501', null, 'quem não é da loteadora não importa');

select * from finish();
rollback;
