-- Fase 5b-2 · Cobrança pelo Asaas (conta do próprio loteador — D-004): boleto + Pix por
-- parcela, webhook com baixa automática e varredura periódica de segurança.
-- A chave da API fica cifrada no Supabase Vault e só é lida dentro do banco: as chamadas ao
-- Asaas saem daqui (extensão http), nunca do navegador nem do app.

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'integracoes.gerenciar');

-- ---------------------------------------------------------------------------
-- Baixa de parcela reaproveitada pelo recebimento manual e pela conciliação
-- ---------------------------------------------------------------------------

create function privado.baixar_parcela(
  p_parcela uuid,
  p_data date,
  p_principal bigint,
  p_multa bigint,
  p_juros_mora bigint,
  p_desconto bigint,
  p_origem text,
  p_referencia text,
  p_observacao text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pa public.parcelas;
  c public.contratos;
  v_id uuid;
begin
  select * into pa from public.parcelas where id = p_parcela for update;
  select * into c from public.contratos where id = pa.contrato_id for update;
  if pa.id is null then
    raise exception 'Parcela não encontrada.' using errcode = 'no_data_found';
  end if;

  if p_referencia is not null then
    select id into v_id from public.recebimentos
     where tenant_id = pa.tenant_id and origem = p_origem and referencia_externa = p_referencia;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if c.situacao <> 'vigente' or pa.situacao <> 'aberta' then
    raise exception 'A parcela não está em aberto.' using errcode = 'check_violation', hint = 'parcela_fechada';
  end if;
  if p_principal is null or p_principal <= 0 or p_principal > pa.valor_centavos - pa.pago_centavos then
    raise exception 'O principal deve ser positivo e no máximo o saldo da parcela.' using errcode = 'check_violation', hint = 'principal_invalido';
  end if;
  if p_desconto > p_principal + p_multa + p_juros_mora then
    raise exception 'O desconto não pode superar o valor devido.' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do pagamento não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  perform set_config('app.carteira', 'on', true);
  insert into public.recebimentos (
    tenant_id, parcela_id, data_pagamento, valor_centavos, principal_centavos, multa_centavos,
    juros_mora_centavos, desconto_centavos, origem, referencia_externa, observacao
  ) values (
    pa.tenant_id, pa.id, p_data, p_principal + p_multa + p_juros_mora - p_desconto, p_principal, p_multa,
    p_juros_mora, p_desconto, p_origem, p_referencia, nullif(trim(coalesce(p_observacao, '')), '')
  ) returning id into v_id;
  update public.parcelas
     set pago_centavos = pago_centavos + p_principal,
         situacao = case when pago_centavos + p_principal = valor_centavos then 'paga' else 'aberta' end
   where id = pa.id;
  perform privado.atualizar_situacao_contrato(c.id, p_data);
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

create or replace function public.registrar_recebimento(
  p_parcela uuid,
  p_data date,
  p_principal bigint,
  p_multa bigint default 0,
  p_juros_mora bigint default 0,
  p_desconto bigint default 0,
  p_origem text default 'manual',
  p_referencia text default null,
  p_observacao text default null
)
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
    raise exception 'Sem permissão para registrar recebimentos.' using errcode = 'insufficient_privilege';
  end if;
  -- Recebimentos do Asaas só entram pela conciliação, que confere o pagamento no próprio Asaas.
  if p_origem <> 'manual' and auth.role() is distinct from 'service_role' then
    raise exception 'Origem de recebimento inválida.' using errcode = 'check_violation';
  end if;
  return privado.baixar_parcela(p_parcela, p_data, p_principal, p_multa, p_juros_mora, p_desconto, p_origem, p_referencia, p_observacao);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.integracoes_asaas (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  -- Chave da API no Vault (vault.secrets). Nunca é lida fora do banco.
  segredo_id uuid not null,
  -- Hash SHA-256 do token que o Asaas envia no cabeçalho asaas-access-token do webhook.
  webhook_token_hash text not null,
  ativo boolean not null default true,
  ultimo_webhook_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

comment on table public.integracoes_asaas is 'Conta Asaas do loteador. A chave fica no Vault; o webhook é conferido pelo hash do token.';

create table public.asaas_clientes (
  tenant_id uuid not null,
  comprador_id uuid not null,
  asaas_id text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (tenant_id, comprador_id),
  unique (tenant_id, asaas_id),
  foreign key (tenant_id, comprador_id) references public.compradores (tenant_id, id) on delete cascade
);

create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  parcela_id uuid not null,
  asaas_id text not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date not null,
  link_fatura text,
  link_boleto text,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'paga', 'cancelada', 'divergente')),
  recebimento_id uuid,
  motivo text,
  -- Última leitura do pagamento no Asaas (conferência e auditoria).
  retorno jsonb,
  verificado_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (tenant_id, asaas_id),
  foreign key (tenant_id, parcela_id) references public.parcelas (tenant_id, id) on delete restrict,
  foreign key (tenant_id, recebimento_id) references public.recebimentos (tenant_id, id) on delete restrict
);

