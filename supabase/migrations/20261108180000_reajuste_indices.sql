-- Fase 5b · Reajuste por índice (RN-K03) e importação dos índices do BCB/SGS.
-- O reajuste usa somente índices já publicados: o acumulado dos `periodicidade` meses que
-- terminam `defasagem` meses antes do mês do aniversário. Sem todos os índices, o reajuste
-- fica pendente e a rotina diária tenta de novo. // VALIDAR COM ADVOGADO (PL-03)

create extension if not exists http with schema extensions;

insert into public.parametros (chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal) values
  ('carteira.reajuste_periodicidade_meses', 'Intervalo entre reajustes do contrato', 'inteiro', 'meses', null, 'PL-03'),
  ('carteira.reajuste_defasagem_meses', 'Meses entre o último índice usado e o mês do aniversário (índice já publicado)', 'inteiro', 'meses', null, 'PL-03'),
  ('carteira.reajuste_negativo', 'Tratamento de índice acumulado negativo (deflação)', 'texto', null, array['aplicar', 'ignorar'], 'PL-03');

insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'carteira.reajuste_periodicidade_meses', 'plataforma', null, '12', daterange('2026-01-01', null), 'Padrão provisório — VALIDAR COM ADVOGADO (PL-03)'),
  (null, 'carteira.reajuste_defasagem_meses', 'plataforma', null, '2', daterange('2026-01-01', null), 'Padrão provisório — VALIDAR COM ADVOGADO (PL-03)'),
  (null, 'carteira.reajuste_negativo', 'plataforma', null, '"ignorar"', daterange('2026-01-01', null), 'Padrão provisório — VALIDAR COM ADVOGADO (PL-03)');

-- ---------------------------------------------------------------------------
-- Regras de reajuste fixadas no contrato
-- ---------------------------------------------------------------------------

alter table public.contratos
  add column reajuste_periodicidade_meses integer check (reajuste_periodicidade_meses between 1 and 60),
  add column reajuste_defasagem_meses integer check (reajuste_defasagem_meses between 0 and 12),
  add column reajuste_negativo text check (reajuste_negativo in ('aplicar', 'ignorar'));

