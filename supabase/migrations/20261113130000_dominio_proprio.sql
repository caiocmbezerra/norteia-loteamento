-- Endereço público do sistema passa a ser o domínio próprio (www.norteialoteamento.com.br,
-- configurado na Vercel em 13/11/2026). Vale para os links dos e-mails (lembretes, convites,
-- avisos de chamado e descadastro). O endereço antigo da Vercel continua funcionando.
update public.parametro_valores
   set vigencia = daterange(lower(vigencia), '2026-11-13'), motivo = motivo || ' (substituído pelo domínio próprio)'
 where chave = 'plataforma.url_site' and escopo = 'plataforma' and upper_inf(vigencia) and lower(vigencia) < '2026-11-13';
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo)
values (null, 'plataforma.url_site', 'plataforma', null, '"https://www.norteialoteamento.com.br"', daterange('2026-11-13', null), 'Domínio próprio do sistema');
