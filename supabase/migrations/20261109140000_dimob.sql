-- Fase 7b · DIMOB (IN RFB 1.115/2010): operações de loteamento da SPE no ano-calendário (ficha
-- "Construção e incorporação", registro R03). O leiaute do arquivo é dado com vigência por ano,
-- copiado do mapeamento oficial do PGD Dimob 2.8g (fev/2026), tipo ARQ_DIMOB_ARQUIVO_EXTERNO.
-- Critérios de inclusão e de valor pago ficam com o contador de cada cliente (PL-20).

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'fiscal.declarar'),
  ('financeiro', 'fiscal.declarar'),
  ('contador', 'fiscal.declarar');

-- ---------------------------------------------------------------------------
-- Leiautes de declarações (dado de referência; muda por migration)
-- ---------------------------------------------------------------------------

create table public.leiautes_declaracao (
  id uuid primary key default gen_random_uuid(),
  declaracao text not null check (declaracao in ('dimob')),
  anos int4range not null,
  versao text not null,
  fonte text not null,
  registros jsonb not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  constraint leiautes_declaracao_sem_sobreposicao exclude using gist (declaracao with =, anos with &&)
);

alter table public.leiautes_declaracao enable row level security;
create policy "ler leiautes" on public.leiautes_declaracao for select to authenticated using (true);
revoke insert, update, delete, truncate on public.leiautes_declaracao from authenticated, anon;
select privado.instrumentar('public.leiautes_declaracao');

insert into public.leiautes_declaracao (declaracao, anos, versao, fonte, registros) values (
  'dimob', int4range(2021, null), 'PGD Dimob 2.8g',
  'mapeamentoTxt.xml do PGD Dimob 2.8g (Receita Federal, fev/2026), tipo ARQ_DIMOB_ARQUIVO_EXTERNO',
  '{"cabecalho":[{"campo":"sistema","tipo":"C","tamanho":5,"fixo":"DIMOB"},{"campo":"reservado","tipo":"C","tamanho":369}],"R01":[{"campo":"tipo","tipo":"C","tamanho":3,"fixo":"R01"},{"campo":"cnpj","tipo":"C","tamanho":14},{"campo":"ano_apuracao","tipo":"N","tamanho":4},{"campo":"retificadora","tipo":"N","tamanho":1},{"campo":"numero_recibo","tipo":"N","tamanho":10},{"campo":"situacao_especial","tipo":"N","tamanho":1},{"campo":"data_situacao_especial","tipo":"N","tamanho":8},{"campo":"codigo_situacao_especial","tipo":"N","tamanho":2},{"campo":"nome_empresarial","tipo":"C","tamanho":60},{"campo":"cpf_representante","tipo":"N","tamanho":11},{"campo":"endereco","tipo":"C","tamanho":120},{"campo":"uf","tipo":"C","tamanho":2},{"campo":"cod_municipio","tipo":"N","tamanho":4},{"campo":"reservado_municipio","tipo":"C","tamanho":20},{"campo":"reservado","tipo":"C","tamanho":10}],"R03":[{"campo":"tipo","tipo":"C","tamanho":3,"fixo":"R03"},{"campo":"cnpj","tipo":"C","tamanho":14},{"campo":"ano_apuracao","tipo":"N","tamanho":4},{"campo":"sequencial","tipo":"N","tamanho":7},{"campo":"cpf_cnpj_comprador","tipo":"C","tamanho":14},{"campo":"nome_empresarial_comprador","tipo":"C","tamanho":60},{"campo":"numero_contrato","tipo":"C","tamanho":6},{"campo":"data_contrato","tipo":"N","tamanho":8},{"campo":"valor_operacao","tipo":"N","tamanho":14,"decimais":2},{"campo":"valor_pago","tipo":"N","tamanho":14,"decimais":2},{"campo":"tipo_imovel","tipo":"C","tamanho":1},{"campo":"endereco_imovel","tipo":"C","tamanho":60},{"campo":"cep_imovel","tipo":"N","tamanho":8},{"campo":"cod_municipio_imovel","tipo":"N","tamanho":4},{"campo":"reservado_municipio","tipo":"C","tamanho":20},{"campo":"uf_imovel","tipo":"C","tamanho":2},{"campo":"reservado","tipo":"C","tamanho":10}],"R04":[{"campo":"tipo","tipo":"C","tamanho":3,"fixo":"R04"},{"campo":"cnpj","tipo":"C","tamanho":14},{"campo":"ano_apuracao","tipo":"N","tamanho":4},{"campo":"sequencial","tipo":"N","tamanho":7},{"campo":"cpf_cnpj_comprador","tipo":"C","tamanho":14},{"campo":"nome_empresarial_comprador","tipo":"C","tamanho":60},{"campo":"cpf_cnpj_vendedor","tipo":"C","tamanho":14},{"campo":"nome_empresarial_vendedor","tipo":"C","tamanho":60},{"campo":"numero_contrato","tipo":"C","tamanho":6},{"campo":"data_contrato","tipo":"N","tamanho":8},{"campo":"valor_venda","tipo":"N","tamanho":14,"decimais":2},{"campo":"valor_comissao","tipo":"N","tamanho":14,"decimais":2},{"campo":"tipo_imovel","tipo":"C","tamanho":1},{"campo":"endereco_imovel","tipo":"C","tamanho":60},{"campo":"cep_imovel","tipo":"N","tamanho":8},{"campo":"cod_municipio_imovel","tipo":"N","tamanho":4},{"campo":"reservado_municipio","tipo":"C","tamanho":20},{"campo":"uf_imovel","tipo":"C","tamanho":2},{"campo":"reservado","tipo":"C","tamanho":10}],"T9":[{"campo":"tipo","tipo":"C","tamanho":2,"fixo":"T9"},{"campo":"reservado","tipo":"C","tamanho":100}]}
'::jsonb
);

