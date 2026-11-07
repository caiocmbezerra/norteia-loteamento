-- RN-G01: nenhum usuário lê, cria, altera ou apaga dados de outro cliente.
-- Verifica TODAS as tabelas de public que têm tenant_id.
begin;
\ir ../auxiliares/testes.psql
select plan(19);

-- Cenário: dois clientes com cadastro completo.
select testes.guardar('ana', testes.criar_usuario('ana@loteadora-a.com.br', 'Ana'));
select testes.guardar('bia', testes.criar_usuario('bia@loteadora-b.com.br', 'Bia'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant_a', public.criar_tenant('Loteadora A'));
select testes.guardar('spe_a', (select id from public.spes where tenant_id = testes.id('tenant_a')));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base)
  values (testes.id('tenant_a'), testes.id('spe_a'), 'Residencial A', '2026-01-01');
select testes.guardar('emp_a', (select id from public.empreendimentos where tenant_id = testes.id('tenant_a')));
insert into public.etapas (tenant_id, empreendimento_id, nome) values (testes.id('tenant_a'), testes.id('emp_a'), 'Etapa 1');
insert into public.quadras (tenant_id, empreendimento_id, codigo) values (testes.id('tenant_a'), testes.id('emp_a'), 'A');
select testes.guardar('quadra_a', (select id from public.quadras where tenant_id = testes.id('tenant_a')));
insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2)
  values (testes.id('tenant_a'), testes.id('emp_a'), testes.id('quadra_a'), '1', 300);
insert into public.glebas (tenant_id, nome) values (testes.id('tenant_a'), 'Fazenda Boa Vista');
select public.definir_parametro(testes.id('tenant_a'), 'financeiro.tma_mensal', '0.012', '2026-01-01', 'TMA inicial');
select public.criar_convite(testes.id('tenant_a'), 'colega@loteadora-a.com.br', 'corretor');

select ok(
  (select bool_and(linhas > 0) from testes.linhas_visiveis_do_tenant(testes.id('tenant_a'))
    where tabela in ('empresas', 'spes', 'empreendimentos', 'etapas', 'quadras', 'lotes', 'glebas',
                     'membros', 'atribuicoes_papel', 'convites', 'parametro_valores', 'auditoria')),
  'o dono enxerga os próprios dados em todas as tabelas'
);

select testes.entrar(testes.id('bia'));
select testes.guardar('tenant_b', public.criar_tenant('Loteadora B'));
select testes.guardar('spe_b', (select id from public.spes where tenant_id = testes.id('tenant_b')));

-- Leitura
select is_empty(
  $$ select tabela from testes.linhas_visiveis_do_tenant(testes.id('tenant_a')) where linhas > 0 $$,
  'outro cliente não lê nenhuma linha do tenant A em nenhuma tabela'
);
select is_empty($$ select 1 from public.tenants where id = testes.id('tenant_a') $$,
  'outro cliente não vê o tenant A');
select is_empty($$ select 1 from public.perfis where id = testes.id('ana') $$,
  'outro cliente não vê o perfil de quem não é colega');

-- Alteração e exclusão: zero linhas afetadas
select is(
  testes.linhas_afetadas($$ update public.empreendimentos set nome = 'Invadido' where tenant_id = testes.id('tenant_a') $$),
  0::bigint, 'não altera empreendimentos de outro cliente');
select is(
  testes.linhas_afetadas($$ update public.lotes set area_m2 = 1 where tenant_id = testes.id('tenant_a') $$),
  0::bigint, 'não altera lotes de outro cliente');
select is(
  testes.linhas_afetadas($$ delete from public.lotes where tenant_id = testes.id('tenant_a') $$),
  0::bigint, 'não apaga lotes de outro cliente');
select is(
  testes.linhas_afetadas($$ delete from public.empresas where tenant_id = testes.id('tenant_a') $$),
  0::bigint, 'não apaga empresas de outro cliente');

-- Inserção
select throws_ok(
  $$ insert into public.empresas (tenant_id, razao_social) values (testes.id('tenant_a'), 'Intrusa') $$,
  '42501', null, 'não cria empresa no tenant de outro cliente');
select throws_ok(
  $$ insert into public.quadras (tenant_id, empreendimento_id, codigo) values (testes.id('tenant_a'), testes.id('emp_a'), 'Z') $$,
  '42501', null, 'não cria quadra no empreendimento de outro cliente');
select throws_ok(
  $$ insert into public.empreendimentos (tenant_id, spe_id, nome, data_base) values (testes.id('tenant_b'), testes.id('spe_a'), 'Cruzado', '2026-01-01') $$,
  null, null, 'não liga empreendimento próprio à SPE de outro cliente');
select throws_ok(
  $$ insert into public.atribuicoes_papel (tenant_id, membro_id, papel) select testes.id('tenant_a'), id, 'dono' from public.membros where usuario_id = testes.id('bia') $$,
  null, null, 'não se atribui papel no tenant de outro cliente');

-- Funções
select throws_ok(
  $$ select public.criar_convite(testes.id('tenant_a'), 'x@x.com', 'dono') $$,
  '42501', null, 'não convida para o tenant de outro cliente');
select throws_ok(
  $$ select public.definir_parametro(testes.id('tenant_a'), 'financeiro.tma_mensal', '0.5', '2026-02-01', 'ataque') $$,
  '42501', null, 'não altera parâmetros de outro cliente');
select is(
  public.parametro_vigente('financeiro.tma_mensal', '2026-03-01', testes.id('tenant_a')),
  null, 'não lê parâmetro vigente de outro cliente');

-- Visitante anônimo
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select count(*) from public.lotes $$, '42501', null, 'anônimo não lê lotes');
select throws_ok($$ select count(*) from public.tenants $$, '42501', null, 'anônimo não lê tenants');
select throws_ok($$ select public.criar_tenant('Anônimo') $$, '42501', null, 'anônimo não cria tenant');

-- Sem login não há acesso nem com papel authenticated
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select is(
  (select sum(linhas) from testes.linhas_visiveis_do_tenant(testes.id('tenant_a'))),
  0::numeric, 'authenticated sem usuário não lê nada');

select * from finish();
rollback;
