-- Fase 4 · Comercial: compradores, imobiliárias, corretores, reservas e vendas.
-- Reserva e venda só pelas funções abaixo (RN-C02, RN-C03, RN-C04); venda só com o
-- loteamento registrado (RN-C01); corretor vê a disponibilidade, não os números (RN-C07).

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'comercial.ler'),
  ('comercial_gestor', 'comercial.ler'),
  ('financeiro', 'comercial.ler'),
  ('contador', 'comercial.ler'),
  ('engenharia', 'comercial.ler'),
  ('socio_leitura', 'comercial.ler'),
  ('dono', 'venda.reservar'),
  ('comercial_gestor', 'venda.reservar'),
  ('corretor', 'venda.reservar'),
  ('dono', 'venda.registrar'),
  ('comercial_gestor', 'venda.registrar'),
  ('dono', 'comercial.cadastrar'),
  ('comercial_gestor', 'comercial.cadastrar'),
  ('corretor', 'comercial.cadastrar');

create function privado.cpf_valido(p_cpf text)
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
begin
  if p_cpf is null then
    return true;
  end if;
  if p_cpf !~ '^\d{11}$' or p_cpf ~ '^(\d)\1{10}$' then
    return false;
  end if;
  d := regexp_split_to_array(p_cpf, '')::int[];
  soma := 0;
  for i in 1..9 loop soma := soma + d[i] * (11 - i); end loop;
  dv1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := 0;
  for i in 1..9 loop soma := soma + d[i] * (12 - i); end loop;
  soma := soma + dv1 * 2;
  dv2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  return d[10] = dv1 and d[11] = dv2;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastros comerciais
-- ---------------------------------------------------------------------------

create table public.compradores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  cpf text check (privado.cpf_valido(cpf)),
  email extensions.citext,
  telefone text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

comment on table public.compradores is 'Dados pessoais (LGPD, PL-15): leitura restrita a papéis comerciais e financeiros.';
create unique index compradores_cpf_idx on public.compradores (tenant_id, cpf) where cpf is not null;

create table public.imobiliarias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  cnpj text check (privado.cnpj_valido(cnpj)),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

create table public.corretores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  creci text,
  imobiliaria_id uuid,
  -- Usuário da plataforma, quando o corretor tem acesso (papel corretor).
  usuario_id uuid references public.perfis (id) on delete set null,
  comissao_percentual numeric(6, 4) not null default 0.05 check (comissao_percentual between 0 and 1),
  -- RN-C06: comissão paga no ato da venda ou proporcional ao recebido.
  comissao_modo text not null default 'ato' check (comissao_modo in ('ato', 'recebido')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (tenant_id, usuario_id),
  foreign key (tenant_id, imobiliaria_id) references public.imobiliarias (tenant_id, id) on delete set null (imobiliaria_id)
);

create index corretores_imobiliaria_idx on public.corretores (tenant_id, imobiliaria_id) where imobiliaria_id is not null;

-- ---------------------------------------------------------------------------
-- Reservas e vendas
-- ---------------------------------------------------------------------------

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  lote_id uuid not null,
  corretor_id uuid,
  cliente_nome text not null check (length(trim(cliente_nome)) >= 2),
  expira_em timestamptz not null,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'convertida', 'cancelada', 'expirada')),
  motivo_encerramento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, corretor_id) references public.corretores (tenant_id, id) on delete restrict
);

-- RN-C02: no máximo uma reserva ativa por lote.
create unique index reservas_ativa_por_lote_idx on public.reservas (lote_id) where situacao = 'ativa';
create index reservas_empreendimento_idx on public.reservas (tenant_id, empreendimento_id);
create index reservas_expiracao_idx on public.reservas (expira_em) where situacao = 'ativa';
create index reservas_corretor_idx on public.reservas (tenant_id, corretor_id) where corretor_id is not null;

