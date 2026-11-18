import type { ComputedRef, Ref } from 'vue'

export function useClientPagination<T>(rows: Ref<T[]> | ComputedRef<T[]>, pageSize: number) {
  const page = ref(1)
  const total = computed(() => rows.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
  const pageRows = computed(() => {
    const start = (page.value - 1) * pageSize
    return rows.value.slice(start, start + pageSize)
  })
  const pageStart = computed(() => (total.value ? (page.value - 1) * pageSize + 1 : 0))
  const pageEnd = computed(() => Math.min(page.value * pageSize, total.value))

  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })

  function resetPage() {
    page.value = 1
  }

  return { page, total, pageCount, pageRows, pageStart, pageEnd, resetPage }
}
