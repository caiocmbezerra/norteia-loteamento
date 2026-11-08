-- Fase 6b · Permutas com o dono do terreno (RN-T01 a RN-T05).
-- Física: lotes do permutante saem do estoque (status permuta); o valor econômico é gerencial,
-- não é caixa (RN-T02). Financeira: percentual sobre o recebido, o principal ou o VGV,
-- apurado pela projeção a partir dos fatos (RN-T03); aqui ficam só o contrato e os repasses pagos.

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'permutas.gerenciar'),
  ('financeiro', 'permutas.gerenciar');

create table public.permutantes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  documento text check (documento is null or documento ~ '^\d{11}$|^\d{14}$'),
  email extensions.citext,
  telefone text,
  -- Acesso ao extrato (portal, Fase 7).
  usuario_id uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

create table public.permutas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  permutante_id uuid not null,
  tipo text not null check (tipo in ('fisica', 'financeira')),
  inicio date not null,
  -- Financeira
  percentual numeric(8, 6) check (percentual > 0 and percentual < 1),
  base text check (base in ('recebido', 'principal', 'vgv')),
  abate_distrato boolean,
  -- Física: valor de mercado dos lotes entregues (gerencial e fiscal — PL-09).
  valor_economico_centavos bigint check (valor_economico_centavos >= 0),
  observacao text,
  situacao text not null default 'vigente' check (situacao in ('vigente', 'encerrada')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check ((tipo = 'financeira') = (percentual is not null and base is not null and abate_distrato is not null)),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, permutante_id) references public.permutantes (tenant_id, id) on delete restrict
);

create table public.permuta_lotes (
  tenant_id uuid not null,
  permuta_id uuid not null,
  lote_id uuid not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (permuta_id, lote_id),
  unique (lote_id),
  foreign key (tenant_id, permuta_id) references public.permutas (tenant_id, id) on delete restrict,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete restrict
);

create table public.repasses_permuta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  permuta_id uuid not null,
  data date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  observacao text,
  estornado_em timestamptz,
  motivo_estorno text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check ((estornado_em is null) = (motivo_estorno is null)),
  foreign key (tenant_id, permuta_id) references public.permutas (tenant_id, id) on delete restrict
);

create index permutantes_tenant_idx on public.permutantes (tenant_id);
create index permutantes_usuario_idx on public.permutantes (usuario_id) where usuario_id is not null;
create index permutas_empreendimento_idx on public.permutas (tenant_id, empreendimento_id);
create index permutas_permutante_idx on public.permutas (tenant_id, permutante_id);
create index permuta_lotes_tenant_lote_idx on public.permuta_lotes (tenant_id, lote_id);
create index permuta_lotes_tenant_permuta_idx on public.permuta_lotes (tenant_id, permuta_id);
create index repasses_permuta_idx on public.repasses_permuta (tenant_id, permuta_id);

create trigger permutas_por_funcao before update or delete on public.permutas
  for each row execute function privado.carteira_somente_por_funcao();
create trigger permuta_lotes_por_funcao before update or delete on public.permuta_lotes
  for each row execute function privado.carteira_somente_por_funcao();
create trigger repasses_por_funcao before update or delete on public.repasses_permuta
  for each row execute function privado.carteira_somente_por_funcao();

alter table public.permutantes enable row level security;
alter table public.permutas enable row level security;
alter table public.permuta_lotes enable row level security;
alter table public.repasses_permuta enable row level security;

create policy "ler permutantes" on public.permutantes for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id) or usuario_id = (select auth.uid()));
create policy "cadastrar permutantes" on public.permutantes for insert to authenticated
  with check (privado.pode('permutas.gerenciar', tenant_id));
create policy "alterar permutantes" on public.permutantes for update to authenticated
  using (privado.pode('permutas.gerenciar', tenant_id)) with check (privado.pode('permutas.gerenciar', tenant_id));

-- O permutante com acesso vê só as próprias permutas (RN-T05).
create function privado.e_permutante(p_permutante uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.permutantes where id = p_permutante and usuario_id = auth.uid()) $$;

create policy "ler permutas" on public.permutas for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id) or privado.e_permutante(permutante_id));
create policy "ler lotes da permuta" on public.permuta_lotes for select to authenticated
  using (exists (select 1 from public.permutas p where p.id = permuta_id));
create policy "ler repasses" on public.repasses_permuta for select to authenticated
  using (exists (select 1 from public.permutas p where p.id = permuta_id));
revoke insert, update, delete, truncate on public.permutas, public.permuta_lotes, public.repasses_permuta from authenticated, anon;
revoke delete, truncate on public.permutantes from authenticated, anon;

select privado.instrumentar('public.permutantes');
select privado.instrumentar('public.permutas');
select privado.instrumentar('public.permuta_lotes');
select privado.instrumentar('public.repasses_permuta');

