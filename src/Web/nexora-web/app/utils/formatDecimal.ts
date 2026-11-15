export function formatDecimal(value: string, minorUnits: number) {
  const [whole, fraction = ''] = value.split('.')
  return minorUnits === 0 ? whole : `${whole}.${fraction.padEnd(minorUnits, '0')}`
}
