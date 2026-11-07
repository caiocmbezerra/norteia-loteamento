-- Fase 1 · Fundação (1/5): extensões, schema privado, tipos e gatilhos genéricos.
-- docs/arquitetura.md §7–§9 · docs/dominio.md RN-G01, RN-G03, RN-G04.

create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;

-- Funções auxiliares de segurança e gatilhos. Não exposto pela API de dados.
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

-- Nível em que um papel ou permissão vale. Empresa cobre suas SPEs e empreendimentos;
-- SPE cobre seus empreendimentos.
create type public.escopo as enum ('tenant', 'empresa', 'spe', 'empreendimento');

create type public.papel as enum (
  'dono',
  'financeiro',
  'engenharia',
  'comercial_gestor',
  'corretor',
  'contador',
  'socio_leitura',
  'permutante_leitura'
);

-- ---------------------------------------------------------------------------
-- Auditoria (RN-G03): somente inserção, preenchida por gatilho.
-- ---------------------------------------------------------------------------

create table public.auditoria (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  tabela text not null,
  registro_id text,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  antes jsonb,
  depois jsonb,
  campos_alterados text[],
  usuario_id uuid,
  motivo text,
  ocorrido_em timestamptz not null default now()
);

comment on table public.auditoria is
  'Trilha de auditoria (RN-G03). Somente inserção, por gatilho. Ninguém altera ou apaga.';

create index auditoria_tenant_ocorrido_idx on public.auditoria (tenant_id, ocorrido_em desc);
create index auditoria_registro_idx on public.auditoria (tabela, registro_id);

-- Gatilho genérico. O motivo, quando exigido, é informado na transação com
-- set_config('app.motivo', '...', true).
create function privado.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_linha jsonb := coalesce(v_depois, v_antes);
  v_alterados text[];
  v_tenant uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(d.key order by d.key)
      into v_alterados
      from jsonb_each(v_depois) d
     where d.key not in ('atualizado_em', 'atualizado_por')
       and d.value is distinct from v_antes -> d.key;
    if v_alterados is null then
      return null; -- nada mudou de fato
    end if;
  end if;

  v_tenant := case
    when tg_table_name = 'tenants' then (v_linha ->> 'id')::uuid
    else (v_linha ->> 'tenant_id')::uuid
  end;

  insert into public.auditoria
    (tenant_id, tabela, registro_id, operacao, antes, depois, campos_alterados, usuario_id, motivo)
  values (
    v_tenant,
    tg_table_name,
    v_linha ->> 'id',
    tg_op,
    v_antes,
    v_depois,
    v_alterados,
    auth.uid(),
    nullif(current_setting('app.motivo', true), '')
  );
  return null;
end;
$$;

-- A auditoria é imutável, inclusive para o dono do banco.
create function privado.auditoria_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A trilha de auditoria não pode ser alterada nem apagada (RN-G03).'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger auditoria_imutavel
  before update or delete on public.auditoria
  for each row execute function privado.auditoria_imutavel();

create trigger auditoria_sem_truncate
  before truncate on public.auditoria
  for each statement execute function privado.auditoria_imutavel();

-- ---------------------------------------------------------------------------
-- Carimbo de criação/alteração e imutabilidade do tenant.
-- ---------------------------------------------------------------------------

create function privado.carimbar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.criado_por := auth.uid();
  else
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
    if to_jsonb(new) ? 'tenant_id' and (to_jsonb(new) ->> 'tenant_id') is distinct from (to_jsonb(old) ->> 'tenant_id') then
      raise exception 'Um registro não pode mudar de cliente (tenant).'
        using errcode = 'check_violation';
    end if;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

-- Liga carimbo e auditoria numa tabela de negócio.
create function privado.instrumentar(p_tabela regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger carimbar before insert or update on %s for each row execute function privado.carimbar()',
    p_tabela
  );
  execute format(
    'create trigger auditar after insert or update or delete on %s for each row execute function privado.auditar()',
    p_tabela
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Validações de documentos
-- ---------------------------------------------------------------------------

create function privado.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  soma int;
  dv1 int;
  dv2 int;
  pesos1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  pesos2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
begin
  if p_cnpj is null then
    return true;
  end if;
  if p_cnpj !~ '^\d{14}$' or p_cnpj ~ '^(\d)\1{13}$' then
    return false;
  end if;
  d := regexp_split_to_array(p_cnpj, '')::int[];
  soma := 0;
  for i in 1..12 loop soma := soma + d[i] * pesos1[i]; end loop;
  dv1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := 0;
  for i in 1..13 loop
    soma := soma + (case when i = 13 then dv1 else d[i] end) * pesos2[i];
  end loop;
  dv2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  return d[13] = dv1 and d[14] = dv2;
end;
$$;

grant execute on all functions in schema privado to authenticated, service_role;