-- p_dados: {tipo, inicio, percentual?, base?, abate_distrato?, valor_economico_centavos?, observacao?}
-- p_lotes: lotes disponíveis entregues (física).
create function public.criar_permuta(p_empreendimento uuid, p_permutante uuid, p_dados jsonb, p_lotes uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
  v_tipo text := p_dados ->> 'tipo';
  v_id uuid;
  v_n integer;
begin
  select * into e from public.empreendimentos where id = p_empreendimento;
  if e.id is null or not privado.pode('permutas.gerenciar', e.tenant_id, 'empreendimento', e.id) then
    raise exception 'Sem permissão para registrar permutas.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.permutantes where id = p_permutante and tenant_id = e.tenant_id) then
    raise exception 'Permutante não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  if v_tipo = 'fisica' then
    if coalesce(array_length(p_lotes, 1), 0) = 0 then
      raise exception 'Escolha os lotes entregues ao permutante.' using errcode = 'check_violation', hint = 'lotes';
    end if;
    select count(*) into v_n from public.lotes
     where id = any (p_lotes) and empreendimento_id = e.id and status = 'disponivel';
    if v_n <> array_length(p_lotes, 1) then
      raise exception 'Só lotes disponíveis deste empreendimento entram na permuta.' using errcode = 'check_violation', hint = 'lotes';
    end if;
  elsif v_tipo is distinct from 'financeira' then
    raise exception 'Tipo de permuta inválido.' using errcode = 'check_violation';
  end if;

  perform set_config('app.carteira', 'on', true);
  insert into public.permutas (
    tenant_id, empreendimento_id, permutante_id, tipo, inicio, percentual, base, abate_distrato,
    valor_economico_centavos, observacao
  ) values (
    e.tenant_id, e.id, p_permutante, v_tipo, coalesce((p_dados ->> 'inicio')::date, current_date),
    (p_dados ->> 'percentual')::numeric, p_dados ->> 'base', (p_dados ->> 'abate_distrato')::boolean,
    (p_dados ->> 'valor_economico_centavos')::bigint, nullif(trim(coalesce(p_dados ->> 'observacao', '')), '')
  ) returning id into v_id;
  if v_tipo = 'fisica' then
    insert into public.permuta_lotes (tenant_id, permuta_id, lote_id)
    select e.tenant_id, v_id, l from unnest(p_lotes) l;
    perform set_config('app.transicao_lote', 'on', true);
    update public.lotes set status = 'permuta' where id = any (p_lotes);
    perform set_config('app.transicao_lote', '', true);
  end if;
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

create function public.registrar_repasse(p_permuta uuid, p_data date, p_valor bigint, p_observacao text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pm public.permutas;
  v_id uuid;
begin
  select * into pm from public.permutas where id = p_permuta;
  if pm.id is null or not privado.pode('permutas.gerenciar', pm.tenant_id, 'empreendimento', pm.empreendimento_id) then
    raise exception 'Sem permissão para registrar repasses.' using errcode = 'insufficient_privilege';
  end if;
  if pm.tipo <> 'financeira' then
    raise exception 'Repasse só existe na permuta financeira.' using errcode = 'check_violation';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor repassado.' using errcode = 'check_violation', hint = 'valor';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do repasse não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  insert into public.repasses_permuta (tenant_id, permuta_id, data, valor_centavos, observacao)
  values (pm.tenant_id, pm.id, p_data, p_valor, nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.estornar_repasse(p_repasse uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.repasses_permuta;
  pm public.permutas;
begin
  select * into r from public.repasses_permuta where id = p_repasse for update;
  select * into pm from public.permutas where id = r.permuta_id;
  if r.id is null or not privado.pode('permutas.gerenciar', pm.tenant_id, 'empreendimento', pm.empreendimento_id) then
    raise exception 'Sem permissão para estornar repasses.' using errcode = 'insufficient_privilege';
  end if;
  if r.estornado_em is not null then
    raise exception 'O repasse já foi estornado.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do estorno.' using errcode = 'check_violation';
  end if;
  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  update public.repasses_permuta set estornado_em = now(), motivo_estorno = trim(p_motivo) where id = r.id;
  perform set_config('app.carteira', '', true);
end;
$$;

revoke execute on function public.criar_permuta(uuid, uuid, jsonb, uuid[]) from public, anon;
revoke execute on function public.registrar_repasse(uuid, date, bigint, text) from public, anon;
revoke execute on function public.estornar_repasse(uuid, text) from public, anon;
grant execute on function public.criar_permuta(uuid, uuid, jsonb, uuid[]) to authenticated;
grant execute on function public.registrar_repasse(uuid, date, bigint, text) to authenticated;
grant execute on function public.estornar_repasse(uuid, text) to authenticated;
grant execute on function privado.e_permutante(uuid) to authenticated, service_role;
revoke execute on function privado.e_permutante(uuid) from public, anon;
