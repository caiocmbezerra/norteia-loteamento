-- Crédito do comprador por pagamento a maior (pendência da Fase 5; decisão do dono do produto em
-- 11/11/2026: a diferença fica como saldo a favor no contrato e a loteadora decide caso a caso).
-- Usos: aplicar numa parcela em aberto ou devolver ao comprador.
--
-- Fluxo de caixa: o crédito em si não entra nos recebimentos. Ao ser aplicado, vira um
-- recebimento comum (origem 'credito') com a data em que o dinheiro entrou; a parte devolvida
-- nunca entra. Assim fluxo, DIMOB, informe de pagamentos e contabilidade seguem lendo só os
-- recebimentos, sem contar duas vezes. O saldo ainda não usado fica fora do fluxo até a decisão.
-- // VALIDAR COM CONTADOR (PL-24): data do recebimento aplicado (a da entrada do dinheiro) no informe e na DIMOB.

alter table public.recebimentos drop constraint recebimentos_origem_check;
alter table public.recebimentos add constraint recebimentos_origem_check
  check (origem in ('manual', 'asaas', 'importacao', 'credito'));

create table public.creditos_comprador (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  contrato_id uuid not null,
  data date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  observacao text not null check (length(trim(observacao)) between 3 and 300),
  cancelado_em timestamptz,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check ((cancelado_em is null) = (motivo_cancelamento is null)),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict
);
create index creditos_comprador_contrato_idx on public.creditos_comprador (tenant_id, contrato_id);
create index creditos_comprador_empreendimento_idx on public.creditos_comprador (tenant_id, empreendimento_id);

create table public.usos_credito (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  credito_id uuid not null,
  tipo text not null check (tipo in ('parcela', 'devolucao')),
  data date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  recebimento_id uuid unique,
  observacao text check (observacao is null or length(observacao) <= 300),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check ((tipo = 'parcela') = (recebimento_id is not null)),
  foreign key (tenant_id, credito_id) references public.creditos_comprador (tenant_id, id) on delete restrict,
  foreign key (tenant_id, recebimento_id) references public.recebimentos (tenant_id, id) on delete restrict
);
create index usos_credito_credito_idx on public.usos_credito (tenant_id, credito_id);

-- Leitura: a loteadora com acesso à carteira e o comprador do contrato.
create function privado.pode_ver_credito(p_contrato uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contratos c
     where c.id = p_contrato
       and (privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
            or privado.e_comprador(c.comprador_id))
  )
$$;
revoke execute on function privado.pode_ver_credito(uuid) from public, anon;
grant execute on function privado.pode_ver_credito(uuid) to authenticated, service_role;

alter table public.creditos_comprador enable row level security;
alter table public.usos_credito enable row level security;
create policy "ler créditos do comprador" on public.creditos_comprador for select to authenticated
  using (privado.pode_ver_credito(contrato_id));
create policy "ler usos de crédito" on public.usos_credito for select to authenticated
  using (exists (select 1 from public.creditos_comprador cr where cr.id = credito_id));
revoke insert, update, delete, truncate on public.creditos_comprador, public.usos_credito from authenticated, anon;
select privado.instrumentar('public.creditos_comprador');
select privado.instrumentar('public.usos_credito');

