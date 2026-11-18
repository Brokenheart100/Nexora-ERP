const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const numberFormatter = new Intl.NumberFormat('zh-CN')

export function formatMoney(value: number): string {
  return currencyFormatter.format(value)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function orderTotal(order: { lines: { quantity: number, unitPrice: number }[] }): number {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
}
