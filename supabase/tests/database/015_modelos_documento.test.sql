-- Fase 5c-3b: modelos de documentos por cliente, com histórico de versões.
begin;
\ir ../auxiliares/testes.psql
select plan(7);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('fabi', testes.criar_usuario('fabi@loteadora.com.br', 'Fabi (financeiro)'));
select testes.guardar('bia', testes.criar_usuario('bia@outra.com.br', 'Bia (outra loteadora)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select set_config('teste.cf', public.criar_convite(testes.id('tenant'), 'fabi@loteadora.com.br', 'financeiro'), true);
select set_config('teste.docx', repeat('UEsDBBQ', 20), true);

select testes.guardar('v1', public.publicar_modelo(testes.id('tenant'), 'contrato', 'contrato-v1.docx', current_setting('teste.docx')));
select testes.guardar('v2', public.publicar_modelo(testes.id('tenant'), 'contrato', 'contrato-v2.docx', current_setting('teste.docx')));
select is((select string_agg(nome_arquivo || ':' || ativo, ' ' order by criado_em, nome_arquivo) from public.modelos_documento),
  'contrato-v1.docx:false contrato-v2.docx:true', 'nova versão desativa a anterior, que fica no histórico');
select throws_ok($$ insert into public.modelos_documento (tenant_id, tipo, nome_arquivo, conteudo_base64) values (testes.id('tenant'), 'contrato', 'x.docx', current_setting('teste.docx')) $$,
  '42501', null, 'modelo só entra pela função');
select lives_ok($$ select public.usar_modelo_padrao(testes.id('tenant'), 'contrato') $$, 'dono volta ao modelo padrão');
select is((select count(*) from public.modelos_documento where ativo), 0::bigint, 'sem modelo ativo, vale o padrão');

select testes.entrar(testes.id('fabi'));
select public.aceitar_convite(current_setting('teste.cf'));
select throws_ok($$ select public.publicar_modelo(testes.id('tenant'), 'contrato', 'x.docx', current_setting('teste.docx')) $$,
  '42501', null, 'financeiro não altera modelos');
select is((select count(*) from public.modelos_documento), 2::bigint, 'membros leem os modelos da loteadora');

select testes.entrar(testes.id('bia'));
select is_empty($$ select 1 from public.modelos_documento $$, 'outra loteadora não vê os modelos');

select * from finish();
rollback;
