-- INCC com a série 192 do SGS para a importação automática.
begin;
select plan(1);
select results_eq($$ select codigo, serie_sgs from public.indices_economicos where codigo = 'INCC' $$,
  $$ values ('INCC'::text, 192) $$, 'INCC cadastrado com a série 192 do SGS (INCC-DI)');
select * from finish();
rollback;
