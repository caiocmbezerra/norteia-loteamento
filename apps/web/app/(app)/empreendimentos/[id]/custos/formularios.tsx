'use client'

import type { SugestaoConta } from '@norteia/aplicacao'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alerta, Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'
import type { EstadoFormulario } from '@/lib/acao'
import {
  anexarConta,
  cancelarConta,
  encerrarContrato,
  medir,
  estornar,
  lerDocumentoConta,
  novaConta,
  novoContrato,
  pagar,
  salvarItemOrcamento,
} from './acoes'

type Acao = (estado: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>

/** Identificador único por formulário (dois formulários na mesma página), com o nome do campo preservado. */
function aria(prefixo: string, nome: string, erro?: string, ajuda?: string) {
  return { ...ariaCampo(`${prefixo}-${nome}`, erro, ajuda), name: nome }
}
type Opcao = { valor: string; rotulo: string }

/** Formulário com estado de erros, mensagem de sucesso e limpeza após salvar. */
function useFormulario(acao: Acao) {
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

function Mensagens({ estado }: { estado: EstadoFormulario }) {
  return (
    <>
      {estado.erro && <Alerta>{estado.erro}</Alerta>}
      {estado.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
    </>
  )
}

function Opcoes({ opcoes, vazio }: { opcoes: Opcao[]; vazio?: string }) {
  return (
    <>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </>
  )
}

export function FormularioContrato({
  empreendimentoId,
  fornecedores,
  centros,
}: {
  empreendimentoId: string
  fornecedores: Opcao[]
  centros: Opcao[]
}) {
  const f = useFormulario(novoContrato.bind(null, empreendimentoId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="contrato-fornecedorId" rotulo="Fornecedor" erro={f.er.fornecedorId}>
          <Selecao
            {...aria('contrato', 'fornecedorId', f.er.fornecedorId)}
            defaultValue={f.v('fornecedorId') ?? ''}
          >
            <Opcoes opcoes={fornecedores} vazio="Escolha…" />
          </Selecao>
        </Campo>
        <Campo id="contrato-centro" rotulo="Centro de custo" erro={f.er.centro}>
          <Selecao {...aria('contrato', 'centro', f.er.centro)} defaultValue={f.v('centro') ?? ''}>
            <Opcoes opcoes={centros} vazio="Escolha…" />
          </Selecao>
        </Campo>
      </div>
      <Campo id="contrato-descricao" rotulo="Descrição do contrato" erro={f.er.descricao}>
        <Entrada
          {...aria('contrato', 'descricao', f.er.descricao)}
          defaultValue={f.v('descricao')}
          placeholder="Ex.: Terraplenagem completa"
        />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="contrato-valor" rotulo="Valor (R$)" erro={f.er.valor}>
          <Entrada
            {...aria('contrato', 'valor', f.er.valor)}
            inputMode="decimal"
            defaultValue={f.v('valor')}
            placeholder="500.000,00"
          />
        </Campo>
        <Campo id="contrato-dataInicio" rotulo="Início" erro={f.er.dataInicio}>
          <Entrada
            {...aria('contrato', 'dataInicio', f.er.dataInicio)}
            type="date"
            defaultValue={f.v('dataInicio')}
          />
        </Campo>
        <Campo id="contrato-dataFimPrevista" rotulo="Término previsto" erro={f.er.dataFimPrevista}>
          <Entrada
            {...aria('contrato', 'dataFimPrevista', f.er.dataFimPrevista)}
            type="date"
            defaultValue={f.v('dataFimPrevista')}
          />
        </Campo>
      </div>
      <Button type="submit" disabled={f.enviando || fornecedores.length === 0}>
        {f.enviando ? 'Salvando…' : 'Registrar contrato'}
      </Button>
    </form>
  )
}

export function FormularioConta({
  empreendimentoId,
  contratos,
  centros,
  fornecedores,
}: {
  empreendimentoId: string
  contratos: Opcao[]
  centros: Opcao[]
  fornecedores: Opcao[]
}) {
  const f = useFormulario(novaConta.bind(null, empreendimentoId))
  const [sug, setSug] = useState<SugestaoConta | null>(null)
  const [versao, setVersao] = useState(0)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [lendo, iniciar] = useTransition()
  // O formulário é remontado com a sugestão lida; o arquivo escolhido volta no envio.
  const [arquivo, setArquivo] = useState<File | null>(null)
  useEffect(() => {
    if (f.estado.ok) setArquivo(null)
  }, [f.estado])
  // Valor do formulário: o que o usuário digitou, senão o que veio da leitura do documento.
  const v = (k: keyof SugestaoConta) =>
    f.v(k) ?? (sug?.[k] as string | null | undefined) ?? undefined

  function ler(arq: File) {
    setArquivo(arq)
    setErroLeitura(null)
    iniciar(async () => {
      const bytes = new Uint8Array(await arq.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const r = await lerDocumentoConta({ base64: btoa(bin), tipo: arq.type })
      if (r.erro) setErroLeitura(r.erro)
      if (r.sugestao) {
        setSug(r.sugestao)
        setVersao((n) => n + 1)
      }
    })
  }

  return (
    <form
      key={versao}
      ref={f.ref}
      action={(dados) => {
        const anexo = dados.get('anexo')
        if (arquivo && !(anexo instanceof File && anexo.size > 0)) dados.set('anexo', arquivo)
        f.despachar(dados)
      }}
      className="flex flex-col gap-3"
      noValidate
    >
      <Mensagens estado={f.estado} />
      <Campo
        id="conta-documento"
        rotulo="Ler nota, boleto ou recibo (opcional)"
        ajuda="PDF ou foto, até 10 MB. Os campos são preenchidos para você conferir, e o arquivo fica anexado à conta."
      >
        <Entrada
          id="conta-documento"
          name="anexo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={lendo}
          onChange={(e) => {
            const arq = e.currentTarget.files?.[0]
            if (arq) ler(arq)
          }}
        />
      </Campo>
      {lendo && <Alerta tipo="aviso">Lendo o documento…</Alerta>}
      {erroLeitura && <Alerta>{erroLeitura}</Alerta>}
      {sug && (
        <Alerta tipo="aviso">
          Confira os campos lidos (confiança {sug.confianca}).
          {sug.fornecedorNovo && ` Fornecedor não cadastrado: ${sug.fornecedorNovo}.`}
          {sug.avisos.length > 0 && ` ${sug.avisos.join(' ')}`}
        </Alerta>
      )}
      <Campo
        id="conta-contratoId"
        rotulo="Contrato"
        ajuda="Medição ou nota de um contrato. Sem contrato, escolha o centro de custo."
      >
        <Selecao
          {...aria('conta', 'contratoId', undefined, 'ajuda')}
          defaultValue={f.v('contratoId') ?? ''}
        >
          <Opcoes opcoes={contratos} vazio="Sem contrato (despesa avulsa)" />
        </Selecao>
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="conta-centro" rotulo="Centro de custo (avulsa)" erro={f.er.centro}>
          <Selecao {...aria('conta', 'centro', f.er.centro)} defaultValue={v('centro') ?? ''}>
            <Opcoes opcoes={centros} vazio="—" />
          </Selecao>
        </Campo>
        <Campo id="conta-fornecedorId" rotulo="Fornecedor (avulsa)">
          <Selecao
            id="conta-fornecedorId"
            name="fornecedorId"
            defaultValue={v('fornecedorId') ?? ''}
          >
            <Opcoes opcoes={fornecedores} vazio="—" />
          </Selecao>
        </Campo>
      </div>
      <Campo id="conta-descricao" rotulo="Descrição" erro={f.er.descricao}>
        <Entrada
          {...aria('conta', 'descricao', f.er.descricao)}
          defaultValue={v('descricao')}
          placeholder="Ex.: Medição 1 — março"
        />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="conta-valor" rotulo="Valor (R$)" erro={f.er.valor}>
          <Entrada
            {...aria('conta', 'valor', f.er.valor)}
            inputMode="decimal"
            defaultValue={v('valor')}
          />
        </Campo>
        <Campo id="conta-vencimento" rotulo="Vencimento" erro={f.er.vencimento}>
          <Entrada
            {...aria('conta', 'vencimento', f.er.vencimento)}
            type="date"
            defaultValue={v('vencimento')}
          />
        </Campo>
        <Campo id="conta-documentoNumero" rotulo="Nº da nota (opcional)">
          <Entrada
            id="conta-documentoNumero"
            name="documentoNumero"
            defaultValue={v('documentoNumero')}
          />
        </Campo>
      </div>
      <Button type="submit" disabled={f.enviando}>
        {f.enviando ? 'Salvando…' : 'Registrar conta a pagar'}
      </Button>
    </form>
  )
}

/** Pagamento em linha, numa conta aberta. */
export function FormularioPagar({
  empreendimentoId,
  contaId,
  saldo,
  hoje,
}: {
  empreendimentoId: string
  contaId: string
  saldo: string
  hoje: string
}) {
  const f = useFormulario(pagar.bind(null, empreendimentoId, contaId))
  const id = (k: string) => `${k}-${contaId}`
  return (
    <form action={f.despachar} className="flex flex-wrap items-end gap-2" noValidate>
      <label className="flex flex-col gap-1 text-xs">
        Data
        <Entrada id={id('data')} name="data" type="date" defaultValue={hoje} className="h-9 w-36" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Valor pago
        <Entrada
          id={id('valor')}
          name="valor"
          inputMode="decimal"
          defaultValue={saldo}
          className="h-9 w-32"
        />
      </label>
      <Button type="submit" size="sm" disabled={f.enviando}>
        Pagar
      </Button>
      {(f.estado.erro || Object.values(f.er)[0]) && (
        <p role="alert" className="w-full text-xs text-destructive">
          {Object.values(f.er)[0] ?? f.estado.erro}
        </p>
      )}
    </form>
  )
}

export function FormularioEstorno({
  empreendimentoId,
  pagamentoId,
}: {
  empreendimentoId: string
  pagamentoId: string
}) {
  const f = useFormulario(estornar.bind(null, empreendimentoId, pagamentoId))
  return (
    <form action={f.despachar} className="flex flex-wrap items-end gap-2" noValidate>
      <Entrada
        name="motivo"
        aria-label="Motivo do estorno"
        placeholder="Motivo do estorno"
        className="h-9 w-48"
      />
      <Button type="submit" size="sm" variant="outline" disabled={f.enviando}>
        Estornar
      </Button>
      {(f.estado.erro || f.er.motivo) && (
        <p role="alert" className="w-full text-xs text-destructive">
          {f.er.motivo ?? f.estado.erro}
        </p>
      )}
    </form>
  )
}

export function FormularioItemOrcamento({
  empreendimentoId,
  item,
  centros,
}: {
  empreendimentoId: string
  item?: {
    id: string
    centro: string
    descricao: string
    tipo: string
    valor: string
    mesInicio: number
    mesFim: number
  }
  centros: Opcao[]
}) {
  const f = useFormulario(salvarItemOrcamento.bind(null, empreendimentoId, item?.id ?? null))
  const sufixo = item?.id ?? 'novo'
  return (
    <form
      ref={item ? undefined : f.ref}
      action={f.despachar}
      className="grid grid-cols-2 items-end gap-2 sm:grid-cols-7"
      noValidate
    >
      <Selecao
        name="centro"
        aria-label="Centro de custo"
        defaultValue={item?.centro ?? ''}
        className="col-span-2 h-9"
      >
        <Opcoes opcoes={centros} vazio="Centro…" />
      </Selecao>
      <Entrada
        name="descricao"
        aria-label="Descrição"
        placeholder="Descrição"
        defaultValue={item?.descricao}
        className="col-span-2 h-9"
      />
      <Selecao name="tipo" aria-label="Forma" defaultValue={item?.tipo ?? 'total'} className="h-9">
        <option value="total">Total</option>
        <option value="mensal">Por mês</option>
      </Selecao>
      <Entrada
        name="valor"
        aria-label={`Valor ${sufixo}`}
        inputMode="decimal"
        placeholder="Valor"
        defaultValue={item?.valor}
        className="h-9"
      />
      <div className="flex items-center gap-1">
        <Entrada
          name="mesInicio"
          aria-label="Mês inicial"
          inputMode="numeric"
          defaultValue={item?.mesInicio ?? 0}
          className="h-9"
        />
        <span aria-hidden>a</span>
        <Entrada
          name="mesFim"
          aria-label="Mês final"
          inputMode="numeric"
          defaultValue={item?.mesFim ?? 0}
          className="h-9"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        variant={item ? 'outline' : 'default'}
        disabled={f.enviando}
        className="col-span-2 sm:col-span-7 sm:justify-self-end"
      >
        {item ? 'Salvar' : 'Incluir item'}
      </Button>
      {(f.estado.erro || Object.values(f.er)[0] || f.estado.ok) && (
        <p
          role={f.estado.ok ? 'status' : 'alert'}
          className={`col-span-2 text-xs sm:col-span-7 ${f.estado.ok ? 'text-primary' : 'text-destructive'}`}
        >
          {f.estado.ok ?? Object.values(f.er)[0] ?? f.estado.erro}
        </p>
      )}
    </form>
  )
}

/** Anexar nota, boleto ou recibo a uma conta já registrada. */
export function FormularioAnexo({
  empreendimentoId,
  contaId,
}: {
  empreendimentoId: string
  contaId: string
}) {
  const f = useFormulario(anexarConta.bind(null, empreendimentoId, contaId))
  const id = `anexo-${contaId}`
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-wrap items-end gap-2" noValidate>
      <Mensagens estado={f.estado} />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs text-muted-foreground">
          Anexar nota ou recibo
        </label>
        <input
          id={id}
          name="anexo"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-xs file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1 file:text-xs"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={f.enviando}>
        Anexar
      </Button>
      {f.er.anexo && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {f.er.anexo}
        </p>
      )}
    </form>
  )
}

/** Medição do contrato pelo percentual acumulado executado. */
export function FormularioMedicao({
  empreendimentoId,
  contratoId,
  hoje,
}: {
  empreendimentoId: string
  contratoId: string
  hoje: string
}) {
  const f = useFormulario(medir.bind(null, empreendimentoId, contratoId))
  const p = `medicao-${contratoId}`
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-3" noValidate>
      <Mensagens estado={f.estado} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo
          id={`${p}-percentual`}
          rotulo="Executado acumulado (%)"
          ajuda="Total executado até agora, não só desta medição."
          erro={f.er.percentual}
        >
          <Entrada
            {...aria(p, 'percentual', f.er.percentual, 'ajuda')}
            inputMode="decimal"
            defaultValue={f.v('percentual')}
          />
        </Campo>
        <Campo id={`${p}-data`} rotulo="Data da medição" erro={f.er.data}>
          <Entrada {...aria(p, 'data', f.er.data)} type="date" defaultValue={f.v('data') ?? hoje} />
        </Campo>
        <Campo id={`${p}-vencimento`} rotulo="Vencimento" erro={f.er.vencimento}>
          <Entrada
            {...aria(p, 'vencimento', f.er.vencimento)}
            type="date"
            defaultValue={f.v('vencimento')}
          />
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={`${p}-documento`} rotulo="Nº da nota (opcional)">
          <Entrada id={`${p}-documento`} name="documento" defaultValue={f.v('documento')} />
        </Campo>
        <Campo id={`${p}-observacao`} rotulo="Observação (opcional)">
          <Entrada id={`${p}-observacao`} name="observacao" defaultValue={f.v('observacao')} />
        </Campo>
      </div>
      <Button type="submit" variant="secondary" disabled={f.enviando}>
        {f.enviando ? 'Registrando…' : 'Registrar medição'}
      </Button>
    </form>
  )
}

/** Encerrar contrato, com a explicação do efeito no custo projetado. */
export function FormularioEncerrarContrato({
  empreendimentoId,
  contratoId,
}: {
  empreendimentoId: string
  contratoId: string
}) {
  const f = useFormulario(encerrarContrato.bind(null, empreendimentoId, contratoId))
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-col gap-2" noValidate>
      <Mensagens estado={f.estado} />
      <p className="text-xs text-muted-foreground">
        O saldo ainda não medido deixa de contar como compromisso; as contas já lançadas continuam a
        pagar.
      </p>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={f.enviando}
        className="self-start"
      >
        Confirmar encerramento
      </Button>
    </form>
  )
}

/** Cancelar conta a pagar (sem pagamentos ativos), com motivo. */
export function FormularioCancelarConta({
  empreendimentoId,
  contaId,
}: {
  empreendimentoId: string
  contaId: string
}) {
  const f = useFormulario(cancelarConta.bind(null, empreendimentoId, contaId))
  const id = `cancelar-${contaId}`
  return (
    <form ref={f.ref} action={f.despachar} className="flex flex-wrap items-end gap-2" noValidate>
      <Mensagens estado={f.estado} />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs text-muted-foreground">
          Motivo do cancelamento
        </label>
        <Entrada
          id={id}
          name="motivo"
          className="h-8"
          aria-invalid={f.er.motivo ? true : undefined}
          aria-describedby={f.er.motivo ? `${id}-erro` : undefined}
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={f.enviando}>
        Cancelar conta
      </Button>
      {f.er.motivo && (
        <p id={`${id}-erro`} role="alert" className="basis-full text-xs text-destructive">
          {f.er.motivo}
        </p>
      )}
    </form>
  )
}