-- Uma cobrança pendente por parcela.
create unique index cobrancas_pendente_por_parcela_idx on public.cobrancas (parcela_id) where situacao = 'pendente';
create index cobrancas_parcela_idx on public.cobrancas (tenant_id, parcela_id);
create index cobrancas_pendentes_idx on public.cobrancas (verificado_em nulls first) where situacao = 'pendente';
create index cobrancas_recebimento_idx on public.cobrancas (tenant_id, recebimento_id) where recebimento_id is not null;

-- Registro dos avisos recebidos (auditoria da conciliação).
create table public.asaas_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  evento text not null,
  asaas_evento_id text,
  asaas_pagamento_id text,
  resultado text not null,
  payload jsonb not null,
  recebido_em timestamptz not null default now()
);

create unique index asaas_eventos_id_idx on public.asaas_eventos (tenant_id, asaas_evento_id) where asaas_evento_id is not null;
create index asaas_eventos_tenant_idx on public.asaas_eventos (tenant_id, recebido_em desc);

create trigger cobrancas_por_funcao before update or delete on public.cobrancas
  for each row execute function privado.carteira_somente_por_funcao();

alter table public.integracoes_asaas enable row level security;
alter table public.asaas_clientes enable row level security;
alter table public.cobrancas enable row level security;
alter table public.asaas_eventos enable row level security;

create policy "ler integração asaas" on public.integracoes_asaas for select to authenticated
  using (privado.pode('carteira.receber', tenant_id) or privado.pode('integracoes.gerenciar', tenant_id));
create policy "ler clientes asaas" on public.asaas_clientes for select to authenticated
  using (privado.pode('carteira.receber', tenant_id));
create policy "ler cobranças" on public.cobrancas for select to authenticated
  using (exists (
    select 1 from public.parcelas p join public.contratos c on c.id = p.contrato_id
     where p.id = parcela_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));
create policy "ler eventos asaas" on public.asaas_eventos for select to authenticated
  using (privado.pode('integracoes.gerenciar', tenant_id) or privado.pode('auditoria.ler', tenant_id));

revoke insert, update, delete, truncate on public.integracoes_asaas, public.asaas_clientes, public.cobrancas, public.asaas_eventos from authenticated, anon;
revoke select on public.integracoes_asaas, public.asaas_clientes, public.cobrancas, public.asaas_eventos from anon;
-- A referência do segredo e o hash do token não são lidos nem por quem vê a integração.
revoke select on public.integracoes_asaas from authenticated;
grant select (tenant_id, ambiente, ativo, ultimo_webhook_em, criado_em, criado_por, atualizado_em, atualizado_por)
  on public.integracoes_asaas to authenticated;

select privado.instrumentar('public.integracoes_asaas');
select privado.instrumentar('public.cobrancas');
select privado.instrumentar('public.asaas_clientes');

-- ---------------------------------------------------------------------------
-- Cliente HTTP do Asaas
-- ---------------------------------------------------------------------------

create function privado.asaas_url(p_ambiente text)
returns text
language sql
immutable
set search_path = ''
as $$ select case p_ambiente when 'producao' then 'https://api.asaas.com/v3' else 'https://api-sandbox.asaas.com/v3' end $$;

