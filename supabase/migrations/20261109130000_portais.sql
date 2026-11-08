-- Fase 7a · Portais do comprador, do sócio e do permutante (somente leitura).
-- O portal não abre as tabelas internas: lê por funções que conferem, a cada chamada, que o
-- usuário é o comprador, o sócio ou o permutante do registro. O vínculo nasce de um convite
-- da loteadora, aceito com o mesmo e-mail.

alter table public.compradores add column usuario_id uuid references public.perfis (id) on delete set null;
create index compradores_usuario_idx on public.compradores (usuario_id) where usuario_id is not null;

create function privado.e_comprador(p_comprador uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.compradores where id = p_comprador and usuario_id = auth.uid()) $$;

-- ---------------------------------------------------------------------------
-- Convites do portal
-- ---------------------------------------------------------------------------

create table public.convites_portal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tipo text not null check (tipo in ('comprador', 'socio', 'permutante')),
  alvo_id uuid not null,
  email extensions.citext not null,
  token_hash bytea not null unique,
  expira_em timestamptz not null default now() + interval '30 days',
  aceito_em timestamptz,
  aceito_por uuid,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create index convites_portal_tenant_idx on public.convites_portal (tenant_id, tipo, alvo_id);
alter table public.convites_portal enable row level security;
create policy "ler convites do portal" on public.convites_portal for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id) or privado.pode('comercial.cadastrar', tenant_id));
revoke insert, update, delete, truncate on public.convites_portal from authenticated, anon;
revoke select (token_hash) on public.convites_portal from authenticated;
select privado.instrumentar('public.convites_portal');