-- Saldo: valor menos devoluções e aplicações cujo recebimento não foi estornado.
create function privado.saldo_credito(p_credito uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select cr.valor_centavos - coalesce((
    select sum(u.valor_centavos) from public.usos_credito u
      left join public.recebimentos r on r.id = u.recebimento_id
     where u.credito_id = cr.id and (u.tipo = 'devolucao' or r.estornado_em is null)
  ), 0)
    from public.creditos_comprador cr where cr.id = p_credito
$$;
revoke execute on function privado.saldo_credito(uuid) from public, anon;
grant execute on function privado.saldo_credito(uuid) to authenticated, service_role;

create function public.registrar_credito(p_contrato uuid, p_data date, p_valor bigint, p_observacao text)
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
  if c.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para registrar créditos.' using errcode = 'insufficient_privilege';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor pago a mais.' using errcode = 'check_violation', hint = 'valor';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do pagamento não pode estar no futuro.' using errcode = 'check_violation', hint = 'data';
  end if;
  if length(trim(coalesce(p_observacao, ''))) < 3 then
    raise exception 'Explique a origem do crédito (ex.: boleto pago em dobro).' using errcode = 'check_violation', hint = 'observacao';
  end if;
  insert into public.creditos_comprador (tenant_id, empreendimento_id, contrato_id, data, valor_centavos, observacao)
  values (c.tenant_id, c.empreendimento_id, c.id, p_data, p_valor, trim(p_observacao))
  returning id into v_id;
  return v_id;
end;
$$;

-- Aplica parte ou todo o crédito numa parcela em aberto do mesmo contrato, como recebimento de
-- principal na data em que o dinheiro entrou.
create function public.aplicar_credito(p_credito uuid, p_parcela uuid, p_valor bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cr public.creditos_comprador;
  v_contrato uuid;
  v_rec uuid;
begin
  select * into cr from public.creditos_comprador where id = p_credito for update;
  if cr.id is null or not privado.pode('carteira.receber', cr.tenant_id, 'empreendimento', cr.empreendimento_id) then
    raise exception 'Sem permissão para usar este crédito.' using errcode = 'insufficient_privilege';
  end if;
  if cr.cancelado_em is not null then
    raise exception 'O crédito foi cancelado.' using errcode = 'check_violation';
  end if;
  select contrato_id into v_contrato from public.parcelas where id = p_parcela;
  if v_contrato is distinct from cr.contrato_id then
    raise exception 'Escolha uma parcela do mesmo contrato.' using errcode = 'check_violation', hint = 'parcela';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > privado.saldo_credito(cr.id) then
    raise exception 'O valor deve ser positivo e no máximo o saldo do crédito.' using errcode = 'check_violation', hint = 'valor';
  end if;
  v_rec := privado.baixar_parcela(
    p_parcela, cr.data, p_valor, 0, 0, 0, 'credito', null,
    'Crédito por pagamento a maior em ' || to_char(cr.data, 'DD/MM/YYYY'));
  insert into public.usos_credito (tenant_id, credito_id, tipo, data, valor_centavos, recebimento_id)
  values (cr.tenant_id, cr.id, 'parcela', cr.data, p_valor, v_rec);
  return v_rec;
end;
$$;

create function public.devolver_credito(p_credito uuid, p_data date, p_valor bigint, p_observacao text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cr public.creditos_comprador;
  v_id uuid;
begin
  select * into cr from public.creditos_comprador where id = p_credito for update;
  if cr.id is null or not privado.pode('carteira.receber', cr.tenant_id, 'empreendimento', cr.empreendimento_id) then
    raise exception 'Sem permissão para usar este crédito.' using errcode = 'insufficient_privilege';
  end if;
  if cr.cancelado_em is not null then
    raise exception 'O crédito foi cancelado.' using errcode = 'check_violation';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > privado.saldo_credito(cr.id) then
    raise exception 'O valor deve ser positivo e no máximo o saldo do crédito.' using errcode = 'check_violation', hint = 'valor';
  end if;
  if p_data is null or p_data < cr.data or p_data > current_date then
    raise exception 'A devolução deve ser entre a data do crédito e hoje.' using errcode = 'check_violation', hint = 'data';
  end if;
  insert into public.usos_credito (tenant_id, credito_id, tipo, data, valor_centavos, observacao)
  values (cr.tenant_id, cr.id, 'devolucao', p_data, p_valor, nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Lançado por engano: só sem usos que valham (aplicações estornadas não contam).
create function public.cancelar_credito(p_credito uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cr public.creditos_comprador;
begin
  select * into cr from public.creditos_comprador where id = p_credito for update;
  if cr.id is null or not privado.pode('carteira.receber', cr.tenant_id, 'empreendimento', cr.empreendimento_id) then
    raise exception 'Sem permissão para cancelar este crédito.' using errcode = 'insufficient_privilege';
  end if;
  if cr.cancelado_em is not null then
    raise exception 'O crédito já foi cancelado.' using errcode = 'check_violation';
  end if;
  if privado.saldo_credito(cr.id) <> cr.valor_centavos then
    raise exception 'O crédito já foi usado; estorne as aplicações antes de cancelar.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  update public.creditos_comprador set cancelado_em = now(), motivo_cancelamento = trim(p_motivo) where id = cr.id;
end;
$$;

revoke execute on function public.registrar_credito(uuid, date, bigint, text) from public, anon;
revoke execute on function public.aplicar_credito(uuid, uuid, bigint) from public, anon;
revoke execute on function public.devolver_credito(uuid, date, bigint, text) from public, anon;
revoke execute on function public.cancelar_credito(uuid, text) from public, anon;
grant execute on function public.registrar_credito(uuid, date, bigint, text) to authenticated;
grant execute on function public.aplicar_credito(uuid, uuid, bigint) to authenticated;
grant execute on function public.devolver_credito(uuid, date, bigint, text) to authenticated;
grant execute on function public.cancelar_credito(uuid, text) to authenticated;

-- Exportação LGPD (D-112) passa a incluir os créditos do comprador.
create or replace function public.dados_titular(p_comprador uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.compradores;
  v_titular boolean;
begin
  select * into co from public.compradores where id = p_comprador;
  v_titular := co.id is not null and privado.e_comprador(co.id);
  if co.id is null or not (v_titular or privado.pode('tenant.administrar', co.tenant_id)) then
    raise exception 'Comprador não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.exportacoes_titular (tenant_id, comprador_id, pelo_titular) values (co.tenant_id, co.id, v_titular);
  return jsonb_build_object(
    'gerado_em', now(),
    'controlador', (select nome from public.tenants where id = co.tenant_id),
    'cadastro', jsonb_build_object(
      'nome', co.nome, 'cpf', co.cpf, 'email', co.email, 'telefone', co.telefone,
      'cadastrado_em', co.criado_em, 'acessa_o_portal', co.usuario_id is not null
    ),
    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero, 'situacao', c.situacao, 'empreendimento', e.nome,
        'lote', 'Quadra ' || q.codigo || ' · Lote ' || l.numero,
        'data_venda', v.data_venda, 'preco_centavos', v.preco_centavos, 'entrada_centavos', v.entrada_centavos,
        'parcelas_contratadas', v.parcelas, 'juros_mensal', v.juros_mensal, 'indice_reajuste', c.indice_reajuste,
        'quitado_em', c.quitado_em,
        'parcelas', coalesce((select jsonb_agg(jsonb_build_object(
            'numero', p.numero, 'vencimento', p.vencimento, 'valor_centavos', p.valor_centavos,
            'pago_centavos', p.pago_centavos, 'situacao', p.situacao) order by p.numero)
          from public.parcelas p where p.contrato_id = c.id), '[]'::jsonb),
        'pagamentos', coalesce((select jsonb_agg(jsonb_build_object(
            'data', r.data_pagamento, 'valor_centavos', r.valor_centavos, 'parcela', p.numero,
            'origem', r.origem, 'estornado_em', r.estornado_em) order by r.data_pagamento)
          from public.recebimentos r join public.parcelas p on p.id = r.parcela_id where p.contrato_id = c.id), '[]'::jsonb),
        'chamados', coalesce((select jsonb_agg(jsonb_build_object(
            'assunto', ch.assunto, 'categoria', ch.categoria, 'situacao', ch.situacao, 'aberto_em', ch.criado_em,
            'mensagens', (select jsonb_agg(jsonb_build_object('em', m.criado_em, 'do_comprador', m.autor_comprador, 'texto', m.texto) order by m.criado_em)
                            from public.chamado_mensagens m where m.chamado_id = ch.id)) order by ch.criado_em)
          from public.chamados ch where ch.contrato_id = c.id), '[]'::jsonb),
        'creditos', coalesce((select jsonb_agg(jsonb_build_object(
            'data', cr.data, 'valor_centavos', cr.valor_centavos, 'origem', cr.observacao, 'cancelado_em', cr.cancelado_em,
            'usos', (select jsonb_agg(jsonb_build_object('tipo', u.tipo, 'data', u.data, 'valor_centavos', u.valor_centavos) order by u.criado_em)
                       from public.usos_credito u where u.credito_id = cr.id)) order by cr.data)
          from public.creditos_comprador cr where cr.contrato_id = c.id), '[]'::jsonb)
      ) order by c.numero)
        from public.contratos c
        join public.vendas v on v.id = c.venda_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.lotes l on l.id = c.lote_id
        join public.quadras q on q.id = l.quadra_id
       where c.comprador_id = co.id), '[]'::jsonb),
    'propostas', coalesce((
      select jsonb_agg(jsonb_build_object('data', pr.criado_em, 'situacao', pr.situacao, 'preco_centavos', pr.preco_centavos) order by pr.criado_em)
        from public.propostas pr where pr.tenant_id = co.tenant_id and co.cpf is not null and pr.cliente_cpf = co.cpf), '[]'::jsonb)
  );
end;
$$;
