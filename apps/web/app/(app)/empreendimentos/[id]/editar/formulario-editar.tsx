'use client'

import { ROTULO_SITUACAO_EMPREENDIMENTO, UFS } from '@norteia/dominio'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { editarEmpreendimento } from '../../acoes'

const brl = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

export function FormularioEditar({
  e,
}: {
  e: {
    id: string
    nome: string
    municipio: string | null
    uf: string | null
    situacao: keyof typeof ROTULO_SITUACAO_EMPREENDIMENTO
    data_registro: string | null
    registro_matricula: string | null
    area_total_m2: number | null
    area_vendavel_m2: number | null
  }
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    editarEmpreendimento.bind(null, e.id),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, padrao: string) => estado.valores?.[k] ?? padrao
  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo id="nome" rotulo="Nome" erro={er.nome}>
        <Entrada {...ariaCampo('nome', er.nome)} defaultValue={v('nome', e.nome)} required />
      </Campo>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Campo id="municipio" rotulo="Município" erro={er.municipio}>
          <Entrada
            {...ariaCampo('municipio', er.municipio)}
            defaultValue={v('municipio', e.municipio ?? '')}
          />
        </Campo>
        <Campo id="uf" rotulo="UF" erro={er.uf}>
          <Selecao {...ariaCampo('uf', er.uf)} defaultValue={v('uf', e.uf ?? '')}>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Campo id="situacao" rotulo="Situação" erro={er.situacao}>
        <Selecao {...ariaCampo('situacao', er.situacao)} defaultValue={v('situacao', e.situacao)}>
          {Object.entries(ROTULO_SITUACAO_EMPREENDIMENTO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Selecao>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          id="dataRegistro"
          rotulo="Data do registro"
          ajuda="Libera as vendas (Lei 6.766)."
          erro={er.dataRegistro}
        >
          <Entrada
            {...ariaCampo('dataRegistro', er.dataRegistro, 'ajuda')}
            type="date"
            defaultValue={v('dataRegistro', e.data_registro ?? '')}
          />
        </Campo>
        <Campo id="registroMatricula" rotulo="Matrícula do registro" erro={er.registroMatricula}>
          <Entrada
            {...ariaCampo('registroMatricula', er.registroMatricula)}
            defaultValue={v('registroMatricula', e.registro_matricula ?? '')}
          />
        </Campo>
        <Campo id="areaTotal" rotulo="Área total (m²)" erro={er.areaTotal}>
          <Entrada
            {...ariaCampo('areaTotal', er.areaTotal)}
            inputMode="decimal"
            defaultValue={v('areaTotal', brl(e.area_total_m2))}
          />
        </Campo>
        <Campo id="areaVendavel" rotulo="Área vendável (m²)" erro={er.areaVendavel}>
          <Entrada
            {...ariaCampo('areaVendavel', er.areaVendavel)}
            inputMode="decimal"
            defaultValue={v('areaVendavel', brl(e.area_vendavel_m2))}
          />
        </Campo>
      </div>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
