'use client'

import { useActionState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { alternarCentro, criarCentro } from './acoes'

export function FormularioCentro({ raizes }: { raizes: { codigo: string; nome: string }[] }) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(criarCentro, {})
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <Campo id="nome" rotulo="Nome do centro" erro={er.nome}>
        <Entrada {...ariaCampo('nome', er.nome)} placeholder="Ex.: Seguros da obra" />
      </Campo>
      <Campo
        id="pai"
        rotulo="Dentro de"
        ajuda="Opcional: vira subcentro, somado no centro de cima."
      >
        <Selecao {...ariaCampo('pai', undefined, 'ajuda')} defaultValue="">
          <option value="">— centro principal —</option>
          {raizes.map((r) => (
            <option key={r.codigo} value={r.codigo}>
              {r.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Criar centro de custo'}
      </Button>
    </form>
  )
}

export function AlternarCentro({
  codigo,
  nome,
  ativo,
}: {
  codigo: string
  nome: string
  ativo: boolean
}) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendente}
      aria-label={`${ativo ? 'Desativar' : 'Reativar'} ${nome}`}
      onClick={() => iniciar(() => alternarCentro(codigo, !ativo))}
    >
      {ativo ? 'Desativar' : 'Reativar'}
    </Button>
  )
}
