-- Convite pendente para o e-mail confirmado é aceito ao entrar, sem o link.
begin;
\ir ../auxiliares/testes.psql
select plan(4);

select testes.guardar('ana', testes.criar_usuario('ana@pendente.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@pendente.com.br', 'Joana (compradora)'));
select testes.guardar('outra', testes.criar_usuario('outra@pendente.com.br', 'Outra'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Pendente'));
insert into public.compradores (tenant_id, nome, email) values (testes.id('tenant'), 'Joana Compradora', 'joana@pendente.com.br');
select public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@pendente.com.br');

select testes.entrar(testes.id('outra'));
select is(public.aceitar_convites_pendentes(), 0, 'convite de outro e-mail não é aceito');
select testes.entrar(testes.id('joana'));
select is(public.aceitar_convites_pendentes(), 1, 'convite pendente do próprio e-mail é aceito');
reset role;
select is((select usuario_id from public.compradores where tenant_id = testes.id('tenant')), testes.id('joana'), 'compradora ligada ao usuário');
select testes.entrar(testes.id('joana'));
select is(public.aceitar_convites_pendentes(), 0, 'nada mais a aceitar');

select * from finish();
rollback;
