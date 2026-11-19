export interface DateWindow {
  from: string
  through: string
}

export interface MonthWindow extends DateWindow {
  label: string
}

export interface PartnerTotal {
  key: string
  name: string
  count: number
  amount: number
}

const DAY = 86_400_000

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

function formatIso(ms: number) {
  const date = new Date(ms)
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join('-')
}

export function monthWindows(startsOn: string, today: string, months = 6): MonthWindow[] {
  const start = parseIso(startsOn)
  const end = parseIso(today)
  const cursor = new Date(end)
  const windows: MonthWindow[] = []
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const first = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - offset, 1)
    const last = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - offset + 1, 0)
    const from = formatIso(Math.max(first, start))
    const through = formatIso(Math.min(last, end))
    if (from > through) continue
    windows.push({ label: formatIso(first).slice(0, 7), from, through })
  }
  return windows
}

export function previousWindow(startsOn: string, window: DateWindow): DateWindow | null {
  const start = parseIso(startsOn)
  const from = parseIso(window.from)
  const through = parseIso(window.through)
  const previousThrough = from - DAY
  if (previousThrough < start) return null
  return { from: formatIso(Math.max(start, previousThrough - (through - from))), through: formatIso(previousThrough) }
}

export function topPartners(
  items: { partnerId: string | null; partnerName: string | null; outstanding: string }[],
  limit = 5,
): PartnerTotal[] {
  const groups = new Map<string, PartnerTotal>()
  for (const item of items) {
    const key = item.partnerId ?? item.partnerName ?? 'unspecified'
    const group = groups.get(key) ?? { key, name: item.partnerName ?? item.partnerId ?? '未指定往来单位', count: 0, amount: 0 }
    group.count += 1
    group.amount += Number(item.outstanding)
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => right.amount - left.amount).slice(0, limit)
}

export function delta(current: string, previous: string | null | undefined) {
  if (previous === null || previous === undefined) return { previous: null as number | null, difference: null as number | null }
  const before = Number(previous)
  return { previous: before, difference: Number(current) - before }
}

export function barWidth(value: number, max: number) {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) return '0%'
  return Math.max(4, Math.min(100, (value / max) * 100)).toFixed(1) + '%'
}

export function statementCheck(
  overview: { income: string; expense: string; profit: string },
  totals: { key: string; amount: string }[],
) {
  const lookup = new Map(totals.map(total => [total.key, Number(total.amount)]))
  const pairs: [string, string][] = [['income', overview.income], ['expense', overview.expense], ['profit', overview.profit]]
  return pairs.every(([key, amount]) => {
    const reported = lookup.get(key)
    return reported === undefined || Math.abs(reported - Number(amount)) < 0.005
  })
}
