-- Fase 4b: planta de lotes (D-008) — arquivo no Storage isolado por cliente e contorno validado.
begin;
\ir ../auxiliares/testes.psql
select plan(11);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('bia', testes.criar_usuario('bia@outra.com.br', 'Bia (outra loteadora)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where empreendimento_id = testes.id('emp')));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
select set_config('teste.caminho', testes.id('tenant') || '/' || testes.id('emp') || '/planta.png', true);

select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('plantas', current_setting('teste.caminho'), auth.uid()::text) $$,
  'dona envia a planta na pasta do empreendimento');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('plantas', testes.id('tenant') || '/' || gen_random_uuid() || '/x.png') $$,
  '42501', null, 'pasta de empreendimento inexistente é recusada');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('plantas', 'qualquer/coisa.png') $$,
  '42501', null, 'caminho fora do padrão é recusado');

select lives_ok($$ update public.empreendimentos set planta_arquivo = current_setting('teste.caminho'), planta_largura = 2000, planta_altura = 1000 where id = testes.id('emp') $$,
  'empreendimento guarda a planta e o tamanho');
select throws_ok($$ update public.empreendimentos set planta_arquivo = 'outro/lugar.png' where id = testes.id('emp') $$,
  '23514', null, 'planta só da pasta do próprio empreendimento');

select lives_ok($$ update public.lotes set planta_poligono = '[[0.1,0.1],[0.2,0.1],[0.2,0.2],[0.1,0.2]]' where id = testes.id('l1') $$,
  'contorno com coordenadas relativas é aceito');
select throws_ok($$ update public.lotes set planta_poligono = '[[0.1,0.1],[0.2,0.1]]' where id = testes.id('l1') $$,
  '23514', null, 'contorno precisa de ao menos 3 pontos');
select throws_ok($$ update public.lotes set planta_poligono = '[[0.1,0.1],[1.2,0.1],[0.2,0.2]]' where id = testes.id('l1') $$,
  '23514', null, 'coordenada fora da imagem é recusada');

-- Corretor vê a planta, não a troca
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select is((select count(*) from storage.objects where bucket_id = 'plantas'), 1::bigint, 'corretor vê a planta do empreendimento');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('plantas', testes.id('tenant') || '/' || testes.id('emp') || '/outra.png') $$,
  '42501', null, 'corretor não envia planta');

-- Outra loteadora não vê
select testes.entrar(testes.id('bia'));
select is((select count(*) from storage.objects where bucket_id = 'plantas'), 0::bigint, 'outra loteadora não vê a planta');

select * from finish();
rollback;
