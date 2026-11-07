'use client'

import { CENTROS_CUSTO_PADRAO } from '@norteia/dominio'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { salvarEstudo } from '../acoes'

export interface ValoresEstudo {
  nome: string
  lotesVendaveis: string
  precoLote: string
  vendasMesInicio: string
  lotesPorMes: string
  entrada: string
  parcelas: string
  jurosMensal: string
  sistema: string
  carenciaMeses: string
  comissao: string
  inadimplencia: string
  aliquota: string
  tmaMensal: string
  custos: {
    descricao: string
    centroCusto: string
    tipo: string
    valor: string
    mesInicio: string
    mesFim: string
  }[]
}

const CUSTO_VAZIO = {
  descricao: '',
  centroCusto: 'outros',
  tipo: 'total',
  valor: '',
  mesInicio: '0',
  mesFim: '0',
}

export function FormularioEstudo({
  empreendimentoId,
  id,
  inicial,
}: {
  empreendimentoId: string
  id: string
  inicial: ValoresEstudo
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    salvarEstudo.bind(null, empreendimentoId, id),
    {},
  )
  const [linhas, setLinhas] = useState(inicial.custos.length ? inicial.custos : [CUSTO_VAZIO])
  const er = estado.erros ?? {}
  const v = (k: keyof ValoresEstudo) => estado.valores?.[k] ?? (inicial[k] as string)

  const campo = (
    k: keyof ValoresEstudo,
    rotulo: string,
    props: React.ComponentProps<'input'> = {},
    ajuda?: string,
  ) => (
    <Campo id={k} rotulo={rotulo} erro={er[k]} {...(ajuda ? { ajuda } : {})}>
      <Entrada {...ariaCampo(k, er[k], ajuda)} defaultValue={v(k)} {...props} />
    </Campo>
  )

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {campo('nome', 'Nome do estudo')}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Vendas</legend>
        {campo(
          'lotesVendaveis',
          'Lotes à venda',
          { inputMode: 'numeric' },
          'Sem os lotes de permuta.',
        )}
        {campo('precoLote', 'Preço do lote (R$)', { inputMode: 'decimal' })}
        {campo(
          'vendasMesInicio',
          'Início das vendas (mês)',
          { inputMode: 'numeric' },
          'Contado a partir do mês 0.',
        )}
        {campo('lotesPorMes', 'Lotes vendidos por mês', { inputMode: 'numeric' })}
        {campo('comissao', 'Comissão (%)', { inputMode: 'decimal' })}
        {campo('inadimplencia', 'Inadimplência (% das parcelas)', { inputMode: 'decimal' })}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Pagamento do comprador</legend>
        {campo('entrada', 'Entrada (%)', { inputMode: 'decimal' })}
        {campo('parcelas', 'Parcelas', { inputMode: 'numeric' })}
        {campo('jurosMensal', 'Juros ao mês (%)', { inputMode: 'decimal' })}
        <Campo id="sistema" rotulo="Sistema" erro={er.sistema}>
          <Selecao {...ariaCampo('sistema', er.sistema)} defaultValue={v('sistema')}>
            <option value="price">Price (parcelas iguais)</option>
            <option value="sac">SAC (parcelas decrescentes)</option>
          </Selecao>
        </Campo>
        {campo('carenciaMeses', 'Meses até a 1ª parcela', { inputMode: 'numeric' })}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Tributos e retorno</legend>
        {campo(
          'aliquota',
          'Tributos sobre o recebido (%)',
          { inputMode: 'decimal' },
          'Confirme com seu contador o regime da SPE.',
        )}
        {campo(
          'tmaMensal',
          'TMA ao mês (%)',
          { inputMode: 'decimal' },
          'Taxa mínima de atratividade, em valores reais.',
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Custos</legend>
        {er.custos && <Alerta>{er.custos}</Alerta>}
        {linhas.map((c, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-6">
            <Entrada
              name={`custos.${i}.descricao`}
              defaultValue={c.descricao}
              placeholder="Descrição"
              aria-label={`Custo ${i + 1}: descrição`}
              className="col-span-2"
            />
            <Selecao
              name={`custos.${i}.centroCusto`}
              defaultValue={c.centroCusto}
              aria-label={`Custo ${i + 1}: centro de custo`}
            >
              {Object.entries(CENTROS_CUSTO_PADRAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </Selecao>
            <Selecao
              name={`custos.${i}.tipo`}
              defaultValue={c.tipo}
              aria-label={`Custo ${i + 1}: forma`}
            >
              <option value="total">Total no período</option>
              <option value="mensal">Por mês</option>
            </Selecao>
            <Entrada
              name={`custos.${i}.valor`}
              defaultValue={c.valor}
              inputMode="decimal"
              placeholder="Valor (R$)"
              aria-label={`Custo ${i + 1}: valor`}
            />
            <div className="flex items-center gap-1">
              <Entrada
                name={`custos.${i}.mesInicio`}
                defaultValue={c.mesInicio}
                inputMode="numeric"
                aria-label={`Custo ${i + 1}: mês inicial`}
              />
              <span aria-hidden className="text-muted-foreground">
                a
              </span>
              <Entrada
                name={`custos.${i}.mesFim`}
                defaultValue={c.mesFim}
                inputMode="numeric"
                aria-label={`Custo ${i + 1}: mês final`}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setLinhas([...linhas, CUSTO_VAZIO])}
        >
          Adicionar custo
        </Button>
      </fieldset>

      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Calculando…' : 'Salvar e calcular'}
      </Button>
    </form>
  )
}
