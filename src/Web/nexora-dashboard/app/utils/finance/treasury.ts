import { compareDecimal } from '#shared/utils/decimal'

export function localBusinessDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function treasuryAmount(input: string, minorUnits: number, signed = false) {
  const value = input.trim()
  if (!/^-?\d{1,13}(?:\.\d{1,6})?$/.test(value)
    || (value.split('.')[1]?.replace(/0+$/, '').length ?? 0) > minorUnits
    || compareDecimal(value, '1000000000000') > 0
    || compareDecimal(value, signed ? '-1000000000000' : '0') < (signed ? 0 : 1))
    throw new Error(signed ? '请输入符合账簿精度的余额。' : '请输入符合账簿精度的正数金额。')
  return value
}

export const tradeKindLabels: Record<number, string> = {
  1: '供应商账单', 2: '供应商付款', 3: '费用', 4: '其他收入', 5: '资金划转', 6: '捐赠', 7: '作废冲销',
  8: '资金期初', 9: '供应商贷项', 10: '供应商退款', 11: '业主投入', 12: '业主提款'
}
