-- LGPD (L5, plano aprovado em 10/11/2026): exportação dos dados de um comprador (direito de acesso
-- e portabilidade, art. 18 da Lei 13.709/2018). O próprio comprador baixa pelo portal; o dono da
-- loteadora baixa para atender um pedido. Cada exportação fica registrada. A anonimização espera o
-- advogado definir os prazos de guarda (PL-23). // VALIDAR COM ADVOGADO

create table public.exportacoes_titular (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  comprador_id uuid not null,
  pelo_titular boolean not null,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  foreign key (tenant_id, comprador_id) references public.compradores (tenant_id, id) on delete restrict
);
create index exportacoes_titular_comprador_idx on public.exportacoes_titular (tenant_id, comprador_id);

alter table public.exportacoes_titular enable row level security;
create policy "ler exportações de titular" on public.exportacoes_titular for select to authenticated
  using (privado.pode('tenant.administrar', tenant_id));
revoke insert, update, delete, truncate on public.exportacoes_titular from authenticated, anon;
select privado.instrumentar('public.exportacoes_titular');

-- Tudo o que o sistema guarda sobre o comprador naquela loteadora, em JSON legível.
create function public.dados_titular(p_comprador uuid)
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
          from public.chamados ch where ch.contrato_id = c.id), '[]'::jsonb)
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
revoke execute on function public.dados_titular(uuid) from public, anon;
grant execute on function public.dados_titular(uuid) to authenticated;

-- Atalho pelo contrato (portal do comprador e tela do contrato na gestão); mesmas permissões.
create function public.dados_titular_do_contrato(p_contrato uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comprador uuid;
begin
  select comprador_id into v_comprador from public.contratos where id = p_contrato;
  if v_comprador is null then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  return public.dados_titular(v_comprador);
end;
$$;
revoke execute on function public.dados_titular_do_contrato(uuid) from public, anon;
grant execute on function public.dados_titular_do_contrato(uuid) to authenticated;
