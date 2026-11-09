'use client'

import type { EventoContabil, FormatoContabil } from '@norteia/aplicacao'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, AreaTexto, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import { contas, formato, regra } from './acoes'

type Conta = { codigo: string; nome: string }

function Mensagens({ estado }: { estado: EstadoFormulario }) {
  return (
    <>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
    </>
  )
}

export function FormularioContas() {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(contas, {})
  const er = estado.erros ?? {}
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={estado} />
      <Campo
        id="contas"
        rotulo="Contas (uma por linha: código;nome)"
        ajuda="Cole do plano de contas do seu contador. Conta já cadastrada tem o nome atualizado."
        erro={er.contas}
      >
        <AreaTexto
          {...ariaCampo('contas', er.contas)}
          rows={4}
          placeholder={'1.1.1.01;Caixa\n1.1.2.01;Clientes a receber'}
          defaultValue={estado.ok ? '' : estado.valores?.contas}
        />
      </Campo>
      <Button type="submit" variant="outline" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar contas'}
      </Button>
    </form>
  )
}

export function FormularioRegra({
  evento,
  nome,
  contas: lista,
  atual,
}: {
  evento: EventoContabil
  nome: string
  contas: Conta[]
  atual: { contaDebito: string; contaCredito: string; historico: string } | null
}) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(
    regra.bind(null, evento),
    {},
  )
  const er = estado.erros ?? {}
  const p = `regra-${evento}`
  const v = (k: string, padrao: string) => estado.valores?.[k] ?? padrao
  const opcoes = lista.map((c) => (
    <option key={c.codigo} value={c.codigo}>
      {c.codigo} · {c.nome}
    </option>
  ))
  return (
    <form action={acao} className="flex flex-col gap-2" noValidate aria-label={`Regra: ${nome}`}>
      <Mensagens estado={estado} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo id={`${p}-debito`} rotulo={`Débito · ${nome}`} erro={er.conta_debito}>
          <Selecao
            key={v('conta_debito', atual?.contaDebito ?? '')}
            {...ariaCampo(`${p}-debito`, er.conta_debito)}
            name="conta_debito"
            defaultValue={v('conta_debito', atual?.contaDebito ?? '')}
          >
            <option value="">Escolha…</option>
            {opcoes}
          </Selecao>
        </Campo>
        <Campo id={`${p}-credito`} rotulo={`Crédito · ${nome}`} erro={er.conta_credito}>
          <Selecao
            key={v('conta_credito', atual?.contaCredito ?? '')}
            {...ariaCampo(`${p}-credito`, er.conta_credito)}
            name="conta_credito"
            defaultValue={v('conta_credito', atual?.contaCredito ?? '')}
          >
            <option value="">Escolha…</option>
            {opcoes}
          </Selecao>
        </Campo>
        <Campo id={`${p}-historico`} rotulo={`Histórico · ${nome}`} erro={er.historico}>
          <Entrada
            {...ariaCampo(`${p}-historico`, er.historico)}
            name="historico"
            defaultValue={v('historico', atual?.historico ?? '{descricao}')}
          />
        </Campo>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={enviando}>
          Salvar regra
        </Button>
        {atual && (
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            name="remover"
            value="1"
            disabled={enviando}
          >
            Remover
          </Button>
        )}
      </div>
    </form>
  )
}

export function FormularioFormato({ atual }: { atual: FormatoContabil }) {
  const [estado, acao, enviando] = useActionState<EstadoFormulario, FormData>(formato, {})
  const er = estado.erros ?? {}
  const v = (k: string, padrao: string) => estado.valores?.[k] ?? padrao
  return (
    <form action={acao} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={estado} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="separador" rotulo="Separador">
          <Selecao
            key={v('separador', atual.separador)}
            {...ariaCampo('separador')}
            defaultValue={v('separador', atual.separador)}
          >
            <option value=";">Ponto e vírgula (;)</option>
            <option value=",">Vírgula (,)</option>
            <option value="tab">Tabulação</option>
            <option value="|">Barra vertical (|)</option>
          </Selecao>
        </Campo>
        <Campo id="decimal" rotulo="Separador decimal">
          <Selecao
            key={v('decimal', atual.decimal)}
            {...ariaCampo('decimal')}
            defaultValue={v('decimal', atual.decimal)}
          >
            <option value=",">Vírgula (1234,56)</option>
            <option value=".">Ponto (1234.56)</option>
          </Selecao>
        </Campo>
        <Campo id="formato_data" rotulo="Formato da data">
          <Selecao
            key={v('formato_data', atual.formatoData)}
            {...ariaCampo('formato_data')}
            defaultValue={v('formato_data', atual.formatoData)}
          >
            <option>DD/MM/AAAA</option>
            <option>AAAA-MM-DD</option>
            <option>DDMMAAAA</option>
          </Selecao>
        </Campo>
      </div>
      <Campo
        id="colunas"
        rotulo="Colunas, na ordem"
        ajuda="Entre: data, debito, credito, valor, historico, documento, empreendimento."
        erro={er.colunas}
      >
        <Entrada
          {...ariaCampo('colunas', er.colunas)}
          defaultValue={v('colunas', atual.colunas.join(', '))}
        />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="cabecalho" defaultChecked={atual.cabecalho} />
        Primeira linha com os nomes das colunas
      </label>
      <Button type="submit" variant="outline" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar formato'}
      </Button>
    </form>
  )
}
