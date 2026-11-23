// @vitest-environment node
import { expect, it } from 'vitest'
import { displayDecimal } from '../app/utils/api/decimal-display'
import { divideDecimal } from '../shared/utils/decimal'

it('D4 displays wire decimals without converting through a floating point number', () => {
  expect(displayDecimal('9007199254740993.000001', 2)).toBe('9,007,199,254,740,993.000001')
  expect(displayDecimal('1130', 2)).toBe('1,130.00')
  expect(displayDecimal('-600', 2)).toBe('-600.00')
  expect(displayDecimal('5', 0)).toBe('5')
  expect(displayDecimal('待复核', 2)).toBe('待复核')
})

it('D4 fixture cost ratios round exactly using the existing away-from-zero policy', () => {
  expect(divideDecimal('1000', '100', 6)).toBe('10')
  expect(divideDecimal('1', '3', 6)).toBe('0.333333')
  expect(divideDecimal('1.005', '1', 2)).toBe('1.01')
  expect(divideDecimal('-1.005', '1', 2)).toBe('-1.01')
  expect(divideDecimal('9007199254740993.000001', '1', 6)).toBe('9007199254740993.000001')
  expect(() => divideDecimal('1', '0', 6)).toThrow()
})
