'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { novaImobiliaria, novoCorretor } from './acoes'

function useForm(acao: (e: EstadoFormulario, f: FormData) => Promise<EstadoFormulario>) {
  const [estado, despachar, enviando] = useActionState<EstadoFormulario, FormData>(acao, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) ref.current?.reset()
  }, [estado])
  return {
    estado,
    despachar,
    enviando,
    ref,
    er: estado.erros ?? {},
    v: (k: string) => (estado.ok ? undefined : estado.valores?.[k]),
  }
}

export function FormularioCorretor({
  imobiliarias,
  usuarios,
}: {
  imobiliarias: { id: string; nome: string }[]
  usuarios: { id: string; nome: string }[]
}) {
  const f = useForm(novoCorretor)
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      {f.estado.erro && <Alerta>{f.estado.erro}</Alerta>}
      {f.estado.ok && <Alerta tipo="sucesso">{f.estado.ok}</Alerta>}
      <Campo id="corretor-nome" rotulo="Nome do corretor" erro={f.er.nome}>
        <Entrada
          {...ariaCampo('corretor-nome', f.er.nome)}
          name="nome"
          defaultValue={f.v('nome')}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="creci" rotulo="CRECI">
          <Entrada id="creci" name="creci" defaultValue={f.v('creci')} />
        </Campo>
        <Campo id="imobiliaria" rotulo="Imobiliária">
          <Selecao id="imobiliaria" name="imobiliaria" defaultValue={f.v('imobiliaria') ?? ''}>
            <option value="">Autônomo</option>
            {imobiliarias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo id="comissao" rotulo="Comissão (%)" erro={f.er.comissao}>
          <Entrada
            {...ariaCampo('comissao', f.er.comissao)}
            inputMode="decimal"
            defaultValue={f.v('comissao') ?? '5'}
          />
        </Campo>
        <Campo id="modo" rotulo="Pagamento da comissão">
          <Selecao id="modo" name="modo" defaultValue={f.v('modo') ?? 'ato'}>
            <option value="ato">No ato da venda</option>
            <option value="recebido">Sobre o recebido</option>
          </Selecao>
        </Campo>
      </div>
      <Campo
        id="usuario"
        rotulo="Acesso à plataforma"
        ajuda="Ligue a um membro com papel de corretor para ele reservar pelo celular."
      >
        <Selecao {...ariaCampo('usuario', undefined, 'ajuda')} defaultValue={f.v('usuario') ?? ''}>
          <option value="">Sem acesso</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Button type="submit" disabled={f.enviando}>
        Cadastrar corretor
      </Button>
    </form>
  )
}

export function FormularioImobiliaria() {
  const f = useForm(novaImobiliaria)
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      {f.estado.erro && <Alerta>{f.estado.erro}</Alerta>}
      {f.estado.ok && <Alerta tipo="sucesso">{f.estado.ok}</Alerta>}
      <Campo id="imob-nome" rotulo="Nome da imobiliária" erro={f.er.nome}>
        <Entrada {...ariaCampo('imob-nome', f.er.nome)} name="nome" defaultValue={f.v('nome')} />
      </Campo>
      <Campo id="cnpj" rotulo="CNPJ (opcional)" erro={f.er.cnpj}>
        <Entrada {...ariaCampo('cnpj', f.er.cnpj)} inputMode="numeric" defaultValue={f.v('cnpj')} />
      </Campo>
      <Button type="submit" variant="outline" disabled={f.enviando}>
        Cadastrar imobiliária
      </Button>
    </form>
  )
}
