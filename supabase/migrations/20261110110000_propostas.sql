-- Fase 4b · Proposta como etapa separada: o corretor (ou a gestão) registra as condições
-- negociadas; a gestão aceita ou recusa; a proposta aceita vira a venda, preenchida com as
-- mesmas condições, e passa a "convertida" quando a venda do lote é registrada.

create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  lote_id uuid not null,
  corretor_id uuid,
  cliente_nome text not null check (length(trim(cliente_nome)) between 2 and 200),
  cliente_cpf text check (cliente_cpf is null or cliente_cpf ~ '^\d{11}$'),
  cliente_email text check (cliente_email is null or length(cliente_email) <= 200),
  cliente_telefone text check (cliente_telefone is null or length(cliente_telefone) <= 30),
  preco_centavos bigint not null check (preco_centavos > 0),
  entrada_centavos bigint not null check (entrada_centavos >= 0),
  parcelas integer not null check (parcelas between 0 and 480),
  juros_mensal numeric(12, 8) not null check (juros_mensal >= 0 and juros_mensal < 0.1),
  sistema text not null check (sistema in ('price', 'sac')),
  primeira_parcela_em date,
  observacao text check (observacao is null or length(observacao) <= 1000),
  valida_ate date not null,
  situacao text not null default 'aberta'
    check (situacao in ('aberta', 'aceita', 'recusada', 'cancelada', 'convertida')),
  decidido_por uuid,
  decidido_em timestamptz,
  motivo text,
  venda_id uuid,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check (entrada_centavos <= preco_centavos),
  check ((parcelas = 0) = (entrada_centavos = preco_centavos)),
  check (parcelas = 0 or primeira_parcela_em is not null),
  check (cliente_cpf is null or privado.cpf_valido(cliente_cpf)),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, corretor_id) references public.corretores (tenant_id, id) on delete restrict,
  foreign key (tenant_id, venda_id) references public.vendas (tenant_id, id) on delete restrict
);
-- No máximo uma proposta aceita aguardando a venda por lote.
create unique index propostas_aceita_por_lote_idx on public.propostas (lote_id) where situacao = 'aceita';
create index propostas_empreendimento_idx on public.propostas (tenant_id, empreendimento_id, situacao);
create index propostas_lote_idx on public.propostas (tenant_id, lote_id);
create index propostas_corretor_idx on public.propostas (tenant_id, corretor_id) where corretor_id is not null;
create index propostas_venda_idx on public.propostas (tenant_id, venda_id) where venda_id is not null;

comment on table public.propostas is
  'Condições negociadas antes da venda (dominio.md, Proposta). Escrita só pelas funções.';

alter table public.propostas enable row level security;
-- RN-C07: o corretor vê as próprias propostas; a gestão vê todas.
create policy "ler propostas" on public.propostas for select to authenticated
  using (
    privado.pode('comercial.ler', tenant_id, 'empreendimento', empreendimento_id)
    or privado.e_corretor(corretor_id)
    or criado_por = (select auth.uid())
  );
revoke insert, update, delete, truncate on public.propostas from authenticated, anon;
select privado.instrumentar('public.propostas');

