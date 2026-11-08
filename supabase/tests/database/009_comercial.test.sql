-- Fase 4: reserva e venda (RN-C01 a RN-C04, RN-C07).
begin;
\ir ../auxiliares/testes.psql
select plan(21);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.guardar('dani', testes.criar_usuario('dani@corretora.com.br', 'Dani (corretora)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":9000000},
    {"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":9000000},
    {"quadra":"A","numero":"3","area_m2":"300","preco_base_centavos":9000000}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where numero = '1' and empreendimento_id = testes.id('emp')));
select testes.guardar('l2', (select id from public.lotes where numero = '2' and empreendimento_id = testes.id('emp')));
select testes.guardar('l3', (select id from public.lotes where numero = '3' and empreendimento_id = testes.id('emp')));
select set_config('teste.c1', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
select set_config('teste.c2', public.criar_convite(testes.id('tenant'), 'dani@corretora.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));
insert into public.corretores (tenant_id, nome, usuario_id, comissao_percentual)
  values (testes.id('tenant'), 'Caio', testes.id('caio'), 0.05), (testes.id('tenant'), 'Dani', testes.id('dani'), 0.04);

select throws_ok(
  $$ insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'CPF errado', '52998224724') $$,
  '23514', null, 'CPF com dígito errado é recusado');

-- Corretor reserva para si
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.c1'));
select testes.guardar('r1', public.reservar_lote(testes.id('l1'), 'Cliente do Caio'));
select is((select status::text from public.lotes where id = testes.id('l1')), 'reservado', 'reserva marca o lote como reservado');
select isnt((select corretor_id from public.reservas where id = testes.id('r1')), null, 'reserva fica com o corretor que reservou');
select throws_ok($$ select public.reservar_lote(testes.id('l1'), 'Outro') $$, '23514', null, 'lote reservado não aceita segunda reserva (RN-C02)');
select throws_ok($$ select public.vender_lote(testes.id('l1'), '{}'::jsonb) $$, '42501', null, 'corretor não registra venda');
select throws_ok($$ insert into public.reservas (tenant_id, empreendimento_id, lote_id, cliente_nome, expira_em) values (testes.id('tenant'), testes.id('emp'), testes.id('l2'), 'x', now()) $$,
  '42501', null, 'reserva só pela função');

-- Outra corretora não vê a reserva do colega (RN-C07)
select testes.entrar(testes.id('dani'));
select public.aceitar_convite(current_setting('teste.c2'));
select is_empty($$ select 1 from public.reservas $$, 'corretora não vê reservas de outro corretor');
select throws_ok($$ select public.cancelar_reserva(testes.id('r1'), 'não é minha') $$, '42501', null, 'corretora não cancela reserva de outro');

-- Quem reservou vê e cancela a própria reserva, mesmo sem cadastro de corretor
reset role;
delete from public.corretores where usuario_id = testes.id('dani');
select testes.entrar(testes.id('dani'));
select testes.guardar('r3', public.reservar_lote(testes.id('l3'), 'Cliente da Dani sem cadastro'));
select is((select count(*) from public.reservas where id = testes.id('r3')), 1::bigint, 'quem reservou vê a própria reserva');
select lives_ok($$ select public.cancelar_reserva(testes.id('r3'), 'cliente desistiu') $$, 'quem reservou cancela a própria reserva');
reset role;
insert into public.corretores (tenant_id, nome, usuario_id, comissao_percentual) values (testes.id('tenant'), 'Dani', testes.id('dani'), 0.04);

-- Reserva vencida libera o lote
select testes.entrar(testes.id('caio'));
select testes.guardar('r2', public.reservar_lote(testes.id('l2'), 'Cliente 2', null, 1));
reset role;
update public.reservas set expira_em = now() - interval '1 minute' where id = testes.id('r2');
select testes.entrar(testes.id('dani'));
select lives_ok($$ select public.reservar_lote(testes.id('l2'), 'Cliente da Dani') $$, 'reserva vencida não bloqueia nova reserva (RN-C03)');
reset role;
select is((select situacao from public.reservas where id = testes.id('r2')), 'expirada', 'a reserva vencida fica como expirada');

-- RN-C01: sem registro, não vende
select testes.entrar(testes.id('ana'));
select set_config('teste.venda', json_build_object(
  'comprador_id', testes.id('comprador'), 'data_venda', '2026-11-08', 'preco_centavos', 9000000,
  'entrada_centavos', 900000, 'parcelas', 120, 'juros_mensal', 0.005, 'sistema', 'price',
  'primeira_parcela_em', '2026-12-08', 'comissao_percentual', 0.05)::text, true);
select throws_ok($$ select public.vender_lote(testes.id('l1'), current_setting('teste.venda')::jsonb) $$,
  '23514', 'Venda bloqueada: o loteamento ainda não foi registrado em cartório (Lei 6.766).', 'venda bloqueada sem registro (RN-C01)');

update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-10-01' where id = testes.id('emp');
select testes.guardar('v1', public.vender_lote(testes.id('l1'), current_setting('teste.venda')::jsonb));
select is((select status::text from public.lotes where id = testes.id('l1')), 'vendido', 'venda marca o lote como vendido');
select is((select situacao from public.reservas where id = testes.id('r1')), 'convertida', 'a reserva vira venda');
select is((select corretor_id from public.vendas where id = testes.id('v1')), (select corretor_id from public.reservas where id = testes.id('r1')),
  'a venda herda o corretor da reserva');
select throws_ok($$ select public.vender_lote(testes.id('l1'), current_setting('teste.venda')::jsonb) $$,
  '23514', null, 'lote vendido não é vendido de novo (RN-C02)');
select throws_ok($$ update public.vendas set preco_centavos = 1 where id = testes.id('v1') $$, '42501', null, 'venda registrada não é alterada');
select throws_ok($$ update public.lotes set status = 'disponivel' where id = testes.id('l1') $$, '23514', null, 'cadastro não desfaz venda (RN-C04)');

-- Corretor vê a própria venda; corretora não
select testes.entrar(testes.id('caio'));
select is((select count(*) from public.vendas), 1::bigint, 'corretor vê a própria venda');
select testes.entrar(testes.id('dani'));
select is_empty($$ select 1 from public.vendas $$, 'corretora não vê venda de outro corretor');

select * from finish();
rollback;
