-- Fase 7c · Exportação contábil configurável por cliente (D-059) e base da visão caixa ×
-- competência. Os fatos (vendas, recebimentos, devoluções, repasses, contas e pagamentos,
-- movimentos de sócios) viram eventos; cada cliente mapeia evento → contas de débito e crédito
-- do seu plano e escolhe o formato do arquivo. Tratamento contábil é do contador (PL-21).

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'contabil.exportar'),
  ('financeiro', 'contabil.exportar'),
  ('contador', 'contabil.exportar'),
  ('dono', 'contabil.configurar'),
  ('contador', 'contabil.configurar');

-- ---------------------------------------------------------------------------
-- Configuração por cliente
-- ---------------------------------------------------------------------------

create table public.plano_contas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  codigo text not null check (length(trim(codigo)) between 1 and 40),
  nome text not null check (length(trim(nome)) between 1 and 120),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, codigo)
);

create table public.regras_contabeis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  evento text not null check (evento in (
    'venda_contratada', 'distrato', 'recebimento_parcela', 'recebimento_encargos', 'desconto_concedido',
    'devolucao_distrato', 'repasse_permuta', 'custo_lancado', 'custo_pago',
    'aporte_socio', 'mutuo_socio', 'devolucao_mutuo', 'distribuicao')),
  conta_debito text not null,
  conta_credito text not null,
  historico text not null default '{descricao}' check (length(historico) between 1 and 200),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, evento),
  foreign key (tenant_id, conta_debito) references public.plano_contas (tenant_id, codigo) on update cascade on delete restrict,
  foreign key (tenant_id, conta_credito) references public.plano_contas (tenant_id, codigo) on update cascade on delete restrict
);

