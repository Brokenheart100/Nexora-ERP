<script setup lang="ts" generic="T extends object">
import type { TableColumn } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  columns: TableColumn<T>[]
  /** 键盘/点击整行时触发；点击按钮、输入框等交互元素不会触发。 */
  rowActivate?: (row: T) => void
}>()

const attrs = useAttrs()

function handleRowSelect(event: Event, row: { original: T }) {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="checkbox"]')) return
  props.rowActivate?.(row.original)
}

const tableAttrs = computed(() => (props.rowActivate
  ? { ...attrs, onSelect: handleRowSelect }
  : attrs))

interface ResizableColumn {
  id: string
  getCanResize: () => boolean
}

interface ResizableHeader {
  column: ResizableColumn
  getResizeHandler: () => (event: PointerEvent) => void
}

interface TableApiLike {
  getVisibleLeafColumns: () => ResizableColumn[]
  getHeaderGroups: () => { headers: ResizableHeader[] }[]
}

interface TableRef {
  tableApi?: TableApiLike
}

type ColumnStyle = NonNullable<NonNullable<TableColumn<T>['meta']>['style']>
type CellStyle = NonNullable<ColumnStyle['th'] | ColumnStyle['td']>

const tableRef = useTemplateRef<TableRef>('innerTable')
const columnSizing = ref<Record<string, number>>({})
const hasSizing = computed(() => Object.keys(columnSizing.value).length > 0)

const sizedColumns = computed<TableColumn<T>[]>(() => props.columns.map(applySizing))

function resolveColumnId(column: TableColumn<T>) {
  if (column.id) return column.id
  const accessorKey = (column as { accessorKey?: unknown }).accessorKey
  return typeof accessorKey === 'string' ? accessorKey : undefined
}

function withWidth(style: CellStyle | undefined, width: number): CellStyle {
  if (typeof style === 'string' || typeof style === 'function') return style
  return { ...style, width: width + 'px' }
}

function applySizing(column: TableColumn<T>): TableColumn<T> {
  const id = resolveColumnId(column)
  const width = id ? columnSizing.value[id] : undefined
  if (!width) return column
  const meta = column.meta
  if (meta?.style && typeof meta.style !== 'object') return column
  return {
    ...column,
    meta: {
      ...meta,
      style: {
        ...meta?.style,
        th: withWidth(meta?.style?.th, width),
        td: withWidth(meta?.style?.td, width)
      } as ColumnStyle
    }
  }
}

function seedColumnSizing(root: HTMLElement, api: TableApiLike) {
  const next: Record<string, number> = {}
  const headers = root.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th')
  const columns = api.getVisibleLeafColumns()
  headers.forEach((th, index) => {
    const column = columns[index]
    if (column) next[column.id] = Math.round(th.getBoundingClientRect().width)
  })
  return next
}

function stopResize() {
  document.body.classList.remove('nx-col-resizing')
  document.removeEventListener('mouseup', stopResize)
  window.removeEventListener('blur', stopResize)
}

async function startResize(event: PointerEvent, root: HTMLElement, api: TableApiLike, column: ResizableColumn) {
  document.body.classList.add('nx-col-resizing')
  document.addEventListener('mouseup', stopResize)
  window.addEventListener('blur', stopResize)

  if (!hasSizing.value) {
    const seeded = seedColumnSizing(root, api)
    if (Object.keys(seeded).length) {
      columnSizing.value = seeded
      await nextTick()
    }
  }

  const header = api.getHeaderGroups()[0]?.headers.find(item => item.column.id === column.id)
  header?.getResizeHandler()(event)
}

function onPointerDown(event: PointerEvent) {
  const api = tableRef.value?.tableApi
  if (!api) return

  const target = event.target
  if (!(target instanceof Element)) return

  const th = target.closest<HTMLTableCellElement>('th')
  if (!th || !th.closest('thead')) return
  if (Math.abs(event.clientX - th.getBoundingClientRect().right) > 6) return

  const columns = api.getVisibleLeafColumns()
  const column = columns[th.cellIndex]
  if (!column) return
  if (th.cellIndex >= columns.length - 1) return
  if (!column.getCanResize()) return

  const root = event.currentTarget
  if (!(root instanceof HTMLElement)) return
  void startResize(event, root, api, column)
}
</script>

<template>
  <UTable
    ref="innerTable"
    v-bind="tableAttrs"
    v-model:column-sizing="columnSizing"
    :columns="sizedColumns"
    :column-sizing-options="{ enableColumnResizing: true, columnResizeMode: 'onChange' }"
    class="nx-table-resizable"
    :class="{ 'nx-table-fixed': hasSizing }"
    @pointerdown="onPointerDown"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </UTable>
</template>
