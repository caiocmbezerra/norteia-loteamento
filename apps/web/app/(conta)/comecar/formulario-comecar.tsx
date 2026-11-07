'use client'

import { useActionState } from 'react'
import { CamposEmpreendimento } from '@/components/empreendimento/campos-empreendimento'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { concluirCadastroInicial } from './acoes'

export function FormularioComecar({ mesPadrao }: { mesPadrao: string }) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    concluirCadastroInicial,
    {},
  )
  const erros = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="nomeLoteadora" rotulo="Nome da sua loteadora" erro={erros.nomeLoteadora}>
        <Entrada
          {...ariaCampo('nomeLoteadora', erros.nomeLoteadora)}
          defaultValue={estado.valores?.nomeLoteadora}
          autoComplete="organization"
          required
        />
      </Campo>
      <CamposEmpreendimento erros={erros} valores={estado.valores} mesPadrao={mesPadrao} />
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Criando…' : 'Criar meu loteamento'}
      </Button>
    </form>
  )
}
