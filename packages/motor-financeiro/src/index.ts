// Motor financeiro puro (docs/arquitetura.md §5). Sem acesso a banco, rede ou relógio.
export { type Arredondamento, Decimal, type ValorDecimal } from './decimal'
export {
  type Centavos,
  ErroDinheiro,
  ZERO,
  arredondarCentavos,
  centavos,
  deReais,
  emReais,
  negar,
  somar,
  subtrair,
} from './dinheiro'
