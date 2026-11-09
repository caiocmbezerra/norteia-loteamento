'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { atualizarLead, cadastrarLead, definirMeta } from './acoes'
import { ROTULO_ORIGEM, ROTULO_SITUACAO_LEAD } from './rotulos'

type Corretor = { id: string; nome: string }

export function FormularioLead({
  empreendimentoId,
  corretores,
}: {
  empreendimentoId: string
  /** Vazio quando quem cadastra é o próprio corretor. */
  corretores: Corretor[]
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    cadastrarLead.bind(null, empreendimentoId),
    {},
  )
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Campo id="nome" rotulo="Nome do interessado" erro={er.nome}>
        <Entrada {...ariaCampo('nome', er.nome)} autoComplete="off" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="telefone" rotulo="Telefone">
          <Entrada id="telefone" name="telefone" inputMode="tel" />
        </Campo>
        <Campo id="email" rotulo="E-mail" erro={er.email}>
          <Entrada {...ariaCampo('email', er.email)} type="email" />
        </Campo>
        <Campo id="origem" rotulo="Origem">
          <Selecao id="origem" name="origem" defaultValue="outro">
            {Object.entries(ROTULO_ORIGEM).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Selecao>
        </Campo>
        {corretores.length > 0 ? (
          <Campo id="corretor" rotulo="Corretor">
            <Selecao id="corretor" name="corretor" defaultValue="">
              <option value="">Sem corretor</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        ) : (
          <input type="hidden" name="corretor" value="" />
        )}
      </div>
      <Campo id="observacao" rotulo="Interesse / observação">
        <AreaTexto id="observacao" name="observacao" maxLength={1000} />
      </Campo>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Cadastrar lead'}
      </Button>
    </form>
  )
}

export function AtualizarLead({
  empreendimentoId,
  lead,
}: {
  empreendimentoId: string
  lead: {
    id: string
    nome: string
    situacao: string
    proximo_contato: string | null
    motivo_perda: string | null
  }
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    atualizarLead.bind(null, empreendimentoId, lead.id),
    {},
  )
  const [situacao, setSituacao] = useState(lead.situacao)
  const er = estado.erros ?? {}
  const id = (c: string) => `${c}-${lead.id}`
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={id('situacao')} className="text-xs text-muted-foreground">
          Etapa ({lead.nome})
        </label>
        {/* O React limpa o formulário após o envio; a etapa escolhida vai pelo campo oculto. */}
        <input type="hidden" name="situacao" value={situacao} />
        <Selecao id={id('situacao')} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          {Object.entries(ROTULO_SITUACAO_LEAD).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
      </div>
      {situacao === 'perdido' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={id('motivo')} className="text-xs text-muted-foreground">
            Motivo da perda
          </label>
          <Entrada
            id={id('motivo')}
            name="motivoPerda"
            defaultValue={lead.motivo_perda ?? ''}
            aria-invalid={er.motivoPerda ? true : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={id('contato')} className="text-xs text-muted-foreground">
            Próximo contato
          </label>
          <Entrada
            id={id('contato')}
            name="proximoContato"
            type="date"
            defaultValue={lead.proximo_contato ?? ''}
          />
        </div>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={enviando}>
        Salvar
      </Button>
      {(estado.erro || er.motivoPerda) && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {er.motivoPerda ?? estado.erro}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="basis-full text-xs text-muted-foreground">
          {estado.ok}
        </p>
      )}
    </form>
  )
}

export function FormularioMeta({
  empreendimentoId,
  mes,
  corretores,
}: {
  empreendimentoId: string
  mes: string
  corretores: Corretor[]
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    definirMeta.bind(null, empreendimentoId),
    {},
  )
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <div className="grid grid-cols-2 gap-3">
        <Campo id="meta-mes" rotulo="Mês" erro={er.mes}>
          <Entrada id="meta-mes" name="mes" type="month" defaultValue={mes} />
        </Campo>
        <Campo id="meta-corretor" rotulo="De quem">
          <Selecao id="meta-corretor" name="corretor" defaultValue="">
            <option value="">Empreendimento (total)</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="meta-vendas" rotulo="Vendas (lotes)" erro={er.vendas}>
          <Entrada
            {...ariaCampo('meta-vendas', er.vendas)}
            name="vendas"
            inputMode="numeric"
            defaultValue="0"
          />
        </Campo>
        <Campo id="meta-vgv" rotulo="VGV (R$)" erro={er.vgv}>
          <Entrada
            {...ariaCampo('meta-vgv', er.vgv)}
            name="vgv"
            inputMode="decimal"
            placeholder="900.000,00"
          />
        </Campo>
      </div>
      <Button type="submit" variant="secondary" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar meta'}
      </Button>
    </form>
  )
}
