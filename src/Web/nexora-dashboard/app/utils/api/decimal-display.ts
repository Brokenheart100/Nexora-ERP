/** Format an authoritative decimal string without losing digits through Number. */
export function displayDecimal(value: string, minorUnits = 2) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return value
  const [whole = '0', fraction = ''] = value.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = fraction.padEnd(minorUnits, '0')
  return grouped + (decimals ? '.' + decimals : '')
}
