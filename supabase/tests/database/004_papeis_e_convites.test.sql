-- Papéis com escopo e convites (docs/arquitetura.md §8, RN-C07).
begin;
\ir ../auxiliares/testes.psql
select plan(18);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.guardar('duda', testes.criar_usuario('duda@engenharia.com.br', 'Duda (engenharia)'));
select testes.guardar('eva', testes.criar_usuario('eva@intrusa.com.br', 'Eva'));

-- Ana cria o cliente com duas SPEs, cada uma com um empreendimento.
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('empresa', (select id from public.empresas where tenant_id = testes.id('tenant')));
select testes.guardar('spe1', (select id from public.spes where tenant_id = testes.id('tenant')));
insert into public.spes (tenant_id, empresa_id, razao_social) values (testes.id('tenant'), testes.id('empresa'), 'SPE Dois');
select testes.guardar('spe2', (select id from public.spes where razao_social = 'SPE Dois'));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base) values
  (testes.id('tenant'), testes.id('spe1'), 'Um', '2026-01-01'),
  (testes.id('tenant'), testes.id('spe2'), 'Dois', '2026-01-01');
select testes.guardar('emp1', (select id from public.empreendimentos where nome = 'Um'));
select testes.guardar('emp2', (select id from public.empreendimentos where nome = 'Dois'));
insert into public.quadras (tenant_id, empreendimento_id, codigo) values
  (testes.id('tenant'), testes.id('emp1'), 'A'), (testes.id('tenant'), testes.id('emp2'), 'A');
insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2)
  select tenant_id, empreendimento_id, id, '1', 300 from public.quadras where tenant_id = testes.id('tenant');

select set_config('teste.convite_caio', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
select set_config('teste.convite_duda',
  public.criar_convite(testes.id('tenant'), 'DUDA@engenharia.com.br', 'engenharia', 'empreendimento', testes.id('emp1')), true);

select is(
  (select count(*) from public.convites where tenant_id = testes.id('tenant') and token_hash is not null),
  2::bigint, 'convites guardam apenas o hash do token');

-- Convite com outro e-mail
select testes.entrar(testes.id('eva'));
select throws_ok(
  $$ select public.aceitar_convite(current_setting('teste.convite_caio')) $$,
  '42501', null, 'convite não é aceito por outro e-mail');

-- Corretor
select testes.entrar(testes.id('caio'));
select is(public.aceitar_convite(current_setting('teste.convite_caio')), testes.id('tenant'),
  'corretor aceita o convite');
select throws_ok(
  $$ select public.aceitar_convite(current_setting('teste.convite_caio')) $$,
  '22023', null, 'convite não pode ser usado duas vezes');
select is((select count(*) from public.lotes), 2::bigint, 'corretor vê a disponibilidade de todos os lotes');
select is(
  testes.linhas_afetadas($$ update public.lotes set area_m2 = 1 $$), 0::bigint,
  'corretor não altera lotes');
select throws_ok(
  $$ insert into public.quadras (tenant_id, empreendimento_id, codigo) values (testes.id('tenant'), testes.id('emp1'), 'B') $$,
  '42501', null, 'corretor não cria quadras');
select is_empty($$ select 1 from public.auditoria $$, 'corretor não lê a auditoria');
select is_empty($$ select 1 from public.convites $$, 'corretor não vê convites');

-- Engenharia com escopo de um único empreendimento
select testes.entrar(testes.id('duda'));
select lives_ok($$ select public.aceitar_convite(current_setting('teste.convite_duda')) $$,
  'e-mail do convite não diferencia maiúsculas');
select is((select array_agg(nome) from public.empreendimentos), array['Um'],
  'escopo de empreendimento: vê só o empreendimento atribuído');
select is(
  testes.linhas_afetadas($$ update public.lotes set area_m2 = 310 $$), 1::bigint,
  'edita lotes somente do empreendimento atribuído');
select throws_ok(
  $$ insert into public.quadras (tenant_id, empreendimento_id, codigo) values (testes.id('tenant'), testes.id('emp2'), 'B') $$,
  '42501', null, 'não cria quadras em outro empreendimento');

-- Escalada de privilégio
select throws_ok(
  $$ insert into public.atribuicoes_papel (tenant_id, membro_id, papel)
     select tenant_id, id, 'dono' from public.membros where usuario_id = testes.id('duda') $$,
  '42501', null, 'membro não se promove a dono');

-- Dono com escopo de empresa não gerencia membros (exige escopo do tenant inteiro)
select testes.entrar(testes.id('ana'));
insert into public.atribuicoes_papel (tenant_id, membro_id, papel, escopo_tipo, escopo_id)
  select tenant_id, id, 'dono', 'empresa', testes.id('empresa') from public.membros where usuario_id = testes.id('duda');
select testes.entrar(testes.id('duda'));
select is((select count(*) from public.empreendimentos), 2::bigint,
  'dono de empresa vê os empreendimentos de todas as SPEs da empresa');
select throws_ok(
  $$ select public.criar_convite(testes.id('tenant'), 'outro@x.com', 'dono') $$,
  '42501', null, 'dono de empresa não convida membros');

-- Membro desativado perde o acesso
select testes.entrar(testes.id('ana'));
update public.membros set ativo = false where usuario_id = testes.id('caio');
select testes.entrar(testes.id('caio'));
select is_empty($$ select 1 from public.lotes $$, 'membro desativado não vê mais nada');

-- Convite expirado
select testes.entrar(testes.id('ana'));
select set_config('teste.convite_eva', public.criar_convite(testes.id('tenant'), 'eva@intrusa.com.br', 'contador'), true);
reset role;
update public.convites set expira_em = now() - interval '1 minute' where email = 'eva@intrusa.com.br';
select testes.entrar(testes.id('eva'));
select throws_ok(
  $$ select public.aceitar_convite(current_setting('teste.convite_eva')) $$,
  '22023', null, 'convite expirado é recusado');

select * from finish();
rollback;
