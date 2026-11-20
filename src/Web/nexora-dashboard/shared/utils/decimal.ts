function parts(value: string) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('十进制字符串无效。')
  const [integer = '0', fraction = ''] = value.split('.')
  return { units: BigInt(integer + fraction), scale: fraction.length }
}
function align(left: string, right: string) {
  const a = parts(left)
  const b = parts(right)
  const scale = Math.max(a.scale, b.scale)
  return { a: a.units * BigInt(10) ** BigInt(scale - a.scale), b: b.units * BigInt(10) ** BigInt(scale - b.scale), scale }
}
function text(units: bigint, scale: number) {
  const negative = units < BigInt(0)
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0')
  const value = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '') : digits
  return (negative && units !== BigInt(0) ? '-' : '') + value
}
export function subtractDecimal(left: string, right: string) {
  const value = align(left, right)
  return text(value.a - value.b, value.scale)
}
export function sumDecimals(values: string[]) {
  return values.reduce((total, value) => subtractDecimal(total, value.startsWith('-') ? value.slice(1) : '-' + value), '0')
}
export function compareDecimal(left: string, right: string) {
  const value = align(left, right)
  return value.a < value.b ? -1 : value.a > value.b ? 1 : 0
}
export function multiplyDecimals(left: string, right: string) {
  const a = parts(left)
  const b = parts(right)
  return text(a.units * b.units, a.scale + b.scale)
}
export function roundDecimal(value: string, minorUnits: number) {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0 || minorUnits > 28) throw new Error('币种精度无效。')
  const amount = parts(value)
  if (amount.scale <= minorUnits) return value
  const factor = BigInt(10) ** BigInt(amount.scale - minorUnits)
  const negative = amount.units < BigInt(0)
  const absolute = negative ? -amount.units : amount.units
  const rounded = absolute / factor + (absolute % factor * BigInt(2) >= factor ? BigInt(1) : BigInt(0))
  return text(negative ? -rounded : rounded, minorUnits)
}
