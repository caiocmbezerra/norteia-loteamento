-- INPC como índice de reajuste (decisão do dono do produto em 10/11/2026, DIAGNOSTICO.md).
-- Série 188 do SGS do Banco Central, conferida em produção em 10/11/2026 (variação mensal em %).
-- A importação diária e a de intervalo já leem todos os índices com série; nada mais muda.
insert into public.indices_economicos (codigo, nome, fonte, serie_sgs)
values ('INPC', 'Índice Nacional de Preços ao Consumidor', 'IBGE via BCB/SGS', 188)
on conflict (codigo) do nothing;
