-- Chamados de atendimento no portal do adquirente (L4, plano aprovado em 10/11/2026). O comprador
-- abre e conversa sobre o próprio contrato; a loteadora responde e acompanha a situação.
-- Mensagens não se alteram nem se apagam; tudo passa pela trilha de auditoria.

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'atendimento.responder'),
  ('financeiro', 'atendimento.responder'),
  ('comercial_gestor', 'atendimento.responder');

create table public.chamados (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  contrato_id uuid not null,
  assunto text not null check (length(trim(assunto)) between 3 and 120),
  categoria text not null check (categoria in ('financeiro', 'documentos', 'obra', 'escritura', 'outro')),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'em_atendimento', 'resolvido')),
  ultima_mensagem_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict
);
create index chamados_tenant_situacao_idx on public.chamados (tenant_id, situacao, ultima_mensagem_em desc);
create index chamados_contrato_idx on public.chamados (tenant_id, contrato_id);
create index chamados_empreendimento_idx on public.chamados (tenant_id, empreendimento_id);

create table public.chamado_mensagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  chamado_id uuid not null,
  autor_comprador boolean not null,
  texto text not null check (length(trim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  foreign key (tenant_id, chamado_id) references public.chamados (tenant_id, id) on delete restrict
);
create index chamado_mensagens_chamado_idx on public.chamado_mensagens (tenant_id, chamado_id, criado_em);

-- Leitura: o comprador do contrato e a loteadora com acesso à carteira do empreendimento.
create function privado.pode_ver_chamado(p_chamado uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chamados ch join public.contratos c on c.id = ch.contrato_id
     where ch.id = p_chamado
       and (privado.e_comprador(c.comprador_id)
            or privado.pode('carteira.ler', ch.tenant_id, 'empreendimento', ch.empreendimento_id))
  )
$$;
revoke execute on function privado.pode_ver_chamado(uuid) from public, anon;
grant execute on function privado.pode_ver_chamado(uuid) to authenticated, service_role;

alter table public.chamados enable row level security;
alter table public.chamado_mensagens enable row level security;
create policy "ler chamados" on public.chamados for select to authenticated
  using (privado.pode_ver_chamado(id));
create policy "ler mensagens de chamados" on public.chamado_mensagens for select to authenticated
  using (privado.pode_ver_chamado(chamado_id));
revoke insert, update, delete, truncate on public.chamados, public.chamado_mensagens from authenticated, anon;
select privado.instrumentar('public.chamados');
select privado.instrumentar('public.chamado_mensagens');

-- Comprador abre o chamado sobre o próprio contrato, com a primeira mensagem.
create function public.abrir_chamado(p_contrato uuid, p_assunto text, p_categoria text, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_id uuid;
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not privado.e_comprador(c.comprador_id) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_texto, ''))) < 1 then
    raise exception 'Escreva a sua mensagem.' using errcode = 'check_violation', hint = 'texto';
  end if;
  insert into public.chamados (tenant_id, empreendimento_id, contrato_id, assunto, categoria)
  values (c.tenant_id, c.empreendimento_id, c.id, trim(coalesce(p_assunto, '')), p_categoria)
  returning id into v_id;
  insert into public.chamado_mensagens (tenant_id, chamado_id, autor_comprador, texto)
  values (c.tenant_id, v_id, true, trim(p_texto));
  return v_id;
end;
$$;

-- Nova mensagem: do comprador (reabre se estava resolvido) ou da loteadora (passa a "em atendimento").
create function public.responder_chamado(p_chamado uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.chamados;
  c public.contratos;
  v_comprador boolean;
begin
  select * into ch from public.chamados where id = p_chamado for update;
  select * into c from public.contratos where id = ch.contrato_id;
  v_comprador := c.id is not null and privado.e_comprador(c.comprador_id);
  if ch.id is null or not (
    v_comprador or privado.pode('atendimento.responder', ch.tenant_id, 'empreendimento', ch.empreendimento_id)
  ) then
    raise exception 'Sem permissão para responder este chamado.' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_texto, ''))) < 1 then
    raise exception 'Escreva a sua mensagem.' using errcode = 'check_violation', hint = 'texto';
  end if;
  insert into public.chamado_mensagens (tenant_id, chamado_id, autor_comprador, texto)
  values (ch.tenant_id, ch.id, v_comprador, trim(p_texto));
  update public.chamados
     set ultima_mensagem_em = now(),
         situacao = case when v_comprador then case when situacao = 'resolvido' then 'aberto' else situacao end
                         else 'em_atendimento' end
   where id = ch.id;
end;
$$;

-- Loteadora marca como resolvido (ou devolve para atendimento).
create function public.mudar_situacao_chamado(p_chamado uuid, p_situacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.chamados;
begin
  select * into ch from public.chamados where id = p_chamado for update;
  if ch.id is null or not privado.pode('atendimento.responder', ch.tenant_id, 'empreendimento', ch.empreendimento_id) then
    raise exception 'Sem permissão para alterar este chamado.' using errcode = 'insufficient_privilege';
  end if;
  update public.chamados set situacao = p_situacao where id = ch.id;
end;
$$;

revoke execute on function public.abrir_chamado(uuid, text, text, text) from public, anon;
revoke execute on function public.responder_chamado(uuid, text) from public, anon;
revoke execute on function public.mudar_situacao_chamado(uuid, text) from public, anon;
grant execute on function public.abrir_chamado(uuid, text, text, text) to authenticated;
grant execute on function public.responder_chamado(uuid, text) to authenticated;
grant execute on function public.mudar_situacao_chamado(uuid, text) to authenticated;
