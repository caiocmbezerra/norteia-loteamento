'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { adicionarEstrutura } from './acoes'

export function FormularioEstrutura({
  empresas,
}: {
  empresas: { id: string; razao_social: string }[]
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    adicionarEstrutura,
    {},
  )
  const er = estado.erros ?? {}
  return (
    <form
      action={acao}
      className="flex flex-col gap-4"
      noValidate
      key={estado.ok ? Date.now() : 'f'}
    >
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="tipo" rotulo="Cadastrar">
          <Selecao id="tipo" name="tipo" defaultValue={estado.valores?.tipo ?? 'spe'}>
            <option value="spe">SPE</option>
            <option value="empresa">Empresa</option>
          </Selecao>
        </Campo>
        <Campo id="empresa" rotulo="Empresa controladora (para SPE)">
          <Selecao
            id="empresa"
            name="empresa"
            defaultValue={estado.valores?.empresa ?? empresas[0]?.id}
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.razao_social}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Campo id="razaoSocial" rotulo="Razão social" erro={er.razaoSocial}>
        <Entrada
          {...ariaCampo('razaoSocial', er.razaoSocial)}
          defaultValue={estado.valores?.razaoSocial}
          required
        />
      </Campo>
      <Campo id="cnpj" rotulo="CNPJ (opcional)" erro={er.cnpj}>
        <Entrada
          {...ariaCampo('cnpj', er.cnpj)}
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          defaultValue={estado.valores?.cnpj}
        />
      </Campo>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
