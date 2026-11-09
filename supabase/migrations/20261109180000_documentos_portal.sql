-- Fase 7 · Contrato e termo de quitação baixados pelo próprio comprador no portal, com o modelo
-- em uso do cliente. Mesmos dados da gestão; a função confere o vínculo a cada chamada.

create function public.documento_portal(p_contrato uuid, p_tipo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contratos;
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not (
    privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
    or privado.e_comprador(c.comprador_id)
  ) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo not in ('contrato', 'quitacao') then
    raise exception 'Documento indisponível no portal.' using errcode = 'check_violation';
  end if;
  if p_tipo = 'quitacao' and c.situacao <> 'quitado' then
    raise exception 'O termo de quitação só sai com o contrato quitado.' using errcode = 'check_violation';
  end if;

  return (
    select jsonb_build_object(
      'contrato', jsonb_build_object(
        'situacao', c.situacao, 'quitado_em', c.quitado_em, 'indice_reajuste', c.indice_reajuste,
        'multa_atraso', c.multa_atraso, 'juros_mora_mensal', c.juros_mora_mensal,
        'reajuste_periodicidade_meses', c.reajuste_periodicidade_meses,
        'reajuste_defasagem_meses', c.reajuste_defasagem_meses,
        'compradores', jsonb_build_object('nome', co.nome, 'cpf', co.cpf, 'email', co.email, 'telefone', co.telefone),
        'lotes', jsonb_build_object('numero', l.numero, 'area_m2', l.area_m2, 'quadras', jsonb_build_object('codigo', q.codigo)),
        'vendas', jsonb_build_object('data_venda', v.data_venda, 'preco_centavos', v.preco_centavos,
          'entrada_centavos', v.entrada_centavos, 'parcelas', v.parcelas, 'juros_mensal', v.juros_mensal, 'sistema', v.sistema),
        'empreendimentos', jsonb_build_object('nome', e.nome, 'municipio', e.municipio, 'uf', e.uf,
          'spes', jsonb_build_object('razao_social', s.razao_social, 'cnpj', s.cnpj))),
      'parcelas', coalesce((select jsonb_agg(jsonb_build_object('numero', p.numero, 'vencimento', p.vencimento,
          'valor_centavos', p.valor_centavos, 'situacao', p.situacao, 'aditivo_origem_id', p.aditivo_origem_id) order by p.numero)
        from public.parcelas p where p.contrato_id = c.id), '[]'::jsonb),
      'recebido_centavos', (select coalesce(sum(r.valor_centavos), 0) from public.recebimentos r
         join public.parcelas p on p.id = r.parcela_id where p.contrato_id = c.id and r.estornado_em is null),
      'modelo', (select m.conteudo_base64 from public.modelos_documento m
                  where m.tenant_id = c.tenant_id and m.tipo = p_tipo and m.ativo)
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

revoke execute on function public.documento_portal(uuid, text) from public, anon;
grant execute on function public.documento_portal(uuid, text) to authenticated;