create table public.formatos_contabeis (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  separador text not null default ';' check (separador in (';', ',', 'tab', '|')),
  decimal text not null default ',' check (decimal in (',', '.')),
  formato_data text not null default 'DD/MM/AAAA' check (formato_data in ('DD/MM/AAAA', 'AAAA-MM-DD', 'DDMMAAAA')),
  colunas text[] not null default array['data', 'debito', 'credito', 'valor', 'historico', 'documento']
    check (colunas <@ array['data', 'debito', 'credito', 'valor', 'historico', 'documento', 'empreendimento']
           and cardinality(colunas) between 1 and 7),
  cabecalho boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

do $$
declare t text;
begin
  foreach t in array array['plano_contas', 'regras_contabeis', 'formatos_contabeis'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "ler %1$s" on public.%1$I for select to authenticated
      using (privado.pode('contabil.exportar', tenant_id) or privado.pode('contabil.configurar', tenant_id))$p$, t);
    execute format($p$create policy "incluir %1$s" on public.%1$I for insert to authenticated
      with check (privado.pode('contabil.configurar', tenant_id))$p$, t);
    execute format($p$create policy "alterar %1$s" on public.%1$I for update to authenticated
      using (privado.pode('contabil.configurar', tenant_id)) with check (privado.pode('contabil.configurar', tenant_id))$p$, t);
    execute format($p$create policy "excluir %1$s" on public.%1$I for delete to authenticated
      using (privado.pode('contabil.configurar', tenant_id))$p$, t);
    perform privado.instrumentar('public.' || t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Eventos contábeis da SPE no período
-- ---------------------------------------------------------------------------

create function public.eventos_contabeis(p_spe uuid, p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.spes;
begin
  select * into s from public.spes where id = p_spe;
  if s.id is null or not privado.pode('contabil.exportar', s.tenant_id, 'spe', s.id) then
    raise exception 'Sem permissão para a exportação contábil desta SPE.' using errcode = 'insufficient_privilege';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 400 then
    raise exception 'Período inválido (até 13 meses).' using errcode = 'check_violation', hint = 'periodo';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(ev) order by ev.data, array_position(array[
      'venda_contratada', 'distrato', 'recebimento_parcela', 'recebimento_encargos', 'desconto_concedido',
      'devolucao_distrato', 'repasse_permuta', 'custo_lancado', 'custo_pago',
      'aporte_socio', 'mutuo_socio', 'devolucao_mutuo', 'distribuicao'], ev.evento), ev.documento)
    from (
      -- Vendas e distratos (competência)
      select v.data_venda as data, 'venda_contratada' as evento, v.preco_centavos as valor,
             'CT ' || c.numero as documento, e.nome as empreendimento,
             'Venda Q' || q.codigo || ' L' || l.numero || ' - ' || co.nome as descricao
        from public.vendas v
        join public.contratos c on c.venda_id = v.id
        join public.empreendimentos e on e.id = v.empreendimento_id
        join public.lotes l on l.id = v.lote_id join public.quadras q on q.id = l.quadra_id
        join public.compradores co on co.id = v.comprador_id
       where e.spe_id = s.id and v.data_venda between p_inicio and p_fim
      union all
      select d.data, 'distrato', v.preco_centavos, 'CT ' || c.numero, e.nome,
             'Distrato Q' || q.codigo || ' L' || l.numero || ' - ' || co.nome
        from public.distratos d
        join public.contratos c on c.id = d.contrato_id
        join public.vendas v on v.id = c.venda_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.lotes l on l.id = v.lote_id join public.quadras q on q.id = l.quadra_id
        join public.compradores co on co.id = c.comprador_id
       where e.spe_id = s.id and d.data between p_inicio and p_fim
      union all
      -- Recebimentos (caixa), separados em parcela, encargos e desconto
      select r.data_pagamento, x.evento, x.valor, 'CT ' || c.numero || ' P' || p.numero, e.nome,
             x.rotulo || ' CT ' || c.numero || ' parcela ' || p.numero || ' - ' || co.nome
        from public.recebimentos r
        join public.parcelas p on p.id = r.parcela_id
        join public.contratos c on c.id = p.contrato_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.compradores co on co.id = c.comprador_id
        cross join lateral (values
          ('recebimento_parcela', r.principal_centavos, 'Recebimento'),
          ('recebimento_encargos', r.multa_centavos + r.juros_mora_centavos, 'Multa e juros'),
          ('desconto_concedido', r.desconto_centavos, 'Desconto')) as x(evento, valor, rotulo)
       where e.spe_id = s.id and r.estornado_em is null and x.valor > 0
         and r.data_pagamento between p_inicio and p_fim
      union all
      select dv.pago_em, 'devolucao_distrato', dv.valor_centavos, 'CT ' || c.numero || ' D' || dv.numero, e.nome,
             'Devolução de distrato CT ' || c.numero || ' - ' || co.nome
        from public.devolucoes dv
        join public.distratos d on d.id = dv.distrato_id
        join public.contratos c on c.id = d.contrato_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.compradores co on co.id = c.comprador_id
       where e.spe_id = s.id and dv.pago_em between p_inicio and p_fim
      union all
      select rp.data, 'repasse_permuta', rp.valor_centavos, 'PM ' || left(pm.id::text, 8), e.nome,
             'Repasse de permuta - ' || pe.nome
        from public.repasses_permuta rp
        join public.permutas pm on pm.id = rp.permuta_id
        join public.permutantes pe on pe.id = pm.permutante_id
        join public.empreendimentos e on e.id = pm.empreendimento_id
       where e.spe_id = s.id and rp.estornado_em is null and rp.data between p_inicio and p_fim
      union all
      -- Custos: lançados pelo vencimento (competência) e pagos (caixa)
      select cp.vencimento, 'custo_lancado', cp.valor_centavos, coalesce(cp.documento_numero, left(cp.id::text, 8)), e.nome,
             cp.descricao || coalesce(' - ' || f.nome, '')
        from public.contas_pagar cp
        join public.empreendimentos e on e.id = cp.empreendimento_id
        left join public.fornecedores f on f.id = cp.fornecedor_id
       where e.spe_id = s.id and cp.cancelada_em is null and cp.vencimento between p_inicio and p_fim
      union all
      select pg.data_pagamento, 'custo_pago', pg.valor_centavos, coalesce(cp.documento_numero, left(cp.id::text, 8)), e.nome,
             'Pagamento ' || cp.descricao || coalesce(' - ' || f.nome, '')
        from public.pagamentos pg
        join public.contas_pagar cp on cp.id = pg.conta_id
        join public.empreendimentos e on e.id = cp.empreendimento_id
        left join public.fornecedores f on f.id = cp.fornecedor_id
       where e.spe_id = s.id and pg.estornado_em is null and pg.data_pagamento between p_inicio and p_fim
      union all
      -- Sócios
      select m.data,
             case m.tipo when 'aporte' then 'aporte_socio' when 'mutuo' then 'mutuo_socio' else m.tipo end,
             m.valor_centavos, 'SO ' || left(m.id::text, 8), null,
             case m.tipo when 'aporte' then 'Aporte' when 'mutuo' then 'Mútuo' when 'devolucao_mutuo' then 'Devolução de mútuo' else 'Distribuição' end || ' - ' || so.nome
        from public.movimentos_socio m
        join public.socios so on so.id = m.socio_id
       where m.spe_id = s.id and m.estornado_em is null and m.data between p_inicio and p_fim
    ) ev), '[]'::jsonb);
end;
$$;

revoke execute on function public.eventos_contabeis(uuid, date, date) from public, anon;
grant execute on function public.eventos_contabeis(uuid, date, date) to authenticated;
