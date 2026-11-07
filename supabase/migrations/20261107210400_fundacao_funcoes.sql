-- Fase 1 · Fundação (5/5): funções de negócio expostas à aplicação (RPC).
-- Todas verificam a permissão explicitamente; as que escrevem por baixo da RLS são security definer.

-- ---------------------------------------------------------------------------
-- criar_tenant: cadastro inicial (RN-G02). Cria o cliente, torna o usuário dono e
-- cria uma empresa e uma SPE padrão para o pequeno loteador não precisar configurar nada.
-- ---------------------------------------------------------------------------

create function public.criar_tenant(p_nome text, p_razao_social text default null, p_cnpj text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_membro uuid;
  v_empresa uuid;
begin
  if v_uid is null then
    raise exception 'É preciso estar autenticado.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.tenants (nome) values (trim(p_nome)) returning id into v_tenant;
  insert into public.membros (tenant_id, usuario_id) values (v_tenant, v_uid) returning id into v_membro;
  insert into public.atribuicoes_papel (tenant_id, membro_id, papel) values (v_tenant, v_membro, 'dono');
  insert into public.empresas (tenant_id, razao_social, cnpj)
    values (v_tenant, coalesce(nullif(trim(p_razao_social), ''), trim(p_nome)), nullif(p_cnpj, ''))
    returning id into v_empresa;
  insert into public.spes (tenant_id, empresa_id, razao_social, cnpj)
    values (v_tenant, v_empresa, coalesce(nullif(trim(p_razao_social), ''), trim(p_nome)), nullif(p_cnpj, ''));

  return v_tenant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Convites: o token só existe em claro na resposta; no banco fica o hash.
-- ---------------------------------------------------------------------------

create function public.criar_convite(
  p_tenant uuid,
  p_email text,
  p_papel public.papel,
  p_escopo_tipo public.escopo default 'tenant',
  p_escopo_id uuid default null,
  p_validade_dias integer default 7
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not privado.pode('membros.gerenciar', p_tenant) then
    raise exception 'Sem permissão para convidar membros.' using errcode = 'insufficient_privilege';
  end if;
  if p_validade_dias not between 1 and 30 then
    raise exception 'Validade do convite deve ficar entre 1 e 30 dias.' using errcode = 'check_violation';
  end if;

  insert into public.convites (tenant_id, email, papel, escopo_tipo, escopo_id, token_hash, expira_em)
  values (
    p_tenant, lower(trim(p_email)), p_papel, p_escopo_tipo, p_escopo_id,
    extensions.digest(v_token, 'sha256'), now() + make_interval(days => p_validade_dias)
  );
  return v_token;
end;
$$;

create function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  c public.convites;
  v_membro uuid;
begin
  if v_uid is null then
    raise exception 'É preciso estar autenticado.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.convites
   where token_hash = extensions.digest(p_token, 'sha256')
   for update;

  if c.id is null or c.aceito_em is not null or c.cancelado_em is not null or c.expira_em < now() then
    raise exception 'Convite inválido, expirado ou já utilizado.' using errcode = 'invalid_parameter_value';
  end if;
  if c.email::text <> v_email then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.membros (tenant_id, usuario_id) values (c.tenant_id, v_uid)
  on conflict (tenant_id, usuario_id) do update set ativo = true
  returning id into v_membro;

  insert into public.atribuicoes_papel (tenant_id, membro_id, papel, escopo_tipo, escopo_id)
  values (c.tenant_id, v_membro, c.papel, c.escopo_tipo, c.escopo_id)
  on conflict do nothing;

  update public.convites set aceito_em = now(), aceito_por = v_uid where id = c.id;
  return c.tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parâmetros (RN-G06): definir cria nova vigência e encerra a anterior; nunca sobrescreve.
-- ---------------------------------------------------------------------------

create function public.definir_parametro(
  p_tenant uuid,
  p_chave text,
  p_valor jsonb,
  p_inicio date,
  p_motivo text,
  p_escopo text default 'tenant',
  p_escopo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_escopo_permissao public.escopo;
begin
  if p_escopo not in ('tenant', 'empresa', 'spe', 'empreendimento') then
    raise exception 'Escopo inválido: %.', p_escopo using errcode = 'invalid_parameter_value';
  end if;
  v_escopo_permissao := p_escopo::public.escopo;
  if not privado.pode('parametros.editar', p_tenant, v_escopo_permissao, p_escopo_id) then
    raise exception 'Sem permissão para alterar parâmetros.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da alteração.' using errcode = 'check_violation';
  end if;

  perform set_config('app.motivo', p_motivo, true);

  -- Vigências futuras a partir da nova data deixam de valer.
  delete from public.parametro_valores
   where tenant_id = p_tenant and chave = p_chave and escopo = p_escopo
     and escopo_id is not distinct from p_escopo_id
     and lower(vigencia) >= p_inicio;

  -- A vigência em curso termina na véspera do início da nova.
  update public.parametro_valores
     set vigencia = daterange(lower(vigencia), p_inicio)
   where tenant_id = p_tenant and chave = p_chave and escopo = p_escopo
     and escopo_id is not distinct from p_escopo_id
     and vigencia @> p_inicio;

  insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo)
  values (p_tenant, p_chave, p_escopo, p_escopo_id, p_valor, daterange(p_inicio, null), p_motivo)
  returning id into v_id;

  return v_id;
end;
$$;

-- Valor vigente numa data, do escopo mais específico para o mais geral:
-- empreendimento → SPE → empresa → tenant → plataforma.
create function public.parametro_vigente(
  p_chave text,
  p_data date,
  p_tenant uuid,
  p_escopo public.escopo default 'tenant',
  p_escopo_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_empreendimento uuid;
  v_spe uuid;
  v_empresa uuid;
  v_valor jsonb;
begin
  if p_escopo = 'empreendimento' then
    select e.id, e.spe_id, s.empresa_id into v_empreendimento, v_spe, v_empresa
      from public.empreendimentos e join public.spes s on s.id = e.spe_id
     where e.id = p_escopo_id and e.tenant_id = p_tenant;
  elsif p_escopo = 'spe' then
    select s.id, s.empresa_id into v_spe, v_empresa
      from public.spes s where s.id = p_escopo_id and s.tenant_id = p_tenant;
  elsif p_escopo = 'empresa' then
    v_empresa := p_escopo_id;
  end if;

  select pv.valor into v_valor
    from public.parametro_valores pv
   where pv.chave = p_chave
     and pv.vigencia @> p_data
     and (
       (pv.escopo = 'empreendimento' and pv.tenant_id = p_tenant and pv.escopo_id = v_empreendimento)
       or (pv.escopo = 'spe' and pv.tenant_id = p_tenant and pv.escopo_id = v_spe)
       or (pv.escopo = 'empresa' and pv.tenant_id = p_tenant and pv.escopo_id = v_empresa)
       or (pv.escopo = 'tenant' and pv.tenant_id = p_tenant)
       or pv.escopo = 'plataforma'
     )
   order by array_position(array['empreendimento', 'spe', 'empresa', 'tenant', 'plataforma'], pv.escopo)
   limit 1;

  return v_valor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções e higiene de acesso
-- ---------------------------------------------------------------------------

revoke execute on function public.criar_tenant(text, text, text) from public, anon;
revoke execute on function public.criar_convite(uuid, text, public.papel, public.escopo, uuid, integer) from public, anon;
revoke execute on function public.aceitar_convite(text) from public, anon;
revoke execute on function public.definir_parametro(uuid, text, jsonb, date, text, text, uuid) from public, anon;
revoke execute on function public.parametro_vigente(text, date, uuid, public.escopo, uuid) from public, anon;

grant execute on function public.criar_tenant(text, text, text) to authenticated;
grant execute on function public.criar_convite(uuid, text, public.papel, public.escopo, uuid, integer) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.definir_parametro(uuid, text, jsonb, date, text, text, uuid) to authenticated;
grant execute on function public.parametro_vigente(text, date, uuid, public.escopo, uuid) to authenticated;

-- Funções do schema privado não ficam disponíveis para anônimos.
revoke execute on all functions in schema privado from public, anon;

-- Visitante anônimo não acessa nenhuma tabela de negócio (portais públicos usarão funções próprias).
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