create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  lote_id uuid not null,
  comprador_id uuid not null,
  corretor_id uuid,
  reserva_id uuid,
  data_venda date not null,
  preco_centavos bigint not null check (preco_centavos > 0),
  entrada_centavos bigint not null check (entrada_centavos >= 0),
  parcelas integer not null check (parcelas between 0 and 480),
  juros_mensal numeric(12, 8) not null check (juros_mensal >= 0),
  sistema text not null check (sistema in ('price', 'sac')),
  primeira_parcela_em date,
  comissao_percentual numeric(6, 4) not null default 0 check (comissao_percentual between 0 and 1),
  comissao_modo text not null default 'ato' check (comissao_modo in ('ato', 'recebido')),
  justificativa_sem_registro text,
  situacao text not null default 'ativa' check (situacao in ('ativa', 'cancelada', 'distratada')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check (entrada_centavos <= preco_centavos),
  check ((parcelas = 0) = (entrada_centavos = preco_centavos)),
  check (parcelas = 0 or primeira_parcela_em is not null),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, comprador_id) references public.compradores (tenant_id, id) on delete restrict,
  foreign key (tenant_id, corretor_id) references public.corretores (tenant_id, id) on delete restrict,
  foreign key (tenant_id, reserva_id) references public.reservas (tenant_id, id) on delete restrict
);

comment on table public.vendas is
  'Venda do lote (compromisso). O contrato com parcelas, assinatura e cobrança é a Fase 5.';

-- RN-C02: no máximo uma venda ativa por lote.
create unique index vendas_ativa_por_lote_idx on public.vendas (lote_id) where situacao = 'ativa';
create index vendas_empreendimento_idx on public.vendas (tenant_id, empreendimento_id);
create index vendas_comprador_idx on public.vendas (tenant_id, comprador_id);
create index vendas_corretor_idx on public.vendas (tenant_id, corretor_id) where corretor_id is not null;
create index vendas_reserva_idx on public.vendas (tenant_id, reserva_id) where reserva_id is not null;
create index vendas_lote_idx on public.vendas (tenant_id, lote_id);
create index reservas_lote_idx on public.reservas (tenant_id, lote_id);

-- Venda não muda depois de registrada; alterações vêm por aditivo (Fase 5) ou distrato (Fase 6).
create function privado.venda_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.transicao_lote', true) = 'on' then
    return new;
  end if;
  raise exception 'A venda registrada não é alterada diretamente; use aditivo ou distrato.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger venda_imutavel
  before update or delete on public.vendas
  for each row execute function privado.venda_imutavel();

-- ---------------------------------------------------------------------------
-- Funções comerciais (RN-C01 a RN-C04)
-- ---------------------------------------------------------------------------

-- Reservas vencidas deixam de valer; o lote volta a ficar disponível.
create function public.expirar_reservas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('app.transicao_lote', 'on', true);
  with vencidas as (
    update public.reservas set situacao = 'expirada', motivo_encerramento = 'Prazo da reserva vencido'
     where situacao = 'ativa' and expira_em <= now()
     returning lote_id
  )
  update public.lotes l set status = 'disponivel'
    from vencidas v
   where l.id = v.lote_id and l.status = 'reservado';
  get diagnostics n = row_count;
  perform set_config('app.transicao_lote', '', true);
  return n;
end;
$$;