-- ---------------------------------------------------------------------------
-- Dados cadastrais exigidos pela declaração
-- ---------------------------------------------------------------------------

alter table public.spes
  add column endereco text,
  add column uf char(2),
  add column municipio_rfb text check (municipio_rfb ~ '^[0-9]{4}$'),
  add column cpf_responsavel text check (cpf_responsavel ~ '^[0-9]{11}$');
comment on column public.spes.municipio_rfb is 'Código do município na tabela da Receita Federal (4 dígitos, o do PGD), não o do IBGE.';

alter table public.empreendimentos
  add column endereco text,
  add column cep text check (cep ~ '^[0-9]{8}$'),
  add column municipio_rfb text check (municipio_rfb ~ '^[0-9]{4}$'),
  add column tipo_imovel char(1) not null default 'U' check (tipo_imovel in ('U', 'R'));
comment on column public.empreendimentos.municipio_rfb is 'Código do município na tabela da Receita Federal (4 dígitos, o do PGD), não o do IBGE.';

-- Número do contrato por loteadora (a DIMOB aceita 6 posições).
alter table public.contratos add column numero integer;
select set_config('app.carteira', 'on', true);
update public.contratos c set numero = n.numero
  from (select id, row_number() over (partition by tenant_id order by criado_em, id) as numero from public.contratos) n
 where n.id = c.id;
select set_config('app.carteira', '', true);
alter table public.contratos alter column numero set not null;
alter table public.contratos add constraint contratos_numero_unico unique (tenant_id, numero);

create function privado.numerar_contrato()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('contratos.numero:' || new.tenant_id::text, 0));
  select coalesce(max(numero), 0) + 1 into new.numero from public.contratos where tenant_id = new.tenant_id;
  return new;
end;
$$;
create trigger contratos_numero before insert on public.contratos
  for each row execute function privado.numerar_contrato();

-- Valor pago no ano: com ou sem multa e juros de mora (decisão do contador; PL-20).
insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('fiscal.dimob_pago_com_encargos', 'DIMOB: valor pago no ano inclui multa e juros de mora', 'booleano', null, 'PL-20');
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'fiscal.dimob_pago_com_encargos', 'plataforma', null, 'true', daterange('2021-01-01', null), 'Sugestão da plataforma');

