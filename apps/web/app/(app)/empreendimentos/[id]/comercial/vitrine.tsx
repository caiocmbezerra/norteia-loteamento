'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Selecao } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { configurarVitrine } from './acoes'

export function FormularioVitrine({
  empreendimentoId,
  publicada,
  precos,
  descricao,
  link,
}: {
  empreendimentoId: string
  publicada: boolean
  precos: string
  descricao: string | null
  link: string | null
}) {
  const [estado, acao, salvando] = useActionState<EstadoFormulario, FormData>(
    configurarVitrine.bind(null, empreendimentoId),
    {},
  )
  const [copiado, setCopiado] = useState(false)
  return (
    <form action={acao} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Página para divulgar no site, no Instagram e no WhatsApp: mapa de lotes disponíveis e botão
        &quot;Tenho interesse&quot;, que vira lead e avisa a equipe por e-mail.
      </p>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      {publicada && link && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center">
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="flex-1 break-all text-sm text-primary underline underline-offset-4"
          >
            {link}
          </a>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              setCopiado(true)
            }}
          >
            {copiado ? 'Copiado' : 'Copiar link'}
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="vit-publicada" rotulo="Situação">
          <Selecao id="vit-publicada" name="publicada" defaultValue={publicada ? 'sim' : 'nao'}>
            <option value="sim">Publicada</option>
            <option value="nao">Não publicada</option>
          </Selecao>
        </Campo>
        <Campo id="vit-precos" rotulo="Preço na vitrine">
          <Selecao id="vit-precos" name="precos" defaultValue={precos}>
            <option value="a_partir">Só &quot;a partir de&quot; (menor preço)</option>
            <option value="lote">Preço de cada lote</option>
            <option value="nenhum">Sem preço (só disponibilidade)</option>
          </Selecao>
        </Campo>
      </div>
      <Campo id="vit-descricao" rotulo="Apresentação (opcional)">
        <AreaTexto
          id="vit-descricao"
          name="descricao"
          maxLength={1000}
          defaultValue={descricao ?? ''}
          placeholder="Ex.: Lotes de 300 m² a 5 minutos do centro, com asfalto, água e energia."
        />
      </Campo>
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : 'Salvar vitrine'}
      </Button>
    </form>
  )
}