create function public.criar_convite_portal(p_tenant uuid, p_tipo text, p_alvo uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_permitido boolean;
begin
  v_permitido := case p_tipo
    when 'comprador' then (privado.pode('carteira.receber', p_tenant) or privado.pode('venda.registrar', p_tenant))
      and exists (select 1 from public.compradores where id = p_alvo and tenant_id = p_tenant)
    when 'socio' then privado.pode('socios.gerenciar', p_tenant)
      and exists (select 1 from public.socios where id = p_alvo and tenant_id = p_tenant)
    when 'permutante' then privado.pode('permutas.gerenciar', p_tenant)
      and exists (select 1 from public.permutantes where id = p_alvo and tenant_id = p_tenant)
    else false end;
  if not coalesce(v_permitido, false) then
    raise exception 'Sem permissão para convidar para o portal.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = 'check_violation', hint = 'email';
  end if;
  insert into public.convites_portal (tenant_id, tipo, alvo_id, email, token_hash)
  values (p_tenant, p_tipo, p_alvo, lower(trim(p_email)), extensions.digest(v_token, 'sha256'));
  return v_token;
end;
$$;

create function public.aceitar_convite_portal(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  c public.convites_portal;
begin
  if v_uid is null then
    raise exception 'É preciso estar autenticado.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.convites_portal where token_hash = extensions.digest(p_token, 'sha256') for update;
  if c.id is null or c.aceito_em is not null or c.expira_em < now() then
    raise exception 'Convite inválido, expirado ou já utilizado.' using errcode = 'invalid_parameter_value';
  end if;
  if c.email::text <> v_email then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = 'insufficient_privilege';
  end if;
  if c.tipo = 'comprador' then
    update public.compradores set usuario_id = v_uid where id = c.alvo_id;
  elsif c.tipo = 'socio' then
    update public.socios set usuario_id = v_uid where id = c.alvo_id;
  else
    update public.permutantes set usuario_id = v_uid where id = c.alvo_id;
  end if;
  update public.convites_portal set aceito_em = now(), aceito_por = v_uid where id = c.id;
  return c.tipo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura do portal
-- ---------------------------------------------------------------------------

-- Tudo o que o usuário logado tem como comprador, sócio ou permutante, em qualquer loteadora.
create function public.meu_portal(p_hoje date default current_date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'loteadora', t.nome, 'empreendimento', e.nome,
        'lote', 'Quadra ' || q.codigo || ' · Lote ' || l.numero, 'situacao', c.situacao,
        'saldo', (select coalesce(sum(valor_centavos - pago_centavos), 0) from public.parcelas where contrato_id = c.id and situacao = 'aberta'),
        'vencido', (select coalesce(sum(valor_centavos - pago_centavos), 0) from public.parcelas where contrato_id = c.id and situacao = 'aberta' and vencimento < p_hoje),
        'proxima', (select jsonb_build_object('id', p.id, 'numero', p.numero, 'vencimento', p.vencimento, 'saldo', p.valor_centavos - p.pago_centavos)
                      from public.parcelas p where p.contrato_id = c.id and p.situacao = 'aberta' order by p.numero limit 1)
      ) order by t.nome, e.nome)
        from public.contratos c
        join public.compradores co on co.id = c.comprador_id
        join public.tenants t on t.id = c.tenant_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.lotes l on l.id = c.lote_id
        join public.quadras q on q.id = l.quadra_id
       where co.usuario_id = auth.uid()), '[]'::jsonb),
    'sociedades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'spe', s.razao_social, 'loteadora', t.nome, 'socio', so.nome,
        'participacao', (select percentual from public.participacoes pa where pa.spe_id = s.id and pa.socio_id = so.id and pa.vigencia @> p_hoje),
        'aportes', (select coalesce(sum(valor_centavos), 0) from public.movimentos_socio m where m.spe_id = s.id and m.socio_id = so.id and m.estornado_em is null and m.tipo in ('aporte', 'mutuo')),
        'recebido', (select coalesce(sum(valor_centavos), 0) from public.movimentos_socio m where m.spe_id = s.id and m.socio_id = so.id and m.estornado_em is null and m.tipo in ('distribuicao', 'devolucao_mutuo')),
        'movimentos', coalesce((select jsonb_agg(jsonb_build_object('data', m.data, 'tipo', m.tipo, 'valor', m.valor_centavos) order by m.data desc)
                                  from public.movimentos_socio m where m.spe_id = s.id and m.socio_id = so.id and m.estornado_em is null), '[]'::jsonb)
      ) order by t.nome, s.razao_social)
        from public.socios so
        join public.tenants t on t.id = so.tenant_id
        join public.spes s on s.tenant_id = so.tenant_id
       where so.usuario_id = auth.uid()
         and (exists (select 1 from public.participacoes pa where pa.spe_id = s.id and pa.socio_id = so.id)
              or exists (select 1 from public.movimentos_socio m where m.spe_id = s.id and m.socio_id = so.id))), '[]'::jsonb),
    'permutas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id, 'loteadora', t.nome, 'empreendimento', e.nome, 'tipo', pm.tipo,
        'percentual', pm.percentual, 'base', pm.base,
        'lotes', (select count(*) from public.permuta_lotes pl where pl.permuta_id = pm.id)
      ) order by t.nome, e.nome)
        from public.permutas pm
        join public.permutantes pe on pe.id = pm.permutante_id
        join public.tenants t on t.id = pm.tenant_id
        join public.empreendimentos e on e.id = pm.empreendimento_id
       where pe.usuario_id = auth.uid()), '[]'::jsonb)
  )
$$;

-- Contrato do comprador: parcelas, pagamentos e links de boleto/Pix pendentes.
create function public.portal_contrato(p_contrato uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v jsonb;
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not privado.e_comprador(c.comprador_id) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'id', c.id, 'situacao', c.situacao, 'indice', c.indice_reajuste, 'quitado_em', c.quitado_em,
    'loteadora', (select nome from public.tenants where id = c.tenant_id),
    'empreendimento', (select nome from public.empreendimentos where id = c.empreendimento_id),
    'lote', (select 'Quadra ' || q.codigo || ' · Lote ' || l.numero from public.lotes l join public.quadras q on q.id = l.quadra_id where l.id = c.lote_id),
    'boleto_disponivel', exists (select 1 from public.integracoes_asaas where tenant_id = c.tenant_id and ativo),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'numero', p.numero, 'vencimento', p.vencimento, 'valor', p.valor_centavos, 'pago', p.pago_centavos,
        'situacao', p.situacao,
        'link', (select link_fatura from public.cobrancas co where co.parcela_id = p.id and co.situacao = 'pendente' limit 1)
      ) order by p.numero) from public.parcelas p where p.contrato_id = c.id and p.situacao <> 'cancelada'), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('data', r.data_pagamento, 'valor', r.valor_centavos, 'parcela', p.numero) order by r.data_pagamento)
      from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
      where p.contrato_id = c.id and r.estornado_em is null), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