-- ---------------------------------------------------------------------------
-- Dados da declaração
-- ---------------------------------------------------------------------------

-- Declarante (SPE), leiaute do ano e operações: contratos assinados no ano ou com pagamento no
-- ano. O arquivo é montado no app (pacote integracoes), que também aponta as pendências.
create function public.dados_dimob(p_spe uuid, p_ano integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.spes;
  v_com_encargos boolean;
  v_inicio date := make_date(p_ano, 1, 1);
  v_fim date := make_date(p_ano + 1, 1, 1);
begin
  select * into s from public.spes where id = p_spe;
  if s.id is null or not privado.pode('fiscal.declarar', s.tenant_id, 'spe', s.id) then
    raise exception 'Sem permissão para a DIMOB desta SPE.' using errcode = 'insufficient_privilege';
  end if;
  if p_ano is null or p_ano < 2021 or p_ano > extract(year from current_date)::integer then
    raise exception 'Ano-calendário inválido.' using errcode = 'check_violation', hint = 'ano';
  end if;
  v_com_encargos := coalesce(
    (public.parametro_vigente('fiscal.dimob_pago_com_encargos', v_fim - 1, s.tenant_id, 'spe', s.id) #>> array[]::text[])::boolean,
    true);

  return jsonb_build_object(
    'ano', p_ano,
    'pago_com_encargos', v_com_encargos,
    'declarante', jsonb_build_object(
      'cnpj', s.cnpj, 'nome', s.razao_social, 'endereco', s.endereco, 'uf', s.uf,
      'municipio_rfb', s.municipio_rfb, 'cpf_responsavel', s.cpf_responsavel),
    'leiaute', (select jsonb_build_object('versao', l.versao, 'registros', l.registros)
                  from public.leiautes_declaracao l
                 where l.declaracao = 'dimob' and l.anos @> p_ano),
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nome', e.nome, 'endereco', e.endereco, 'cep', e.cep, 'uf', e.uf,
        'municipio', e.municipio, 'municipio_rfb', e.municipio_rfb, 'tipo_imovel', e.tipo_imovel) order by e.nome)
        from public.empreendimentos e where e.spe_id = s.id), '[]'::jsonb),
    'operacoes', coalesce((
      select jsonb_agg(o order by (o ->> 'numero')::integer) from (
        select jsonb_build_object(
          'contrato_id', c.id, 'numero', c.numero, 'empreendimento_id', e.id,
          'comprador_id', co.id, 'comprador', co.nome, 'cpf', co.cpf,
          'data', v.data_venda, 'valor_operacao', v.preco_centavos,
          'pago_no_ano', coalesce((
            select sum(case when v_com_encargos then r.valor_centavos else r.principal_centavos end)
              from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
             where p.contrato_id = c.id and r.estornado_em is null
               and r.data_pagamento >= v_inicio and r.data_pagamento < v_fim), 0),
          'imovel', 'Quadra ' || q.codigo || ' Lote ' || l.numero || ' - ' || e.nome
        ) as o
          from public.contratos c
          join public.vendas v on v.id = c.venda_id
          join public.empreendimentos e on e.id = c.empreendimento_id
          join public.compradores co on co.id = c.comprador_id
          join public.lotes l on l.id = v.lote_id
          join public.quadras q on q.id = l.quadra_id
         where e.spe_id = s.id
           and ((v.data_venda >= v_inicio and v.data_venda < v_fim)
                or exists (select 1 from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
                            where p.contrato_id = c.id and r.estornado_em is null
                              and r.data_pagamento >= v_inicio and r.data_pagamento < v_fim))
      ) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.dados_dimob(uuid, integer) from public, anon;
grant execute on function public.dados_dimob(uuid, integer) to authenticated;
revoke execute on function privado.numerar_contrato() from public, anon, authenticated;
