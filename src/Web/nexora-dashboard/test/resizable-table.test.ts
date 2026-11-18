import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { TableColumn } from '@nuxt/ui'
import ResizableTable from '../app/components/ResizableTable.vue'

interface Row {
  sku: string
  name: string
}

const columns: TableColumn<Row>[] = [
  { accessorKey: 'sku', header: 'SKU' },
  { accessorKey: 'name', header: '名称' }
]

const rows: Row[] = [
  { sku: 'SKU-001', name: '测试商品' }
]

describe('ResizableTable', () => {
  it('renders the table with the resizable wrapper class', async () => {
    const wrapper = await mountSuspended(ResizableTable, {
      props: { columns, data: rows },
      attrs: { 'data-testid': 'resizable-table' }
    })

    const table = wrapper.get('[data-testid="resizable-table"]')
    expect(table.classes()).toContain('nx-table-resizable')
    expect(wrapper.findAll('th').map(th => th.text())).toEqual(['SKU', '名称'])
    expect(wrapper.text()).toContain('SKU-001')
    expect(wrapper.text()).toContain('测试商品')
  })
})