-- p_proposta: cliente_nome, cliente_cpf, cliente_email, cliente_telefone, corretor_id,
-- preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em,
-- observacao, valida_ate.
create function public.criar_proposta(p_lote uuid, p_proposta jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  r public.reservas;
  v_gestor boolean;
  v_corretor uuid;
  v_valida date := coalesce((p_proposta ->> 'valida_ate')::date, current_date + 7);
  v_id uuid;
begin
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or not privado.pode('venda.reservar', l.tenant_id, 'empreendimento', l.empreendimento_id) then
    raise exception 'Sem permissão para fazer proposta neste lote.' using errcode = 'insufficient_privilege';
  end if;
  v_gestor := privado.pode('venda.registrar', l.tenant_id, 'empreendimento', l.empreendimento_id);

  perform public.expirar_reservas();
  select * into l from public.lotes where id = p_lote;
  if l.status not in ('disponivel', 'reservado') then
    raise exception 'O lote não está disponível (situação: %).', l.status
      using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;
  select * into r from public.reservas where lote_id = l.id and situacao = 'ativa';

  select id into v_corretor from public.corretores
   where tenant_id = l.tenant_id and usuario_id = auth.uid() and ativo;
  -- Lote reservado por outro corretor: só a gestão propõe.
  if r.id is not null and not v_gestor
     and r.corretor_id is distinct from v_corretor and r.criado_por is distinct from auth.uid() then
    raise exception 'O lote está reservado para outro corretor.' using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;
  if v_gestor then
    v_corretor := coalesce((p_proposta ->> 'corretor_id')::uuid, r.corretor_id, v_corretor);
  else
    v_corretor := coalesce(v_corretor, r.corretor_id);
  end if;

  if v_valida < current_date or v_valida > current_date + 90 then
    raise exception 'Validade da proposta: de hoje até 90 dias.' using errcode = 'check_violation', hint = 'valida_ate';
  end if;

  insert into public.propostas (
    tenant_id, empreendimento_id, lote_id, corretor_id, cliente_nome, cliente_cpf, cliente_email,
    cliente_telefone, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema,
    primeira_parcela_em, observacao, valida_ate
  ) values (
    l.tenant_id, l.empreendimento_id, l.id, v_corretor,
    trim(p_proposta ->> 'cliente_nome'),
    nullif(p_proposta ->> 'cliente_cpf', ''),
    nullif(trim(coalesce(p_proposta ->> 'cliente_email', '')), ''),
    nullif(trim(coalesce(p_proposta ->> 'cliente_telefone', '')), ''),
    (p_proposta ->> 'preco_centavos')::bigint,
    (p_proposta ->> 'entrada_centavos')::bigint,
    (p_proposta ->> 'parcelas')::integer,
    (p_proposta ->> 'juros_mensal')::numeric,
    p_proposta ->> 'sistema',
    (p_proposta ->> 'primeira_parcela_em')::date,
    nullif(trim(coalesce(p_proposta ->> 'observacao', '')), ''),
    v_valida
  ) returning id into v_id;
  return v_id;
end;
$$;

create function public.decidir_proposta(p_proposta uuid, p_aceitar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propostas;
  v_status public.lote_status;
begin
  select * into p from public.propostas where id = p_proposta for update;
  if p.id is null or not privado.pode('venda.registrar', p.tenant_id, 'empreendimento', p.empreendimento_id) then
    raise exception 'Sem permissão para decidir propostas.' using errcode = 'insufficient_privilege';
  end if;
  if p.situacao <> 'aberta' then
    raise exception 'Esta proposta já foi decidida.' using errcode = 'check_violation';
  end if;
  if not p_aceitar and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  if p_aceitar then
    if p.valida_ate < current_date then
      raise exception 'A proposta venceu em %; peça uma nova.', to_char(p.valida_ate, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    select status into v_status from public.lotes where id = p.lote_id;
    if v_status not in ('disponivel', 'reservado') then
      raise exception 'O lote não está mais disponível.' using errcode = 'check_violation', hint = 'lote_indisponivel';
    end if;
    if exists (select 1 from public.propostas where lote_id = p.lote_id and situacao = 'aceita') then
      raise exception 'Já existe uma proposta aceita para este lote; registre a venda ou cancele-a antes.'
        using errcode = 'check_violation';
    end if;
  end if;
  update public.propostas
     set situacao = case when p_aceitar then 'aceita' else 'recusada' end,
         decidido_por = auth.uid(),
         decidido_em = now(),
         motivo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p.id;
end;
$$;

create function public.cancelar_proposta(p_proposta uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propostas;
begin
  select * into p from public.propostas where id = p_proposta for update;
  if p.id is null or not (
    privado.pode('venda.registrar', p.tenant_id, 'empreendimento', p.empreendimento_id)
    or p.criado_por = auth.uid()
  ) then
    raise exception 'Sem permissão para cancelar esta proposta.' using errcode = 'insufficient_privilege';
  end if;
  if p.situacao not in ('aberta', 'aceita') then
    raise exception 'Só propostas abertas ou aceitas podem ser canceladas.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  update public.propostas set situacao = 'cancelada', motivo = trim(p_motivo) where id = p.id;
end;
$$;

revoke execute on function public.criar_proposta(uuid, jsonb) from public, anon;
revoke execute on function public.decidir_proposta(uuid, boolean, text) from public, anon;
revoke execute on function public.cancelar_proposta(uuid, text) from public, anon;
grant execute on function public.criar_proposta(uuid, jsonb) to authenticated;
grant execute on function public.decidir_proposta(uuid, boolean, text) to authenticated;
grant execute on function public.cancelar_proposta(uuid, text) to authenticated;

-- A venda do lote converte a proposta aceita e encerra as que ficaram em aberto.
create function privado.converter_propostas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.propostas set situacao = 'convertida', venda_id = new.id
   where lote_id = new.lote_id and situacao = 'aceita';
  update public.propostas set situacao = 'cancelada', motivo = 'Lote vendido'
   where lote_id = new.lote_id and situacao = 'aberta';
  return null;
end;
$$;
create trigger converter_propostas
  after insert on public.vendas
  for each row execute function privado.converter_propostas();
