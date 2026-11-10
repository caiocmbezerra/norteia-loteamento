-- INPC disponível como índice de reajuste, com a série do SGS para a importação automática.
begin;
select plan(1);
select results_eq($$ select codigo, serie_sgs from public.indices_economicos where codigo = 'INPC' $$,
  $$ values ('INPC'::text, 188) $$, 'INPC cadastrado com a série 188 do SGS');
select * from finish();
rollback;
