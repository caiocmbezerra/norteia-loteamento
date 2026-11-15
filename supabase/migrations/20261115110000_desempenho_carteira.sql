-- Desempenho da carteira com volume (achados A-11, A-12 e A-13 da auditoria de QA,
-- docs/qa-norteia-loteamento/07-relatorio-execucao.md). Medido com scripts/qa/carga.sh:
-- 3.000 contratos, 201.000 parcelas, 56.750 recebimentos, papel authenticated (limite de 8 s).
--   tela da carteira (recebimentos do mês) .... 14,7 s (cancelada) → ~1 s
--   inadimplencia_historico (12 meses) ........ > 180 s           → ~4 s
--   dados_dimob .............................. 28,7 s            → ~0,5 s
-- Nenhuma regra de permissão muda: a função abaixo aplica a MESMA condição da política anterior
-- (carteira.ler no empreendimento do contrato da parcela), só que sem a RLS aninhada de
-- parcelas e contratos, que fazia privado.pode rodar centenas de milhares de vezes.

-- A-12/A-13: busca de recebimentos por parcela. Os índices existentes começam por tenant_id
-- (chave composta) e não servem às subconsultas por parcela_id.
create index recebimentos_parcela_ativos_idx on public.recebimentos (parcela_id) where estornado_em is null;
-- Listas e somas por período (recebimentos do mês, DIMOB, informe de pagamentos).
create index recebimentos_data_idx on public.recebimentos (tenant_id, data_pagamento);

-- A-11: leitura da carteira pela parcela.
create function privado.pode_ler_parcela(p_parcela uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.parcelas p
      join public.contratos c on c.id = p.contrato_id
     where p.id = p_parcela
       and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  )
$$;
revoke execute on function privado.pode_ler_parcela(uuid) from public, anon;
grant execute on function privado.pode_ler_parcela(uuid) to authenticated;

drop policy "ler recebimentos" on public.recebimentos;
create policy "ler recebimentos" on public.recebimentos
  for select to authenticated using (privado.pode_ler_parcela(parcela_id));

drop policy "ler cobranças" on public.cobrancas;
create policy "ler cobranças" on public.cobrancas
  for select to authenticated using (privado.pode_ler_parcela(parcela_id));