-- Chamada à API com a chave informada. Devolve {status, corpo}.
create function privado.asaas_chamar(p_ambiente text, p_chave text, p_metodo text, p_caminho text, p_corpo jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp extensions.http_response;
  v_corpo jsonb;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  v_resp := extensions.http((
    p_metodo,
    privado.asaas_url(p_ambiente) || p_caminho,
    array[
      extensions.http_header('access_token', p_chave),
      extensions.http_header('User-Agent', 'NorteIA-Loteamento')
    ],
    'application/json',
    coalesce(p_corpo::text, '')
  )::extensions.http_request);
  begin
    v_corpo := v_resp.content::jsonb;
  exception when others then
    v_corpo := jsonb_build_object('texto', left(v_resp.content, 500));
  end;
  return jsonb_build_object('status', v_resp.status, 'corpo', v_corpo);
end;
$$;

-- Chamada com a chave do tenant (lida do Vault).
create function privado.asaas_requisicao(p_tenant uuid, p_metodo text, p_caminho text, p_corpo jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.integracoes_asaas;
  v_chave text;
begin
  select * into i from public.integracoes_asaas where tenant_id = p_tenant and ativo;
  if i.tenant_id is null then
    raise exception 'A integração com o Asaas não está configurada.' using errcode = 'check_violation', hint = 'asaas_sem_integracao';
  end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where id = i.segredo_id;
  return privado.asaas_chamar(i.ambiente, v_chave, p_metodo, p_caminho, p_corpo);
end;
$$;

create function privado.asaas_erro(p_resposta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_resposta #>> array['corpo', 'errors', '0', 'description'], 'HTTP ' || (p_resposta ->> 'status'))
$$;

-- ---------------------------------------------------------------------------
-- Configuração (dono)
-- ---------------------------------------------------------------------------

-- Grava (ou troca) a chave, conferindo-a no Asaas. Devolve o token do webhook, exibido uma
-- única vez para o usuário cadastrar no painel do Asaas.
create function public.configurar_asaas(p_tenant uuid, p_ambiente text, p_chave text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.integracoes_asaas;
  v_resp jsonb;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_segredo uuid;
begin
  if not privado.pode('integracoes.gerenciar', p_tenant) then
    raise exception 'Sem permissão para configurar integrações.' using errcode = 'insufficient_privilege';
  end if;
  if p_ambiente not in ('sandbox', 'producao') then
    raise exception 'Ambiente inválido.' using errcode = 'check_violation';
  end if;
  p_chave := trim(coalesce(p_chave, ''));
  if (p_ambiente = 'sandbox' and p_chave !~ '^\$aact_hmlg_') or (p_ambiente = 'producao' and p_chave !~ '^\$aact_prod_') then
    raise exception 'A chave não corresponde ao ambiente escolhido (sandbox começa com $aact_hmlg_, produção com $aact_prod_).'
      using errcode = 'check_violation', hint = 'chave';
  end if;
  v_resp := privado.asaas_chamar(p_ambiente, p_chave, 'GET', '/finance/balance');
  if (v_resp ->> 'status')::integer <> 200 then
    raise exception 'O Asaas recusou a chave: %', privado.asaas_erro(v_resp) using errcode = 'check_violation', hint = 'chave';
  end if;

  select * into i from public.integracoes_asaas where tenant_id = p_tenant for update;
  if i.tenant_id is null then
    v_segredo := vault.create_secret(p_chave, 'asaas:' || p_tenant, 'Chave da API do Asaas do tenant');
    insert into public.integracoes_asaas (tenant_id, ambiente, segredo_id, webhook_token_hash)
    values (p_tenant, p_ambiente, v_segredo, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  else
    perform vault.update_secret(i.segredo_id, p_chave);
    update public.integracoes_asaas
       set ambiente = p_ambiente, ativo = true, webhook_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
     where tenant_id = p_tenant;
  end if;
  return v_token;
end;
$$;

create function public.desativar_asaas(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.pode('integracoes.gerenciar', p_tenant) then
    raise exception 'Sem permissão para configurar integrações.' using errcode = 'insufficient_privilege';
  end if;
  update public.integracoes_asaas set ativo = false where tenant_id = p_tenant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobranças
-- ---------------------------------------------------------------------------

-- Boleto + Pix da parcela pelo saldo em aberto, com multa e juros do contrato.
create function public.gerar_cobranca(p_parcela uuid)
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
  if pa.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para emitir cobranças.' using errcode = 'insufficient_privilege';
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

create function public.cancelar_cobranca(p_cobranca uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.cobrancas;
  c public.contratos;
  v_resp jsonb;
begin
  select * into co from public.cobrancas where id = p_cobranca for update;
  select ct.* into c from public.parcelas pa join public.contratos ct on ct.id = pa.contrato_id where pa.id = co.parcela_id;
  if co.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para cancelar cobranças.' using errcode = 'insufficient_privilege';
  end if;
  if co.situacao <> 'pendente' then
    raise exception 'A cobrança não está pendente.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  v_resp := privado.asaas_requisicao(co.tenant_id, 'DELETE', '/payments/' || co.asaas_id);
  if (v_resp ->> 'status')::integer not in (200, 404) then
    raise exception 'O Asaas não cancelou a cobrança: %', privado.asaas_erro(v_resp) using errcode = 'check_violation', hint = 'asaas';
  end if;
  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  update public.cobrancas set situacao = 'cancelada', motivo = trim(p_motivo), verificado_em = now() where id = co.id;
  perform set_config('app.carteira', '', true);
end;
$$;

-- Aplica à cobrança o pagamento lido no Asaas. Pago = valor da cobrança ± diferença:
-- acréscimo vira juros de mora; valor menor (desconto concedido no Asaas) vira desconto.
-- Se a parcela mudou desde a emissão (pagamento manual), a cobrança fica divergente.
create function privado.conciliar_cobranca(p_cobranca uuid, p_pagamento jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.cobrancas;
  pa public.parcelas;
  v_status text := p_pagamento ->> 'status';
  v_pago bigint;
  v_dif bigint;
  v_data date;
  v_rec uuid;
begin
  select * into co from public.cobrancas where id = p_cobranca for update;
  perform set_config('app.carteira', 'on', true);
  update public.cobrancas set retorno = p_pagamento, verificado_em = now() where id = co.id;
  if co.situacao <> 'pendente' then
    perform set_config('app.carteira', '', true);
    return 'ja_processada';
  end if;

  if v_status in ('DELETED', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED') or coalesce((p_pagamento ->> 'deleted')::boolean, false) then
    update public.cobrancas set situacao = 'cancelada', motivo = 'Cancelada ou estornada no Asaas (' || coalesce(v_status, 'removida') || ')' where id = co.id;
    perform set_config('app.carteira', '', true);
    return 'cancelada';
  end if;
  if v_status not in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') then
    perform set_config('app.carteira', '', true);
    return 'pendente';
  end if;

  select * into pa from public.parcelas where id = co.parcela_id;
  -- VALIDAR NO SANDBOX: com pagamento em atraso, "value" traz o valor pago e "originalValue" o original.
  v_pago := round(((p_pagamento ->> 'value')::numeric
                   + case when p_pagamento ? 'originalValue' and p_pagamento ->> 'originalValue' is not null then 0
                          else coalesce((p_pagamento ->> 'interestValue')::numeric, 0) end) * 100);
  v_data := coalesce(p_pagamento ->> 'clientPaymentDate', p_pagamento ->> 'paymentDate', p_pagamento ->> 'confirmedDate')::date;
  if pa.situacao <> 'aberta' or pa.valor_centavos - pa.pago_centavos <> co.valor_centavos or v_data is null then
    update public.cobrancas set situacao = 'divergente', motivo = 'Parcela alterada desde a emissão; conferir e baixar manualmente.' where id = co.id;
    perform set_config('app.carteira', '', true);
    return 'divergente';
  end if;
  v_dif := v_pago - co.valor_centavos;
  v_rec := privado.baixar_parcela(
    pa.id, least(v_data, current_date), co.valor_centavos, 0, greatest(v_dif, 0), greatest(-v_dif, 0),
    'asaas', co.asaas_id, 'Pago no Asaas (' || coalesce(p_pagamento ->> 'billingType', '?') || ')');
  perform set_config('app.carteira', 'on', true);
  update public.cobrancas set situacao = 'paga', recebimento_id = v_rec where id = co.id;
  perform set_config('app.carteira', '', true);
  return 'paga';
end;
$$;

-- Webhook do Asaas (chamado pelo app com a chave pública). Confere o token do tenant e, em
-- vez de confiar no corpo do aviso, lê o pagamento no próprio Asaas antes de baixar.
create function public.webhook_asaas(p_tenant uuid, p_token text, p_evento jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.integracoes_asaas;
  co public.cobrancas;
  v_pagamento text := p_evento #>> array['payment', 'id'];
  v_evento_id text := p_evento ->> 'id';
  v_resp jsonb;
  v_resultado text;
begin
  select * into i from public.integracoes_asaas where tenant_id = p_tenant and ativo;
  if i.tenant_id is null or p_token is null
     or encode(extensions.digest(p_token, 'sha256'), 'hex') <> i.webhook_token_hash then
    return 'nao_autorizado';
  end if;
  update public.integracoes_asaas set ultimo_webhook_em = now() where tenant_id = p_tenant;
  if v_evento_id is not null and exists (
    select 1 from public.asaas_eventos where tenant_id = p_tenant and asaas_evento_id = v_evento_id
  ) then
    return 'repetido';
  end if;

  select * into co from public.cobrancas where tenant_id = p_tenant and asaas_id = v_pagamento;
  if co.id is null then
    v_resultado := 'ignorado';
  else
    v_resp := privado.asaas_requisicao(p_tenant, 'GET', '/payments/' || v_pagamento);
    if (v_resp ->> 'status')::integer = 200 then
      v_resultado := privado.conciliar_cobranca(co.id, v_resp -> 'corpo');
    elsif (v_resp ->> 'status')::integer = 404 then
      v_resultado := privado.conciliar_cobranca(co.id, jsonb_build_object('status', 'DELETED'));
    else
      v_resultado := 'erro_consulta';
    end if;
  end if;
  insert into public.asaas_eventos (tenant_id, evento, asaas_evento_id, asaas_pagamento_id, resultado, payload)
  values (p_tenant, coalesce(p_evento ->> 'event', '?'), v_evento_id, v_pagamento, v_resultado, p_evento);
  return v_resultado;
end;
$$;

-- Varredura de segurança (pg_cron): confere no Asaas as cobranças pendentes há mais tempo
-- sem verificação, para não depender só do webhook.
create function public.conciliar_cobrancas(p_limite integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_resp jsonb;
  v_baixadas integer := 0;
begin
  for r in
    select co.id, co.tenant_id, co.asaas_id from public.cobrancas co
      join public.integracoes_asaas i on i.tenant_id = co.tenant_id and i.ativo
     where co.situacao = 'pendente'
     order by co.verificado_em nulls first
     limit p_limite
  loop
    begin
      v_resp := privado.asaas_requisicao(r.tenant_id, 'GET', '/payments/' || r.asaas_id);
      if (v_resp ->> 'status')::integer = 200 then
        if privado.conciliar_cobranca(r.id, v_resp -> 'corpo') = 'paga' then
          v_baixadas := v_baixadas + 1;
        end if;
      elsif (v_resp ->> 'status')::integer = 404 then
        perform privado.conciliar_cobranca(r.id, jsonb_build_object('status', 'DELETED'));
      end if;
    exception when others then
      raise warning 'Conciliação da cobrança % falhou: %', r.id, sqlerrm;
    end;
  end loop;
  return v_baixadas;
end;
$$;

revoke execute on function public.configurar_asaas(uuid, text, text) from public, anon;
revoke execute on function public.desativar_asaas(uuid) from public, anon;
revoke execute on function public.gerar_cobranca(uuid) from public, anon;
revoke execute on function public.cancelar_cobranca(uuid, text) from public, anon;
revoke execute on function public.conciliar_cobrancas(integer) from public, anon, authenticated;
revoke execute on function public.webhook_asaas(uuid, text, jsonb) from public;
grant execute on function public.configurar_asaas(uuid, text, text) to authenticated;
grant execute on function public.desativar_asaas(uuid) to authenticated;
grant execute on function public.gerar_cobranca(uuid) to authenticated;
grant execute on function public.cancelar_cobranca(uuid, text) to authenticated;
grant execute on function public.conciliar_cobrancas(integer) to service_role;
grant execute on function public.webhook_asaas(uuid, text, jsonb) to anon, authenticated, service_role;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated, service_role;
-- Funções que falam com o Asaas ou baixam parcelas sem conferir permissão: só o próprio banco.
revoke execute on function privado.baixar_parcela(uuid, date, bigint, bigint, bigint, bigint, text, text, text) from authenticated, service_role;
revoke execute on function privado.asaas_chamar(text, text, text, text, jsonb) from authenticated, service_role;
revoke execute on function privado.asaas_requisicao(uuid, text, text, jsonb) from authenticated, service_role;
revoke execute on function privado.conciliar_cobranca(uuid, jsonb) from authenticated, service_role;

select cron.schedule('conciliar-cobrancas', '23 */6 * * *', 'select public.conciliar_cobrancas()');
