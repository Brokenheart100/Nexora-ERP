import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useClientPagination } from '../app/composables/useClientPagination'

describe('useClientPagination', () => {
  it('slices rows and reports the visible range', () => {
    const rows = ref(Array.from({ length: 17 }, (_, index) => index + 1))
    const pager = useClientPagination(rows, 8)

    expect(pager.pageCount.value).toBe(3)
    expect(pager.pageRows.value).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(pager.pageStart.value).toBe(1)
    expect(pager.pageEnd.value).toBe(8)

    pager.page.value = 3
    expect(pager.pageRows.value).toEqual([17])
    expect(pager.pageStart.value).toBe(17)
    expect(pager.pageEnd.value).toBe(17)
  })

  it('clamps the page when rows shrink and resets explicitly', async () => {
    const rows = ref(Array.from({ length: 17 }, (_, index) => index + 1))
    const pager = useClientPagination(rows, 8)

    pager.page.value = 3
    rows.value = rows.value.slice(0, 3)
    await nextTick()

    expect(pager.pageCount.value).toBe(1)
    expect(pager.page.value).toBe(1)
    expect(pager.pageStart.value).toBe(1)
    expect(pager.pageEnd.value).toBe(3)

    pager.page.value = 2
    pager.resetPage()
    expect(pager.page.value).toBe(1)
  })

  it('returns an empty range when there are no rows', () => {
    const rows = ref<number[]>([])
    const pager = useClientPagination(rows, 8)

    expect(pager.pageCount.value).toBe(1)
    expect(pager.pageRows.value).toEqual([])
    expect(pager.pageStart.value).toBe(0)
    expect(pager.pageEnd.value).toBe(0)
  })
})