create function privado.emitir_cobranca(p_parcela uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pa public.parcelas;
  c public.contratos;
  co public.compradores;
  v_cliente text;
  v_resp jsonb;
  v_saldo bigint;
  v_vencimento date;
  v_id uuid;
  v_lote text;
begin
  select * into pa from public.parcelas where id = p_parcela for update;
  select * into c from public.contratos where id = pa.contrato_id;
  if pa.id is null then
    raise exception 'Parcela não encontrada.' using errcode = 'no_data_found';
  end if;
  select id into v_id from public.cobrancas where parcela_id = pa.id and situacao = 'pendente';
  if v_id is not null then
    return v_id;
  end if;
  if c.situacao <> 'vigente' or pa.situacao <> 'aberta' then
    raise exception 'A parcela não está em aberto.' using errcode = 'check_violation', hint = 'parcela_fechada';
  end if;
  select * into co from public.compradores where id = c.comprador_id;
  if co.cpf is null then
    raise exception 'Cadastre o CPF do comprador para emitir boleto e Pix.' using errcode = 'check_violation', hint = 'sem_cpf';
  end if;

  -- Cliente no Asaas (um por comprador)
  select asaas_id into v_cliente from public.asaas_clientes where tenant_id = c.tenant_id and comprador_id = co.id;
  if v_cliente is null then
    v_resp := privado.asaas_requisicao(c.tenant_id, 'POST', '/customers', jsonb_strip_nulls(jsonb_build_object(
      'name', co.nome, 'cpfCnpj', co.cpf, 'email', co.email::text, 'mobilePhone', co.telefone,
      'externalReference', co.id::text, 'notificationDisabled', true)));
    if (v_resp ->> 'status')::integer <> 200 then
      raise exception 'O Asaas recusou o cadastro do comprador: %', privado.asaas_erro(v_resp) using errcode = 'check_violation', hint = 'asaas';
    end if;
    v_cliente := v_resp #>> array['corpo', 'id'];
    insert into public.asaas_clientes (tenant_id, comprador_id, asaas_id) values (c.tenant_id, co.id, v_cliente);
  end if;

  v_saldo := pa.valor_centavos - pa.pago_centavos;
  -- O Asaas não aceita vencimento no passado: parcela vencida vence hoje e os encargos do
  -- atraso já decorrido ficam para a régua/renegociação (Fase 5c).
  v_vencimento := greatest(pa.vencimento, current_date);
  select 'Quadra ' || q.codigo || ' · Lote ' || l.numero into v_lote
    from public.lotes l join public.quadras q on q.id = l.quadra_id where l.id = c.lote_id;
  v_resp := privado.asaas_requisicao(c.tenant_id, 'POST', '/payments', jsonb_build_object(
    'customer', v_cliente,
    'billingType', 'UNDEFINED',
    'value', round(v_saldo / 100.0, 2),
    'dueDate', to_char(v_vencimento, 'YYYY-MM-DD'),
    'description', left(coalesce(v_lote, 'Lote') || ' · ' || case when pa.numero = 0 then 'entrada' else 'parcela ' || pa.numero end, 500),
    'externalReference', pa.id::text,
    'fine', jsonb_build_object('value', round(c.multa_atraso * 100, 4)),
    'interest', jsonb_build_object('value', round(c.juros_mora_mensal * 100, 4))
  ));
  if (v_resp ->> 'status')::integer <> 200 then
    raise exception 'O Asaas recusou a cobrança: %', privado.asaas_erro(v_resp) using errcode = 'check_violation', hint = 'asaas';
  end if;

  insert into public.cobrancas (tenant_id, parcela_id, asaas_id, valor_centavos, vencimento, link_fatura, link_boleto, retorno, verificado_em)
  values (c.tenant_id, pa.id, v_resp #>> array['corpo', 'id'], v_saldo, v_vencimento,
          v_resp #>> array['corpo', 'invoiceUrl'], v_resp #>> array['corpo', 'bankSlipUrl'], v_resp -> 'corpo', now())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.gerar_cobranca(p_parcela uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
begin
  select ct.* into c from public.parcelas pa join public.contratos ct on ct.id = pa.contrato_id where pa.id = p_parcela;
  if c.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para emitir cobranças.' using errcode = 'insufficient_privilege';
  end if;
  return privado.emitir_cobranca(p_parcela);
end;
$$;

-- Segunda via pelo comprador: devolve o boleto/Pix pendente ou emite um novo no Asaas.
create function public.segunda_via(p_parcela uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_cobranca uuid;
begin
  select ct.* into c from public.parcelas pa join public.contratos ct on ct.id = pa.contrato_id where pa.id = p_parcela;
  if c.id is null or not privado.e_comprador(c.comprador_id) then
    raise exception 'Parcela não encontrada.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.integracoes_asaas where tenant_id = c.tenant_id and ativo) then
    raise exception 'A loteadora ainda não emite boleto pelo portal; fale com ela.' using errcode = 'check_violation', hint = 'sem_integracao';
  end if;
  v_cobranca := privado.emitir_cobranca(p_parcela);
  return (select link_fatura from public.cobrancas where id = v_cobranca);
end;
$$;

-- Eventos que formam o extrato do permutante (RN-T05): vendas, recebimentos e devoluções do
-- empreendimento (sem dados pessoais) e os repasses pagos.
create function public.eventos_permuta(p_permuta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pm public.permutas;
begin
  select * into pm from public.permutas where id = p_permuta;
  if pm.id is null or not (privado.e_permutante(pm.permutante_id) or privado.pode('financeiro.ler', pm.tenant_id, 'empreendimento', pm.empreendimento_id)) then
    raise exception 'Permuta não encontrada.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'permuta', jsonb_build_object('id', pm.id, 'tipo', pm.tipo, 'percentual', pm.percentual, 'base', pm.base,
      'abate_distrato', pm.abate_distrato, 'inicio', pm.inicio,
      'empreendimento', (select nome from public.empreendimentos where id = pm.empreendimento_id),
      'loteadora', (select nome from public.tenants where id = pm.tenant_id)),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('data', data, 'valor', valor_centavos) order by data)
      from public.repasses_permuta where permuta_id = pm.id and estornado_em is null), '[]'::jsonb),
    'vendas', coalesce((select jsonb_agg(jsonb_build_object(
        'rotulo', 'Quadra ' || q.codigo || ' · Lote ' || l.numero, 'data_venda', v.data_venda, 'preco', v.preco_centavos,
        'distrato_data', (select d.data from public.distratos d where d.contrato_id = ct.id),
        'parcelas', coalesce((select jsonb_agg(jsonb_build_object(
            'numero', p.numero, 'valor', p.valor_centavos, 'amortizacao', p.amortizacao_centavos, 'correcao', p.correcao_centavos,
            'recebimentos', coalesce((select jsonb_agg(jsonb_build_object('data', r.data_pagamento, 'principal', r.principal_centavos,
                'encargos', r.multa_centavos + r.juros_mora_centavos - r.desconto_centavos))
              from public.recebimentos r where r.parcela_id = p.id and r.estornado_em is null), '[]'::jsonb)))
          from public.parcelas p where p.contrato_id = ct.id), '[]'::jsonb),
        'devolucoes', coalesce((select jsonb_agg(jsonb_build_object('vencimento', dv.vencimento, 'valor', dv.valor_centavos, 'pago_em', dv.pago_em))
          from public.devolucoes dv join public.distratos d on d.id = dv.distrato_id where d.contrato_id = ct.id), '[]'::jsonb)
      ))
      from public.vendas v
      join public.lotes l on l.id = v.lote_id
      join public.quadras q on q.id = l.quadra_id
      left join public.contratos ct on ct.venda_id = v.id
     where v.empreendimento_id = pm.empreendimento_id and v.situacao in ('ativa', 'distratada')), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.criar_convite_portal(uuid, text, uuid, text) from public, anon;
revoke execute on function public.aceitar_convite_portal(text) from public, anon;
revoke execute on function public.meu_portal(date) from public, anon;
revoke execute on function public.portal_contrato(uuid) from public, anon;
revoke execute on function public.segunda_via(uuid) from public, anon;
revoke execute on function public.eventos_permuta(uuid) from public, anon;
grant execute on function public.criar_convite_portal(uuid, text, uuid, text) to authenticated;
grant execute on function public.aceitar_convite_portal(text) to authenticated;
grant execute on function public.meu_portal(date) to authenticated;
grant execute on function public.portal_contrato(uuid) to authenticated;
grant execute on function public.segunda_via(uuid) to authenticated;
grant execute on function public.eventos_permuta(uuid) to authenticated;
grant execute on function privado.e_comprador(uuid) to authenticated, service_role;
revoke execute on function privado.e_comprador(uuid) from public, anon;
revoke execute on function privado.emitir_cobranca(uuid) from public, anon, authenticated, service_role;
