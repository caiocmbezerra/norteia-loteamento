-- Fase 6a · Distrato (art. 32-A da Lei 6.766, RN-D01 a RN-D04). O cálculo é do motor; o banco
-- confere e executa: parcelas em aberto canceladas, venda distratada, lote de volta ao estoque
-- e devolução parcelada. Percentuais e prazos são parâmetros de cada cliente (D-059, PL-02).

insert into public.parametros (chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal) values
  ('distrato.clausula_penal', 'Cláusula penal e despesas administrativas no distrato, sobre o valor atualizado do contrato', 'decimal', 'fração', null, 'PL-02'),
  ('distrato.fruicao_mensal', 'Taxa de fruição ao mês durante a posse, sobre o valor atualizado do contrato', 'decimal', 'fração ao mês', null, 'PL-02'),
  ('distrato.deduz_encargos_moratorios', 'Deduz da devolução os encargos moratórios pagos', 'booleano', null, null, 'PL-02'),
  ('distrato.deduz_comissao', 'Deduz da devolução a comissão de corretagem paga', 'booleano', null, null, 'PL-02'),
  ('distrato.parcelas_devolucao', 'Número de parcelas mensais da devolução', 'inteiro', 'parcelas', null, 'PL-02'),
  ('distrato.carencia_devolucao_meses', 'Meses entre o distrato e a 1ª parcela da devolução', 'inteiro', 'meses', null, 'PL-02');

insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'distrato.clausula_penal', 'plataforma', null, '0.10', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, II: até 10%)'),
  (null, 'distrato.fruicao_mensal', 'plataforma', null, '0.0075', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, I: 0,75% ao mês)'),
  (null, 'distrato.deduz_encargos_moratorios', 'plataforma', null, 'true', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, III)'),
  (null, 'distrato.deduz_comissao', 'plataforma', null, 'false', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, V: só se integrar o preço)'),
  (null, 'distrato.parcelas_devolucao', 'plataforma', null, '12', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, §1º: até 12 parcelas)'),
  (null, 'distrato.carencia_devolucao_meses', 'plataforma', null, '12', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, §1º, II: obras concluídas)');

create table public.distratos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contrato_id uuid not null,
  data date not null,
  motivo text not null check (length(trim(motivo)) >= 5),
  -- Memória de cálculo do motor (pago, atualizado, deduções, regras usadas).
  resumo jsonb not null,
  devolucao_centavos bigint not null check (devolucao_centavos >= 0),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (contrato_id),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict
);

create table public.devolucoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  distrato_id uuid not null,
  numero integer not null check (numero >= 1),
  vencimento date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  pago_em date,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (distrato_id, numero),
  foreign key (tenant_id, distrato_id) references public.distratos (tenant_id, id) on delete restrict
);

create index distratos_contrato_idx on public.distratos (tenant_id, contrato_id);
create index devolucoes_distrato_idx on public.devolucoes (tenant_id, distrato_id);

create trigger distratos_por_funcao before update or delete on public.distratos
  for each row execute function privado.carteira_somente_por_funcao();
create trigger devolucoes_por_funcao before update or delete on public.devolucoes
  for each row execute function privado.carteira_somente_por_funcao();

alter table public.distratos enable row level security;
alter table public.devolucoes enable row level security;
create policy "ler distratos" on public.distratos for select to authenticated
  using (exists (
    select 1 from public.contratos c
     where c.id = contrato_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));
create policy "ler devoluções" on public.devolucoes for select to authenticated
  using (exists (
    select 1 from public.distratos d join public.contratos c on c.id = d.contrato_id
     where d.id = distrato_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));
revoke insert, update, delete, truncate on public.distratos, public.devolucoes from authenticated, anon;
select privado.instrumentar('public.distratos');
select privado.instrumentar('public.devolucoes');

