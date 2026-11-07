'use client'

import { ROTULO_PAPEL } from '@norteia/dominio'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { convidar } from './acoes'

export function FormularioConvite({
  empreendimentos,
}: {
  empreendimentos: { id: string; nome: string }[]
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(convidar, {})
  const [copiado, setCopiado] = useState(false)
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && (
        <Alerta tipo="sucesso">
          <p className="font-medium">
            Convite criado. Envie este link para a pessoa (vale por 7 dias):
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={estado.ok}
              aria-label="Link do convite"
              className="h-9 flex-1 rounded border bg-background px-2 text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(estado.ok!)
                setCopiado(true)
              }}
            >
              {copiado ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        </Alerta>
      )}
      <Campo id="email" rotulo="E-mail da pessoa" erro={er.email}>
        <Entrada
          {...ariaCampo('email', er.email)}
          type="email"
          inputMode="email"
          defaultValue={estado.ok ? '' : estado.valores?.email}
          required
        />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="papel" rotulo="Papel" erro={er.papel}>
          <Selecao
            {...ariaCampo('papel', er.papel)}
            defaultValue={estado.valores?.papel ?? 'corretor'}
          >
            {Object.entries(ROTULO_PAPEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="empreendimento" rotulo="Acesso a" erro={er.empreendimento}>
          <Selecao
            {...ariaCampo('empreendimento', er.empreendimento)}
            defaultValue={estado.valores?.empreendimento ?? ''}
          >
            <option value="">Todos os empreendimentos</option>
            {empreendimentos.map((e) => (
              <option key={e.id} value={e.id}>
                Somente {e.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Criando convite…' : 'Criar convite'}
      </Button>
    </form>
  )
}
