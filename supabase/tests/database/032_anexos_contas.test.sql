-- Fase 3: anexos de notas às contas a pagar, isolados por cliente e por empreendimento.
begin;
\ir ../auxiliares/testes.psql
select plan(8);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('bia', testes.criar_usuario('bia@outra.com.br', 'Bia (outra loteadora)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb));
select testes.guardar('emp2', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Outro', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.contas_pagar (tenant_id, empreendimento_id, centro_codigo, descricao, valor_centavos, vencimento)
  values (testes.id('tenant'), testes.id('emp'), (select codigo from public.centros_custo where tenant_id = testes.id('tenant') order by codigo limit 1),
          'Topografia', 500000, '2026-12-01');
select testes.guardar('conta', (select id from public.contas_pagar where tenant_id = testes.id('tenant')));
select set_config('teste.caminho', testes.id('tenant') || '/' || testes.id('emp') || '/contas/' || testes.id('conta') || '/nota.pdf', true);

select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documentos', current_setting('teste.caminho'), auth.uid()::text) $$,
  'dona envia a nota na pasta da conta');
select lives_ok($$ insert into public.anexos_conta (tenant_id, empreendimento_id, conta_id, caminho, nome, tipo, tamanho)
  values (testes.id('tenant'), testes.id('emp'), testes.id('conta'), current_setting('teste.caminho'), 'nota.pdf', 'application/pdf', 1234) $$,
  'anexo registrado na conta');
select throws_ok($$ insert into public.anexos_conta (tenant_id, empreendimento_id, conta_id, caminho, nome, tipo, tamanho)
  values (testes.id('tenant'), testes.id('emp2'), testes.id('conta'), testes.id('tenant') || '/' || testes.id('emp2') || '/contas/' || testes.id('conta') || '/x.pdf', 'x.pdf', 'application/pdf', 1) $$,
  '23514', null, 'anexo não vai para conta de outro empreendimento');
select throws_ok($$ insert into public.anexos_conta (tenant_id, empreendimento_id, conta_id, caminho, nome, tipo, tamanho)
  values (testes.id('tenant'), testes.id('emp'), testes.id('conta'), 'outro/lugar.pdf', 'x.pdf', 'application/pdf', 1) $$,
  '23514', null, 'caminho fora da pasta da conta é recusado');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documentos', testes.id('tenant') || '/' || testes.id('emp') || '/planta/x.pdf') $$,
  '42501', null, 'documento só na pasta de contas');

-- Corretor não vê notas (sem acesso financeiro)
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select is((select count(*) from storage.objects where bucket_id = 'documentos'), 0::bigint, 'corretor não vê as notas');
select is_empty($$ select 1 from public.anexos_conta $$, 'corretor não vê os anexos');

-- Outra loteadora
select testes.entrar(testes.id('bia'));
select is((select count(*) from storage.objects where bucket_id = 'documentos'), 0::bigint, 'outra loteadora não vê as notas');

select * from finish();
rollback;
