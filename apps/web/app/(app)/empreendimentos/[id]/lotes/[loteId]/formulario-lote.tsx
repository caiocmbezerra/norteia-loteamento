'use client'

import { ROTULO_STATUS_LOTE, STATUS_LOTE_CADASTRO, type StatusLote } from '@norteia/dominio'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { editarLote } from '../../../acoes'

const decimal = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))
const moeda = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function FormularioLote({
  empreendimentoId,
  lote,
  precoPelaTabela,
}: {
  empreendimentoId: string
  precoPelaTabela: boolean
  lote: {
    id: string
    status: StatusLote
    area_m2: number
    testada_m: number | null
    preco_base_centavos: number | null
    observacao: string | null
    matricula: string | null
    matricula_aberta_em: string | null
  }
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    editarLote.bind(null, empreendimentoId, lote.id),
    {},
  )
  const er = estado.erros ?? {}
  const v = (k: string, padrao: string) => estado.valores?.[k] ?? padrao
  const statusEditavel = (STATUS_LOTE_CADASTRO as readonly string[]).includes(lote.status)

  return (
    <form action={acao} className="flex flex-col gap-4" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      <Campo
        id="status"
        rotulo="Situação"
        ajuda={
          statusEditavel
            ? 'Reserva e venda são feitas pelo módulo comercial.'
            : 'Lote em negociação: a situação muda pelo módulo comercial.'
        }
        erro={er.status}
      >
        <Selecao
          {...ariaCampo('status', er.status, 'ajuda')}
          defaultValue={v('status', lote.status)}
          disabled={!statusEditavel}
        >
          {(statusEditavel ? STATUS_LOTE_CADASTRO : [lote.status]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_LOTE[s]}
            </option>
          ))}
        </Selecao>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="area" rotulo="Área (m²)" erro={er.area}>
          <Entrada
            {...ariaCampo('area', er.area)}
            inputMode="decimal"
            defaultValue={v('area', decimal(lote.area_m2))}
            required
          />
        </Campo>
        <Campo id="testada" rotulo="Testada (m)" erro={er.testada}>
          <Entrada
            {...ariaCampo('testada', er.testada)}
            inputMode="decimal"
            defaultValue={v('testada', decimal(lote.testada_m))}
          />
        </Campo>
      </div>
      <Campo
        id="preco"
        rotulo="Preço de referência (R$)"
        erro={er.preco}
        {...(precoPelaTabela
          ? { ajuda: 'Segue a tabela de preços vigente; para mudar, publique uma nova tabela.' }
          : {})}
      >
        <Entrada
          {...ariaCampo('preco', er.preco, precoPelaTabela ? 'ajuda' : undefined)}
          disabled={precoPelaTabela}
          inputMode="decimal"
          placeholder="90.000,00"
          defaultValue={v(
            'preco',
            lote.preco_base_centavos === null ? '' : moeda.format(lote.preco_base_centavos / 100),
          )}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          id="matricula"
          rotulo="Matrícula no cartório"
          ajuda="Preencha quando o cartório abrir a matrícula do lote."
          erro={er.matricula}
        >
          <Entrada
            {...ariaCampo('matricula', er.matricula, 'ajuda')}
            defaultValue={v('matricula', lote.matricula ?? '')}
          />
        </Campo>
        <Campo id="matriculaAbertaEm" rotulo="Aberta em" erro={er.matriculaAbertaEm}>
          <Entrada
            {...ariaCampo('matriculaAbertaEm', er.matriculaAbertaEm)}
            type="date"
            defaultValue={v('matriculaAbertaEm', lote.matricula_aberta_em ?? '')}
          />
        </Campo>
      </div>
      <Campo id="observacao" rotulo="Observação" erro={er.observacao}>
        <AreaTexto
          {...ariaCampo('observacao', er.observacao)}
          defaultValue={v('observacao', lote.observacao ?? '')}
          maxLength={500}
        />
      </Campo>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar lote'}
      </Button>
    </form>
  )
}
