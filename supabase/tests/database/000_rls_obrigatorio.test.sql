-- RN-G01 / roadmap Fase 1: toda tabela dos schemas de aplicação precisa de RLS ligado
-- e de ao menos uma política. Este teste existe desde a Fase 0 para que nenhuma tabela
-- nasça desprotegida.
begin;
select plan(2);

select is_empty(
  $$
    select format('%I.%I', n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname = 'public'
      and not c.relrowsecurity
  $$,
  'toda tabela em public tem RLS ligado'
);

select is_empty(
  $$
    select format('%I.%I', n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname = 'public'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = n.nspname and p.tablename = c.relname
      )
  $$,
  'toda tabela em public tem ao menos uma política'
);

select * from finish();
rollback;
