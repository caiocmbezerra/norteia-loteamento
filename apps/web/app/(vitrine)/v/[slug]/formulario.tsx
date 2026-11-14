'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao } from '@/components/ui/formulario'
import { type EstadoInteresse, registrarInteresse } from './acoes'

export function FormularioInteresse({
  slug,
  loteadora,
  lotes,
  loteEscolhido,
}: {
  slug: string
  loteadora: string
  lotes: { id: string; rotulo: string }[]
  loteEscolhido?: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoInteresse, FormData>(
    registrarInteresse.bind(null, slug),
    {},
  )
  if (estado.ok)
    return (
      <Alerta tipo="sucesso">
        Recebemos seu interesse. A equipe da {loteadora} vai entrar em contato em breve.
      </Alerta>
    )
  const val = estado.valores ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3">
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="int-nome" rotulo="Seu nome">
        <Entrada id="int-nome" name="nome" autoComplete="name" required defaultValue={val.nome} />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="int-telefone" rotulo="WhatsApp ou telefone">
          <Entrada
            id="int-telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={val.telefone}
          />
        </Campo>
        <Campo id="int-email" rotulo="E-mail">
          <Entrada
            id="int-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={val.email}
          />
        </Campo>
      </div>
      {lotes.length > 0 && (
        <Campo id="int-lote" rotulo="Lote de interesse (opcional)">
          <Selecao id="int-lote" name="lote" defaultValue={val.lote ?? loteEscolhido ?? ''}>
            <option value="">Ainda não sei</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
      )}
      <Campo id="int-mensagem" rotulo="Mensagem (opcional)">
        <AreaTexto id="int-mensagem" name="mensagem" maxLength={1000} defaultValue={val.mensagem} />
      </Campo>
      <input
        type="text"
        name="site"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="consentimento" value="sim" required className="mt-1 size-4" />
        <span>
          Autorizo a {loteadora} a entrar em contato comigo sobre este empreendimento. Meus dados
          serão usados só para esse atendimento.
        </span>
      </label>
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Tenho interesse'}
      </Button>
    </form>
  )
}
