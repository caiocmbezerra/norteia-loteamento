import { UFS } from '@norteia/dominio'
import { Campo, Entrada, Selecao, ariaCampo } from '@/components/ui/formulario'

/** Campos do empreendimento com grade automática de lotes (D-008). */
export function CamposEmpreendimento({
  erros = {},
  valores = {},
  mesPadrao,
}: {
  erros?: Record<string, string> | undefined
  valores?: Record<string, string> | undefined
  mesPadrao: string
}) {
  const v = (k: string, padrao = '') => valores[k] ?? padrao
  return (
    <>
      <Campo
        id="nomeEmpreendimento"
        rotulo="Nome do empreendimento"
        erro={erros.nomeEmpreendimento}
      >
        <Entrada
          {...ariaCampo('nomeEmpreendimento', erros.nomeEmpreendimento)}
          defaultValue={v('nomeEmpreendimento')}
          placeholder="Residencial Bela Vista"
          required
        />
      </Campo>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Campo id="municipio" rotulo="Município" erro={erros.municipio}>
          <Entrada
            {...ariaCampo('municipio', erros.municipio)}
            defaultValue={v('municipio')}
            autoComplete="address-level2"
            required
          />
        </Campo>
        <Campo id="uf" rotulo="UF" erro={erros.uf}>
          <Selecao {...ariaCampo('uf', erros.uf)} defaultValue={v('uf')} required>
            <option value="" disabled>
              —
            </option>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Campo
        id="mesBase"
        rotulo="Mês de início do projeto"
        ajuda="Mês 0 do fluxo de caixa: normalmente o mês da compra do terreno."
        erro={erros.mesBase}
      >
        <Entrada
          {...ariaCampo('mesBase', erros.mesBase, 'ajuda')}
          type="month"
          defaultValue={v('mesBase', mesPadrao)}
          required
        />
      </Campo>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Lotes (você ajusta cada um depois)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="quadras" rotulo="Quadras" erro={erros.quadras}>
            <Entrada
              {...ariaCampo('quadras', erros.quadras)}
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              defaultValue={v('quadras', '1')}
              required
            />
          </Campo>
          <Campo id="lotesPorQuadra" rotulo="Lotes por quadra" erro={erros.lotesPorQuadra}>
            <Entrada
              {...ariaCampo('lotesPorQuadra', erros.lotesPorQuadra)}
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              defaultValue={v('lotesPorQuadra', '20')}
              required
            />
          </Campo>
          <Campo id="areaPadrao" rotulo="Área de cada lote (m²)" erro={erros.areaPadrao}>
            <Entrada
              {...ariaCampo('areaPadrao', erros.areaPadrao)}
              inputMode="decimal"
              defaultValue={v('areaPadrao', '300')}
              placeholder="300,00"
              required
            />
          </Campo>
          <Campo id="precoPadrao" rotulo="Preço de cada lote (R$)" erro={erros.precoPadrao}>
            <Entrada
              {...ariaCampo('precoPadrao', erros.precoPadrao)}
              inputMode="decimal"
              defaultValue={v('precoPadrao')}
              placeholder="90.000,00"
            />
          </Campo>
        </div>
      </fieldset>
    </>
  )
}