select set_config('app.carteira', 'on', true);
select set_config('app.motivo', 'Regras de reajuste copiadas dos parâmetros vigentes na venda', true);
update public.contratos c
   set reajuste_periodicidade_meses = coalesce((public.parametro_vigente('carteira.reajuste_periodicidade_meses', v.data_venda, c.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[])::integer, 12),
       reajuste_defasagem_meses = coalesce((public.parametro_vigente('carteira.reajuste_defasagem_meses', v.data_venda, c.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[])::integer, 2),
       reajuste_negativo = coalesce(public.parametro_vigente('carteira.reajuste_negativo', v.data_venda, c.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[], 'ignorar')
  from public.vendas v
 where v.id = c.venda_id;
select set_config('app.carteira', '', true);
select set_config('app.motivo', '', true);

alter table public.contratos
  alter column reajuste_periodicidade_meses set not null,
  alter column reajuste_defasagem_meses set not null,
  alter column reajuste_negativo set not null;

-- Correção monetária acumulada da parcela: valor = amortização + juros + correção.
alter table public.parcelas add column correcao_centavos bigint not null default 0;
alter table public.parcelas drop constraint parcelas_check1;
alter table public.parcelas add constraint parcelas_composicao_check
  check (valor_centavos = amortizacao_centavos + juros_centavos + correcao_centavos);

create table public.reajustes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contrato_id uuid not null,
  aniversario date not null,
  indice text not null references public.indices_economicos (codigo),
  competencia_inicial date not null,
  competencia_final date not null,
  -- Fator acumulado do índice e fator efetivamente aplicado (1 quando a deflação é ignorada).
  fator numeric(24, 12) not null check (fator > 0),
  fator_aplicado numeric(24, 12) not null check (fator_aplicado > 0),
  parcelas integer not null check (parcelas >= 0),
  diferenca_centavos bigint not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  -- Idempotência: um reajuste por aniversário.
  unique (contrato_id, aniversario),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict
);

create index reajustes_contrato_idx on public.reajustes (tenant_id, contrato_id);
create index reajustes_indice_idx on public.reajustes (indice);

create trigger reajustes_por_funcao before update or delete on public.reajustes
  for each row execute function privado.carteira_somente_por_funcao();

alter table public.reajustes enable row level security;
create policy "ler reajustes" on public.reajustes for select to authenticated
  using (exists (
    select 1 from public.contratos c
     where c.id = contrato_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));
revoke insert, update, delete, truncate on public.reajustes from authenticated, anon;
select privado.instrumentar('public.reajustes');

-- ---------------------------------------------------------------------------
-- Contrato passa a guardar as regras de reajuste vigentes na data da venda
-- ---------------------------------------------------------------------------

create or replace function public.criar_contrato(p_venda uuid, p_parcelas jsonb, p_indice text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendas;
  v_id uuid;
  v_multa numeric;
  v_juros numeric;
  v_qtd integer;
  v_soma bigint;
  v_entrada bigint;
begin
  select * into v from public.vendas where id = p_venda for update;
  if v.id is null or not (
    privado.pode('venda.registrar', v.tenant_id, 'empreendimento', v.empreendimento_id)
    or privado.pode('carteira.receber', v.tenant_id, 'empreendimento', v.empreendimento_id)
  ) then
    raise exception 'Sem permissão para gerar o contrato.' using errcode = 'insufficient_privilege';
  end if;
  if v.situacao <> 'ativa' then
    raise exception 'A venda não está ativa.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.contratos where venda_id = v.id) then
    raise exception 'Esta venda já tem contrato.' using errcode = 'unique_violation', hint = 'contrato_existente';
  end if;
  if jsonb_typeof(p_parcelas) <> 'array' then
    raise exception 'Parcelas inválidas.' using errcode = 'check_violation';
  end if;

  select count(*), coalesce(sum((p ->> 'amortizacao_centavos')::bigint), 0),
         coalesce(sum((p ->> 'valor_centavos')::bigint) filter (where (p ->> 'numero')::integer = 0), 0)
    into v_qtd, v_soma, v_entrada
    from jsonb_array_elements(p_parcelas) p;
  if v_soma <> v.preco_centavos
     or v_entrada <> v.entrada_centavos
     or v_qtd <> v.parcelas + (case when v.entrada_centavos > 0 then 1 else 0 end)
     or exists (
       select 1 from jsonb_array_elements(p_parcelas) p
        where (p ->> 'numero')::integer not between (case when v.entrada_centavos > 0 then 0 else 1 end) and v.parcelas
     ) then
    raise exception 'As parcelas não conferem com as condições da venda.' using errcode = 'check_violation', hint = 'parcelas_inconsistentes';
  end if;

  v_multa := coalesce(
    (public.parametro_vigente('carteira.multa_atraso', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::numeric,
    0);
  v_juros := coalesce(
    (public.parametro_vigente('carteira.juros_mora_mensal', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::numeric,
    0);

  insert into public.contratos (
    tenant_id, empreendimento_id, venda_id, lote_id, comprador_id, indice_reajuste, multa_atraso, juros_mora_mensal,
    reajuste_periodicidade_meses, reajuste_defasagem_meses, reajuste_negativo
  ) values (
    v.tenant_id, v.empreendimento_id, v.id, v.lote_id, v.comprador_id, p_indice, v_multa, v_juros,
    coalesce((public.parametro_vigente('carteira.reajuste_periodicidade_meses', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::integer, 12),
    coalesce((public.parametro_vigente('carteira.reajuste_defasagem_meses', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::integer, 2),
    coalesce(public.parametro_vigente('carteira.reajuste_negativo', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[], 'ignorar')
  ) returning id into v_id;

  insert into public.parcelas (tenant_id, contrato_id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos)
  select v.tenant_id, v_id, (p ->> 'numero')::integer, (p ->> 'vencimento')::date,
         (p ->> 'valor_centavos')::bigint, (p ->> 'amortizacao_centavos')::bigint, (p ->> 'juros_centavos')::bigint
    from jsonb_array_elements(p_parcelas) p;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reajuste
-- ---------------------------------------------------------------------------

-- Aplica, em ordem, os reajustes vencidos até p_data que ainda não foram aplicados.
-- Para no primeiro aniversário sem índices publicados (fica pendente). Devolve quantos aplicou.
create function privado.reajustar_contrato(p_contrato uuid, p_data date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_base date;
  v_aniv date;
  v_ini date;
  v_fim date;
  v_fator numeric;
  v_aplicado numeric;
  v_qtd integer;
  v_n integer;
  v_dif bigint;
  v_feitos integer := 0;
  k integer := 1;
  r record;
begin
  select * into c from public.contratos where id = p_contrato for update;
  if c.id is null or c.situacao <> 'vigente' or c.indice_reajuste is null then
    return 0;
  end if;
  select data_venda into v_base from public.vendas where id = c.venda_id;

  perform set_config('app.carteira', 'on', true);
  loop
    -- Soma de meses a partir da data-base (31/01 + 1 mês = 28/02 ou 29/02).
    v_aniv := (v_base + make_interval(months => k * c.reajuste_periodicidade_meses))::date;
    exit when v_aniv > p_data;
    if not exists (select 1 from public.reajustes where contrato_id = c.id and aniversario = v_aniv) then
      v_fim := (date_trunc('month', v_aniv) - make_interval(months => c.reajuste_defasagem_meses))::date;
      v_ini := (v_fim - make_interval(months => c.reajuste_periodicidade_meses - 1))::date;
      v_fator := 1;
      v_qtd := 0;
      for r in
        select variacao_mensal from public.indice_valores
         where codigo = c.indice_reajuste and competencia between v_ini and v_fim
      loop
        v_fator := v_fator * (1 + r.variacao_mensal / 100);
        v_qtd := v_qtd + 1;
      end loop;
      exit when v_qtd < c.reajuste_periodicidade_meses; -- índices ainda não publicados
      v_fator := round(v_fator, 12);
      v_aplicado := case when v_fator < 1 and c.reajuste_negativo = 'ignorar' then 1 else v_fator end;

      -- Corrige o saldo das parcelas em aberto que vencem a partir do aniversário.
      with alvo as (
        select id, valor_centavos, pago_centavos + round((valor_centavos - pago_centavos) * v_aplicado)::bigint as novo
          from public.parcelas
         where contrato_id = c.id and situacao = 'aberta' and vencimento >= v_aniv
      ), feito as (
        update public.parcelas pa
           set valor_centavos = a.novo,
               correcao_centavos = pa.correcao_centavos + (a.novo - a.valor_centavos)
          from alvo a
         where pa.id = a.id
        returning a.novo - a.valor_centavos as dif
      )
      select count(*), coalesce(sum(dif), 0) into v_n, v_dif from feito;

      insert into public.reajustes (
        tenant_id, contrato_id, aniversario, indice, competencia_inicial, competencia_final,
        fator, fator_aplicado, parcelas, diferenca_centavos
      ) values (
        c.tenant_id, c.id, v_aniv, c.indice_reajuste, v_ini, v_fim, v_fator, v_aplicado, v_n, v_dif
      );
      v_feitos := v_feitos + 1;
    end if;
    k := k + 1;
  end loop;
  perform set_config('app.carteira', '', true);
  return v_feitos;
end;
$$;

-- Rotina diária (pg_cron): reajusta todos os contratos vigentes. Idempotente.
create function public.executar_reajustes(p_data date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  r record;
begin
  perform set_config('app.motivo', 'Reajuste anual por índice (rotina)', true);
  for r in
    select id from public.contratos where situacao = 'vigente' and indice_reajuste is not null order by id
  loop
    v_total := v_total + privado.reajustar_contrato(r.id, p_data);
  end loop;
  return v_total;
end;
$$;

-- Reajuste sob demanda de um contrato, por quem opera a carteira.
create function public.reajustar_contrato(p_contrato uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para reajustar este contrato.' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.motivo', 'Reajuste anual por índice', true);
  return privado.reajustar_contrato(c.id, current_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- Importação dos índices (BCB/SGS)
-- ---------------------------------------------------------------------------

-- Grava a série no formato do SGS: [{"data":"01/03/2026","valor":"0.56"}]. Devolve quantas
-- competências foram incluídas ou corrigidas.
create function privado.gravar_serie_indice(p_codigo text, p_dados jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if jsonb_typeof(p_dados) <> 'array' then
    raise exception 'Resposta do SGS em formato inesperado.' using errcode = 'invalid_parameter_value';
  end if;
  with serie as (
    select to_date(d ->> 'data', 'DD/MM/YYYY') as competencia, (d ->> 'valor')::numeric as variacao
      from jsonb_array_elements(p_dados) d
     where d ->> 'data' ~ '^01/\d{2}/\d{4}$' and d ->> 'valor' ~ '^-?\d+(\.\d+)?$'
  ), gravado as (
    insert into public.indice_valores (codigo, competencia, variacao_mensal)
    select p_codigo, competencia, variacao from serie
    on conflict (codigo, competencia) do update
      set variacao_mensal = excluded.variacao_mensal, importado_em = now()
      where public.indice_valores.variacao_mensal is distinct from excluded.variacao_mensal
    returning 1
  )
  select count(*) into v_n from gravado;
  return v_n;
end;
$$;

-- Busca os últimos 24 meses de cada índice com série configurada. Falha de um índice não
-- impede os demais; o erro fica no log do banco.
create function public.importar_indices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_resp extensions.http_response;
  v_total integer := 0;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  for r in select codigo, serie_sgs from public.indices_economicos where serie_sgs is not null order by codigo loop
    begin
      v_resp := extensions.http_get(format('https://api.bcb.gov.br/dados/serie/bcdata.sgs.%s/dados/ultimos/24?formato=json', r.serie_sgs));
      if v_resp.status = 200 then
        v_total := v_total + privado.gravar_serie_indice(r.codigo, v_resp.content::jsonb);
      else
        raise warning 'Importação do índice %: HTTP %', r.codigo, v_resp.status;
      end if;
    exception when others then
      raise warning 'Importação do índice % falhou: %', r.codigo, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.executar_reajustes(date) from public, anon, authenticated;
revoke execute on function public.importar_indices() from public, anon, authenticated;
grant execute on function public.executar_reajustes(date) to service_role;
grant execute on function public.importar_indices() to service_role;
revoke execute on function public.reajustar_contrato(uuid) from public, anon;
grant execute on function public.reajustar_contrato(uuid) to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated, service_role;
revoke execute on function privado.reajustar_contrato(uuid, date) from authenticated;
revoke execute on function privado.gravar_serie_indice(text, jsonb) from authenticated;

-- Índices: importação diária (o IBGE e a FGV publicam no início do mês); reajustes, depois.
select cron.schedule('importar-indices', '17 9 * * *', 'select public.importar_indices()');
select cron.schedule('executar-reajustes', '47 9 * * *', 'select public.executar_reajustes()');
