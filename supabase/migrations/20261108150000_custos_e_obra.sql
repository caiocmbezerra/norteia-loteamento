-- Fase 3 · Custos e obra: plano de contas, orçamento revisado, fornecedores, contratos,
-- contas a pagar e pagamentos. A projeção (realizado + comprometido + projetado) é feita
-- pelo pacote @norteia/projecao; o banco guarda os fatos (RN-F01, RN-F03, RN-G04).

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'custos.editar'),
  ('financeiro', 'custos.editar'),
  ('engenharia', 'custos.editar');

-- ---------------------------------------------------------------------------
-- Plano de contas (por cliente, com padrão de loteamento)
-- ---------------------------------------------------------------------------

create table public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  codigo text not null check (codigo ~ '^[a-z_]+(\.[a-z_]+)*$'),
  nome text not null check (length(trim(nome)) >= 2),
  ordem smallint not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, codigo)
);

comment on table public.centros_custo is
  'Plano de contas do cliente. Códigos com ponto indicam subcentros (infraestrutura.drenagem).';

create function privado.semear_centros_custo(p_tenant uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.centros_custo (tenant_id, codigo, nome, ordem)
  select p_tenant, codigo, nome, ordem
    from (values
      ('terreno', 'Terreno', 10),
      ('aprovacao', 'Aprovação e registro', 20),
      ('infraestrutura', 'Infraestrutura', 30),
      ('infraestrutura.terraplenagem', 'Terraplenagem', 31),
      ('infraestrutura.drenagem', 'Drenagem', 32),
      ('infraestrutura.agua', 'Rede de água', 33),
      ('infraestrutura.esgoto', 'Rede de esgoto', 34),
      ('infraestrutura.energia', 'Energia e iluminação', 35),
      ('infraestrutura.pavimentacao', 'Pavimentação', 36),
      ('infraestrutura.calcadas', 'Calçadas e meio-fio', 37),
      ('infraestrutura.paisagismo', 'Paisagismo', 38),
      ('infraestrutura.contrapartidas', 'Contrapartidas', 39),
      ('comercial.marketing', 'Marketing e stand', 50),
      ('comercial.comissao', 'Comissões', 51),
      ('administracao', 'Administração', 60),
      ('outros', 'Outros', 90)
    ) as v (codigo, nome, ordem)
  on conflict (tenant_id, codigo) do nothing;
$$;

create function privado.semear_centros_custo_gatilho()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.semear_centros_custo(new.id);
  return null;
end;
$$;

create trigger semear_centros_custo
  after insert on public.tenants
  for each row execute function privado.semear_centros_custo_gatilho();

-- Clientes já existentes
select privado.semear_centros_custo(id) from public.tenants;

-- ---------------------------------------------------------------------------
-- Orçamento revisado (o original está congelado no plano aprovado, RN-F16)
-- ---------------------------------------------------------------------------

create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  centro_codigo text not null,
  descricao text not null check (length(trim(descricao)) >= 1),
  tipo text not null default 'total' check (tipo in ('total', 'mensal')),
  valor_centavos bigint not null check (valor_centavos >= 0),
  mes_inicio integer not null check (mes_inicio >= 0),
  mes_fim integer not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check (mes_fim >= mes_inicio),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete cascade,
  foreign key (tenant_id, centro_codigo) references public.centros_custo (tenant_id, codigo) on update cascade
);

create index orcamento_itens_empreendimento_idx on public.orcamento_itens (tenant_id, empreendimento_id);
create index orcamento_itens_centro_idx on public.orcamento_itens (tenant_id, centro_codigo);

-- ---------------------------------------------------------------------------
-- Fornecedores, contratos, contas a pagar e pagamentos
-- ---------------------------------------------------------------------------

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  documento text check (documento ~ '^(\d{11}|\d{14})$'),
  email extensions.citext,
  telefone text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

create unique index fornecedores_documento_idx on public.fornecedores (tenant_id, documento) where documento is not null;