-- p_resumo: memória de cálculo do motor, com devolucao_centavos.
-- p_devolucoes: [{numero, vencimento, valor_centavos}] somando a devolução.
create function public.executar_distrato(p_contrato uuid, p_data date, p_motivo text, p_resumo jsonb, p_devolucoes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_total bigint := (p_resumo ->> 'devolucao_centavos')::bigint;
  v_qtd integer;
  v_soma bigint;
  v_id uuid;
begin
  select * into c from public.contratos where id = p_contrato for update;
  if c.id is null or not (
    privado.pode('venda.registrar', c.tenant_id, 'empreendimento', c.empreendimento_id)
    or privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ) then
    raise exception 'Sem permissão para executar o distrato.' using errcode = 'insufficient_privilege';
  end if;
  if c.situacao <> 'vigente' then
    raise exception 'Só contratos vigentes são distratados.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo do distrato.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do distrato não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.cobrancas co join public.parcelas pa on pa.id = co.parcela_id
     where pa.contrato_id = c.id and co.situacao = 'pendente'
  ) then
    raise exception 'Cancele as cobranças pendentes no Asaas antes do distrato.' using errcode = 'check_violation', hint = 'cobranca_pendente';
  end if;
  select count(*), coalesce(sum((d ->> 'valor_centavos')::bigint), 0) into v_qtd, v_soma
    from jsonb_array_elements(coalesce(p_devolucoes, '[]'::jsonb)) d;
  if v_total is null or v_total < 0 or v_soma <> v_total
     or exists (
       select 1 from jsonb_array_elements(coalesce(p_devolucoes, '[]'::jsonb)) d
        where (d ->> 'numero')::integer not between 1 and v_qtd or (d ->> 'valor_centavos')::bigint <= 0
     ) then
    raise exception 'As parcelas da devolução não conferem com o cálculo.' using errcode = 'check_violation', hint = 'devolucao_inconsistente';
  end if;

  perform set_config('app.carteira', 'on', true);
  perform set_config('app.transicao_lote', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  insert into public.distratos (tenant_id, contrato_id, data, motivo, resumo, devolucao_centavos)
  values (c.tenant_id, c.id, p_data, trim(p_motivo), p_resumo, v_total)
  returning id into v_id;
  insert into public.devolucoes (tenant_id, distrato_id, numero, vencimento, valor_centavos)
  select c.tenant_id, v_id, (d ->> 'numero')::integer, (d ->> 'vencimento')::date, (d ->> 'valor_centavos')::bigint
    from jsonb_array_elements(coalesce(p_devolucoes, '[]'::jsonb)) d;
  update public.parcelas set situacao = 'cancelada' where contrato_id = c.id and situacao = 'aberta';
  update public.contratos set situacao = 'distratado' where id = c.id;
  update public.vendas set situacao = 'distratada' where id = c.venda_id;
  update public.lotes set status = 'disponivel' where id = c.lote_id;
  perform set_config('app.transicao_lote', '', true);
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

create function public.pagar_devolucao(p_devolucao uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dv public.devolucoes;
  c public.contratos;
begin
  select * into dv from public.devolucoes where id = p_devolucao for update;
  select ct.* into c from public.distratos d join public.contratos ct on ct.id = d.contrato_id where d.id = dv.distrato_id;
  if dv.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para registrar a devolução.' using errcode = 'insufficient_privilege';
  end if;
  if dv.pago_em is not null then
    raise exception 'Esta parcela da devolução já foi paga.' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do pagamento não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  perform set_config('app.carteira', 'on', true);
  update public.devolucoes set pago_em = p_data where id = dv.id;
  perform set_config('app.carteira', '', true);
end;
$$;

revoke execute on function public.executar_distrato(uuid, date, text, jsonb, jsonb) from public, anon;
revoke execute on function public.pagar_devolucao(uuid, date) from public, anon;
grant execute on function public.executar_distrato(uuid, date, text, jsonb, jsonb) to authenticated;
grant execute on function public.pagar_devolucao(uuid, date) to authenticated;