create function public.reservar_lote(
  p_lote uuid,
  p_cliente_nome text,
  p_corretor uuid default null,
  p_horas integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  v_corretor uuid := p_corretor;
  v_horas integer;
  v_id uuid;
begin
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or not privado.pode('venda.reservar', l.tenant_id, 'empreendimento', l.empreendimento_id) then
    raise exception 'Sem permissão para reservar este lote.' using errcode = 'insufficient_privilege';
  end if;

  perform public.expirar_reservas();
  select * into l from public.lotes where id = p_lote;
  if l.status <> 'disponivel' then
    raise exception 'O lote não está disponível (situação: %).', l.status using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;

  -- Corretor que reserva para si mesmo
  if v_corretor is null then
    select id into v_corretor from public.corretores
     where tenant_id = l.tenant_id and usuario_id = auth.uid() and ativo;
  end if;

  v_horas := coalesce(
    p_horas,
    (public.parametro_vigente('comercial.prazo_reserva_horas', current_date, l.tenant_id, 'empreendimento', l.empreendimento_id) #>> array[]::text[])::integer,
    48
  );
  if v_horas not between 1 and 720 then
    raise exception 'Prazo de reserva inválido.' using errcode = 'check_violation';
  end if;

  perform set_config('app.transicao_lote', 'on', true);
  insert into public.reservas (tenant_id, empreendimento_id, lote_id, corretor_id, cliente_nome, expira_em)
  values (l.tenant_id, l.empreendimento_id, l.id, v_corretor, trim(p_cliente_nome), now() + make_interval(hours => v_horas))
  returning id into v_id;
  update public.lotes set status = 'reservado' where id = l.id;
  perform set_config('app.transicao_lote', '', true);
  return v_id;
end;
$$;

create function public.cancelar_reserva(p_reserva uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reservas;
  v_corretor_proprio boolean;
begin
  select * into r from public.reservas where id = p_reserva for update;
  if r.id is null then
    raise exception 'Reserva não encontrada.' using errcode = 'no_data_found';
  end if;
  select r.criado_por = auth.uid()
      or exists (select 1 from public.corretores c where c.id = r.corretor_id and c.usuario_id = auth.uid())
    into v_corretor_proprio;
  if not (privado.pode('venda.registrar', r.tenant_id, 'empreendimento', r.empreendimento_id) or v_corretor_proprio) then
    raise exception 'Sem permissão para cancelar esta reserva.' using errcode = 'insufficient_privilege';
  end if;
  if r.situacao <> 'ativa' then
    raise exception 'A reserva não está ativa.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  perform set_config('app.transicao_lote', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  update public.reservas set situacao = 'cancelada', motivo_encerramento = trim(p_motivo) where id = r.id;
  update public.lotes set status = 'disponivel' where id = r.lote_id and status = 'reservado';
  perform set_config('app.transicao_lote', '', true);
end;
$$;

-- Venda (RN-C01: registro; RN-C02: sem duplicidade). p_venda: comprador_id, corretor_id,
-- data_venda, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema,
-- primeira_parcela_em, comissao_percentual, comissao_modo.
create function public.vender_lote(p_lote uuid, p_venda jsonb, p_justificativa text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  e public.empreendimentos;
  r public.reservas;
  v_id uuid;
  v_permite boolean;
begin
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or not privado.pode('venda.registrar', l.tenant_id, 'empreendimento', l.empreendimento_id) then
    raise exception 'Sem permissão para registrar a venda.' using errcode = 'insufficient_privilege';
  end if;
  select * into e from public.empreendimentos where id = l.empreendimento_id;

  -- RN-C01 // VALIDAR COM ADVOGADO (PL-01)
  if e.data_registro is null then
    v_permite := coalesce(
      (public.parametro_vigente('comercial.permite_venda_sem_registro', current_date, l.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::boolean,
      false
    );
    if not v_permite then
      raise exception 'Venda bloqueada: o loteamento ainda não foi registrado em cartório (Lei 6.766).'
        using errcode = 'check_violation', hint = 'sem_registro';
    end if;
    if length(trim(coalesce(p_justificativa, ''))) < 10 then
      raise exception 'Informe a justificativa para vender antes do registro.' using errcode = 'check_violation', hint = 'sem_registro';
    end if;
  end if;

  perform public.expirar_reservas();
  select * into l from public.lotes where id = p_lote;
  if l.status not in ('disponivel', 'reservado') then
    raise exception 'O lote não está disponível para venda (situação: %).', l.status
      using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;
  select * into r from public.reservas where lote_id = l.id and situacao = 'ativa';

  perform set_config('app.transicao_lote', 'on', true);
  if p_justificativa is not null then
    perform set_config('app.motivo', p_justificativa, true);
  end if;
  insert into public.vendas (
    tenant_id, empreendimento_id, lote_id, comprador_id, corretor_id, reserva_id, data_venda,
    preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em,
    comissao_percentual, comissao_modo, justificativa_sem_registro
  ) values (
    l.tenant_id, l.empreendimento_id, l.id,
    (p_venda ->> 'comprador_id')::uuid,
    coalesce((p_venda ->> 'corretor_id')::uuid, r.corretor_id),
    r.id,
    coalesce((p_venda ->> 'data_venda')::date, current_date),
    (p_venda ->> 'preco_centavos')::bigint,
    (p_venda ->> 'entrada_centavos')::bigint,
    (p_venda ->> 'parcelas')::integer,
    (p_venda ->> 'juros_mensal')::numeric,
    p_venda ->> 'sistema',
    (p_venda ->> 'primeira_parcela_em')::date,
    coalesce((p_venda ->> 'comissao_percentual')::numeric, 0),
    coalesce(p_venda ->> 'comissao_modo', 'ato'),
    case when e.data_registro is null then trim(p_justificativa) end
  ) returning id into v_id;
  if r.id is not null then
    update public.reservas set situacao = 'convertida', motivo_encerramento = 'Venda registrada' where id = r.id;
  end if;
  update public.lotes set status = 'vendido' where id = l.id;
  perform set_config('app.transicao_lote', '', true);
  return v_id;
end;
$$;

revoke execute on function public.expirar_reservas() from public, anon, authenticated;
grant execute on function public.expirar_reservas() to service_role;
revoke execute on function public.reservar_lote(uuid, text, uuid, integer) from public, anon;
revoke execute on function public.cancelar_reserva(uuid, text) from public, anon;
revoke execute on function public.vender_lote(uuid, jsonb, text) from public, anon;
grant execute on function public.reservar_lote(uuid, text, uuid, integer) to authenticated;
grant execute on function public.cancelar_reserva(uuid, text) to authenticated;
grant execute on function public.vender_lote(uuid, jsonb, text) to authenticated;
grant execute on all functions in schema privado to authenticated, service_role;
revoke execute on all functions in schema privado from public, anon;

-- Expiração periódica (RN-C03). A leitura já trata reservas vencidas na reserva/venda.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('expirar-reservas', '*/5 * * * *', 'select public.expirar_reservas()');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.compradores enable row level security;
alter table public.imobiliarias enable row level security;
alter table public.corretores enable row level security;
alter table public.reservas enable row level security;
alter table public.vendas enable row level security;

-- Corretor vinculado ao usuário atual?
create function privado.e_corretor(p_corretor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.corretores where id = p_corretor and usuario_id = auth.uid()) $$;
grant execute on function privado.e_corretor(uuid) to authenticated, service_role;

-- Dados pessoais: quem cadastra (dono, gestor, corretor) e quem audita (dono, financeiro, contador).
create policy "ler compradores" on public.compradores for select to authenticated
  using (privado.pode('comercial.cadastrar', tenant_id) or privado.pode('auditoria.ler', tenant_id));
create policy "cadastrar compradores" on public.compradores for insert to authenticated
  with check (privado.pode('comercial.cadastrar', tenant_id));
create policy "alterar compradores" on public.compradores for update to authenticated
  using (privado.pode('comercial.cadastrar', tenant_id)) with check (privado.pode('comercial.cadastrar', tenant_id));

create policy "ler imobiliárias" on public.imobiliarias for select to authenticated
  using (privado.e_membro(tenant_id));
create policy "cadastrar imobiliárias" on public.imobiliarias for insert to authenticated
  with check (privado.pode('venda.registrar', tenant_id));
create policy "alterar imobiliárias" on public.imobiliarias for update to authenticated
  using (privado.pode('venda.registrar', tenant_id)) with check (privado.pode('venda.registrar', tenant_id));

create policy "ler corretores" on public.corretores for select to authenticated
  using (privado.e_membro(tenant_id));
create policy "cadastrar corretores" on public.corretores for insert to authenticated
  with check (privado.pode('venda.registrar', tenant_id));
create policy "alterar corretores" on public.corretores for update to authenticated
  using (privado.pode('venda.registrar', tenant_id)) with check (privado.pode('venda.registrar', tenant_id));

-- Reservas: gestão vê todas; corretor vê as próprias (RN-C07). Escrita só pelas funções.
create policy "ler reservas" on public.reservas for select to authenticated
  using (
    privado.pode('comercial.ler', tenant_id, 'empreendimento', empreendimento_id)
    or privado.e_corretor(corretor_id)
    or criado_por = (select auth.uid())
  );
create policy "ler vendas" on public.vendas for select to authenticated
  using (privado.pode('comercial.ler', tenant_id, 'empreendimento', empreendimento_id) or privado.e_corretor(corretor_id));
revoke insert, update, delete, truncate on public.reservas, public.vendas from authenticated, anon;
revoke delete, truncate on public.compradores from authenticated, anon;

select privado.instrumentar('public.compradores');
select privado.instrumentar('public.imobiliarias');
select privado.instrumentar('public.corretores');
select privado.instrumentar('public.reservas');
select privado.instrumentar('public.vendas');