create table public.contratos_fornecedor (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  fornecedor_id uuid not null,
  centro_codigo text not null,
  descricao text not null check (length(trim(descricao)) >= 2),
  valor_centavos bigint not null check (valor_centavos > 0),
  data_inicio date not null,
  data_fim_prevista date not null,
  situacao text not null default 'vigente' check (situacao in ('vigente', 'encerrado', 'cancelado')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, empreendimento_id, id),
  check (data_fim_prevista >= data_inicio),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, fornecedor_id) references public.fornecedores (tenant_id, id) on delete restrict,
  foreign key (tenant_id, centro_codigo) references public.centros_custo (tenant_id, codigo) on update cascade
);

create index contratos_fornecedor_empreendimento_idx on public.contratos_fornecedor (tenant_id, empreendimento_id);
create index contratos_fornecedor_fornecedor_idx on public.contratos_fornecedor (tenant_id, fornecedor_id);
create index contratos_fornecedor_centro_idx on public.contratos_fornecedor (tenant_id, centro_codigo);

create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  centro_codigo text not null,
  fornecedor_id uuid,
  contrato_id uuid,
  descricao text not null check (length(trim(descricao)) >= 2),
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date not null,
  documento_numero text,
  cancelada_em timestamptz,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check ((cancelada_em is null) = (motivo_cancelamento is null)),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, fornecedor_id) references public.fornecedores (tenant_id, id) on delete restrict,
  foreign key (tenant_id, empreendimento_id, contrato_id)
    references public.contratos_fornecedor (tenant_id, empreendimento_id, id) on delete restrict,
  foreign key (tenant_id, centro_codigo) references public.centros_custo (tenant_id, codigo) on update cascade
);

create index contas_pagar_empreendimento_idx on public.contas_pagar (tenant_id, empreendimento_id);
create index contas_pagar_fornecedor_idx on public.contas_pagar (tenant_id, fornecedor_id) where fornecedor_id is not null;
create index contas_pagar_contrato_idx on public.contas_pagar (tenant_id, empreendimento_id, contrato_id) where contrato_id is not null;
create index contas_pagar_centro_idx on public.contas_pagar (tenant_id, centro_codigo);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conta_id uuid not null,
  data_pagamento date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  estornado_em timestamptz,
  motivo_estorno text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check ((estornado_em is null) = (motivo_estorno is null)),
  foreign key (tenant_id, conta_id) references public.contas_pagar (tenant_id, id) on delete restrict
);

create index pagamentos_conta_idx on public.pagamentos (tenant_id, conta_id);

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------

-- Conta ligada a contrato herda o centro de custo e o fornecedor do contrato.
create function privado.validar_conta_pagar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c public.contratos_fornecedor;
begin
  if new.contrato_id is not null then
    select * into c from public.contratos_fornecedor where id = new.contrato_id;
    if new.centro_codigo <> c.centro_codigo then
      raise exception 'A conta deve usar o mesmo centro de custo do contrato (%).', c.centro_codigo
        using errcode = 'check_violation';
    end if;
    new.fornecedor_id := c.fornecedor_id;
  end if;
  if tg_op = 'UPDATE' and old.cancelada_em is not null then
    raise exception 'Conta cancelada não pode ser alterada.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.cancelada_em is not null and exists (
    select 1 from public.pagamentos p where p.conta_id = new.id and p.estornado_em is null
  ) then
    raise exception 'Estorne os pagamentos antes de cancelar a conta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger validar_conta_pagar
  before insert or update on public.contas_pagar
  for each row execute function privado.validar_conta_pagar();

-- Pagamentos não ultrapassam o valor da conta; só o estorno pode ser alterado (RN-G04).
create function privado.validar_pagamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conta public.contas_pagar;
  v_pago bigint;
