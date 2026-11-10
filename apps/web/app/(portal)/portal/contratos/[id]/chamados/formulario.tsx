'use client'

import { CATEGORIAS_CHAMADO } from '@norteia/aplicacao/chamados'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { abrirChamadoPortal } from './acoes'

export function FormularioChamado({ contratoId }: { contratoId: string }) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    abrirChamadoPortal.bind(null, contratoId),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, d = '') => estado.valores?.[k] ?? d
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="assunto" rotulo="Assunto" erro={er.assunto}>
        <Entrada
          {...ariaCampo('assunto', er.assunto)}
          defaultValue={v('assunto')}
          maxLength={120}
        />
      </Campo>
      <Campo id="categoria" rotulo="Sobre">
        <Selecao id="categoria" name="categoria" defaultValue={v('categoria', 'financeiro')}>
          {Object.entries(CATEGORIAS_CHAMADO).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo id="texto-novo" rotulo="Mensagem" erro={er.texto}>
        <AreaTexto
          {...ariaCampo('texto-novo', er.texto)}
          name="texto"
          defaultValue={v('texto')}
          maxLength={4000}
          rows={4}
        />
      </Campo>
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? 'Enviando…' : 'Abrir chamado'}
      </Button>
    </form>
  )
}
