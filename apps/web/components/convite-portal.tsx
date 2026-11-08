'use client'

import { useActionState, useState } from 'react'
import { convidarPortal } from '@/app/(app)/acoes'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'

const QUEM = { comprador: 'o comprador', socio: 'o sócio', permutante: 'o permutante' }
const JA = { comprador: 'O comprador', socio: 'O sócio', permutante: 'O permutante' }

/** Gera o link de convite para o portal (somente leitura) de um comprador, sócio ou permutante. */
export function ConvitePortal({
  tipo,
  alvoId,
  email,
  ativo,
  id = `convite-${tipo}`,
}: {
  tipo: 'comprador' | 'socio' | 'permutante'
  alvoId: string
  email: string | null
  ativo: boolean
  id?: string
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    convidarPortal.bind(null, tipo, alvoId),
    {},
  )
  const [copiado, setCopiado] = useState(false)
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      <p className="text-sm text-muted-foreground">
        {ativo
          ? `${JA[tipo]} já acessa o portal. Gere um novo convite só se precisar trocar o e-mail.`
          : `Convide ${QUEM[tipo]} para acompanhar tudo pelo celular, em modo somente leitura.`}
      </p>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && (
        <Alerta tipo="sucesso">
          <p className="font-medium">Envie este link (vale por 30 dias):</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={estado.ok}
              aria-label="Link do convite para o portal"
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
      <Campo id={`${id}-email`} rotulo="E-mail para o portal" erro={er.email}>
        <Entrada
          {...ariaCampo(`${id}-email`, er.email)}
          name="email"
          type="email"
          inputMode="email"
          defaultValue={estado.valores?.email ?? email ?? ''}
        />
      </Campo>
      <Button type="submit" variant="outline" disabled={enviando}>
        {enviando ? 'Gerando convite…' : 'Gerar convite para o portal'}
      </Button>
    </form>
  )
}
