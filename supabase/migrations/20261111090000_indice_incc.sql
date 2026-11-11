-- INCC ativado para a importação automática (pendência da Fase 5). Série 192 do SGS do Banco
-- Central (INCC-DI da FGV, o que a FGV publica como "INCC"), conferida em produção em
-- 11/11/2026: variação mensal em % (08/2026 0,66; 09/2026 0,22; 10/2026 0,37). O INCC-M (série
-- 7456) fica de fora até algum cliente pedir. A importação diária já lê todos os índices com série.
update public.indices_economicos set serie_sgs = 192 where codigo = 'INCC' and serie_sgs is null;