begin
  if tg_op = 'UPDATE' then
    if old.estornado_em is not null
       or (to_jsonb(new) - array['estornado_em', 'motivo_estorno', 'atualizado_em', 'atualizado_por'])
          is distinct from (to_jsonb(old) - array['estornado_em', 'motivo_estorno', 'atualizado_em', 'atualizado_por']) then
      raise exception 'Pagamento registrado não muda; faça um estorno (RN-G04).' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select * into v_conta from public.contas_pagar where id = new.conta_id for update;
  if v_conta.cancelada_em is not null then
    raise exception 'Conta cancelada não recebe pagamento.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(valor_centavos), 0) into v_pago
    from public.pagamentos where conta_id = new.conta_id and estornado_em is null;
  if v_pago + new.valor_centavos > v_conta.valor_centavos then
    raise exception 'O pagamento ultrapassa o saldo da conta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger validar_pagamento
  before insert or update on public.pagamentos
  for each row execute function privado.validar_pagamento();

grant execute on all functions in schema privado to authenticated, service_role;
revoke execute on all functions in schema privado from public, anon;

-- ---------------------------------------------------------------------------
-- RLS: leitura financeira; escrita custos.editar; sem exclusão de registros financeiros.
-- ---------------------------------------------------------------------------

alter table public.centros_custo enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.fornecedores enable row level security;
alter table public.contratos_fornecedor enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.pagamentos enable row level security;

create policy "ler centros de custo" on public.centros_custo for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id));
create policy "criar centros de custo" on public.centros_custo for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id));
create policy "alterar centros de custo" on public.centros_custo for update to authenticated
  using (privado.pode('custos.editar', tenant_id)) with check (privado.pode('custos.editar', tenant_id));

create policy "ler orçamento" on public.orcamento_itens for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "criar orçamento" on public.orcamento_itens for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));
create policy "alterar orçamento" on public.orcamento_itens for update to authenticated
  using (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));
create policy "excluir orçamento" on public.orcamento_itens for delete to authenticated
  using (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));

create policy "ler fornecedores" on public.fornecedores for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id));
create policy "criar fornecedores" on public.fornecedores for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id));
create policy "alterar fornecedores" on public.fornecedores for update to authenticated
  using (privado.pode('custos.editar', tenant_id)) with check (privado.pode('custos.editar', tenant_id));

create policy "ler contratos" on public.contratos_fornecedor for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "criar contratos" on public.contratos_fornecedor for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));
create policy "alterar contratos" on public.contratos_fornecedor for update to authenticated
  using (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));

create policy "ler contas a pagar" on public.contas_pagar for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "criar contas a pagar" on public.contas_pagar for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));
create policy "alterar contas a pagar" on public.contas_pagar for update to authenticated
  using (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));

-- Pagamento herda o escopo do empreendimento da conta.
create function privado.empreendimento_da_conta(p_conta uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select empreendimento_id from public.contas_pagar where id = p_conta $$;

grant execute on function privado.empreendimento_da_conta(uuid) to authenticated, service_role;

create policy "ler pagamentos" on public.pagamentos for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', privado.empreendimento_da_conta(conta_id)));
create policy "registrar pagamentos" on public.pagamentos for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', privado.empreendimento_da_conta(conta_id)));
create policy "estornar pagamentos" on public.pagamentos for update to authenticated
  using (privado.pode('custos.editar', tenant_id, 'empreendimento', privado.empreendimento_da_conta(conta_id)))
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', privado.empreendimento_da_conta(conta_id)));

-- RN-G04: registros financeiros não são apagados (cancelamento e estorno são lógicos).
revoke delete, truncate on public.contas_pagar, public.pagamentos, public.contratos_fornecedor,
  public.fornecedores, public.centros_custo from authenticated, anon;

select privado.instrumentar('public.centros_custo');
select privado.instrumentar('public.orcamento_itens');
select privado.instrumentar('public.fornecedores');
select privado.instrumentar('public.contratos_fornecedor');
select privado.instrumentar('public.contas_pagar');
select privado.instrumentar('public.pagamentos');
