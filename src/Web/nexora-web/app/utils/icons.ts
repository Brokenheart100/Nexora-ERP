export const moduleIcons: Record<string, string> = {
  home: 'i-lucide-house',
  dashboard: 'i-lucide-gauge',
  company: 'i-lucide-building',
  book: 'i-lucide-book-open',
  reports: 'i-lucide-file-spreadsheet',
  aging: 'i-lucide-hourglass',
  partners: 'i-lucide-contact',
  catalog: 'i-lucide-package',
  inventory: 'i-lucide-warehouse',
  purchasing: 'i-lucide-shopping-cart',
  sales: 'i-lucide-truck',
  receivables: 'i-lucide-receipt-text',
  audit: 'i-lucide-shield-check',
  assistant: 'i-lucide-sparkles',
}

export function moduleIcon(id: string): string {
  return moduleIcons[id] ?? 'i-lucide-circle'
}
