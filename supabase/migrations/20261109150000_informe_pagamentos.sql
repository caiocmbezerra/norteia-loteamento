-- Fase 7b-2 · Informe de pagamentos ao comprador (para a declaração de IR): pagamentos do ano,
-- total pago até 31/12 e dados da vendedora e do imóvel, com o modelo DOCX do cliente (D-059).
-- O formato exigido varia por cliente: o texto fica no modelo, revisado pelo contador (PL-19).

alter table public.modelos_documento drop constraint modelos_documento_tipo_check;
alter table public.modelos_documento add constraint modelos_documento_tipo_check
  check (tipo in ('contrato', 'quitacao', 'aditivo_renegociacao', 'aditivo_cessao', 'aditivo_troca_lote', 'informe_pagamentos'));

-- Lido pela equipe (carteira.ler) e pelo próprio comprador no portal; devolve também o modelo
-- em uso do cliente (nulo = padrão da plataforma), porque o comprador não lê modelos_documento.
create function public.informe_pagamentos(p_contrato uuid, p_ano integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_inicio date := make_date(p_ano, 1, 1);
  v_fim date := make_date(p_ano + 1, 1, 1);
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not (
    privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
    or privado.e_comprador(c.comprador_id)
  ) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  if p_ano is null or p_ano < 2000 or p_ano > extract(year from current_date)::integer then
    raise exception 'Ano-calendário inválido.' using errcode = 'check_violation', hint = 'ano';
  end if;

  return (
    select jsonb_build_object(
      'ano', p_ano,
      'contrato_numero', c.numero,
      'vendedora', jsonb_build_object('razao_social', s.razao_social, 'cnpj', s.cnpj, 'endereco', s.endereco),
      'comprador', jsonb_build_object('nome', co.nome, 'cpf', co.cpf),
      'imovel', jsonb_build_object('empreendimento', e.nome, 'municipio', e.municipio, 'uf', e.uf,
        'endereco', e.endereco, 'quadra', q.codigo, 'lote', l.numero, 'area_m2', l.area_m2),
      'venda', jsonb_build_object('data', v.data_venda, 'preco', v.preco_centavos),
      'pagamentos', coalesce((
        select jsonb_agg(jsonb_build_object('data', r.data_pagamento, 'parcela', p.numero,
                 'principal', r.principal_centavos, 'encargos', r.multa_centavos + r.juros_mora_centavos,
                 'desconto', r.desconto_centavos, 'valor', r.valor_centavos) order by r.data_pagamento, p.numero)
          from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
         where p.contrato_id = c.id and r.estornado_em is null
           and r.data_pagamento >= v_inicio and r.data_pagamento < v_fim), '[]'::jsonb),
      'pago_ate_fim_do_ano', (
        select coalesce(sum(r.valor_centavos), 0)
          from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
         where p.contrato_id = c.id and r.estornado_em is null and r.data_pagamento < v_fim),
      'modelo', (select m.conteudo_base64 from public.modelos_documento m
                  where m.tenant_id = c.tenant_id and m.tipo = 'informe_pagamentos' and m.ativo)
    )
      from public.vendas v
      join public.empreendimentos e on e.id = c.empreendimento_id
      join public.spes s on s.id = e.spe_id
      join public.compradores co on co.id = c.comprador_id
      join public.lotes l on l.id = c.lote_id
      join public.quadras q on q.id = l.quadra_id
     where v.id = c.venda_id
  );
end;
$$;

revoke execute on function public.informe_pagamentos(uuid, integer) from public, anon;
grant execute on function public.informe_pagamentos(uuid, integer) to authenticated;
