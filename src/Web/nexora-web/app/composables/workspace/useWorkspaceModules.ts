import type { Ref } from 'vue'
import type { BillingEntitlements } from '~/utils/billing/billing'
import type { Workspace } from '~/utils/workspace/workspace'
import { moduleAllowed } from '~/utils/billing/billing'

type ModuleId =
  | 'home' | 'dashboard' | 'company' | 'book' | 'reports' | 'aging' | 'partners'
  | 'catalog' | 'inventory' | 'purchasing' | 'sales' | 'receivables' | 'audit' | 'assistant'

interface ConsoleModule {
  id: ModuleId
  label: string
}

export function useWorkspaceModules(selected: Readonly<Ref<Workspace | null | undefined>>) {
  const active = ref<ModuleId>('home')
  const entitlements = ref<BillingEntitlements | null>(null)

  const modules = computed<ConsoleModule[]>(() => {
    const items: ConsoleModule[] = [
      { id: 'home', label: 'workspaces.console.home' },
    ]
    if (!selected.value) return items
    items.push({ id: 'dashboard', label: 'workspaces.console.dashboard' })
    const isPersonal = selected.value.isPersonal
    if (!isPersonal) {
      items.push({ id: 'company', label: 'workspaces.console.company' })
    }
    items.push(
      { id: 'book', label: 'workspaces.console.book' },
      { id: 'reports', label: 'workspaces.console.reports' },
      { id: 'aging', label: 'workspaces.console.aging' },
      { id: 'partners', label: 'workspaces.console.partners' },
      { id: 'catalog', label: 'workspaces.console.catalog' },
      { id: 'inventory', label: 'workspaces.console.inventory' },
    )
    if (!isPersonal) {
      items.push(
        { id: 'purchasing', label: 'workspaces.console.purchasing' },
        { id: 'sales', label: 'workspaces.console.sales' },
        { id: 'receivables', label: 'workspaces.console.receivables' },
        { id: 'audit', label: 'workspaces.console.audit' },
        { id: 'assistant', label: 'workspaces.console.assistant' },
      )
    }
    return items.filter(item => item.id === 'home' || item.id === 'dashboard' || item.id === 'company'
      || moduleAllowed(entitlements.value, item.id))
  })

  watch(() => selected.value?.id, () => {
    active.value = 'home'
  })

  watch(() => selected.value?.id, async (id) => {
    entitlements.value = null
    if (!id || selected.value?.isPersonal) return
    try {
      entitlements.value = await $fetch<BillingEntitlements>('/bff/api/workspaces/' + id + '/billing/entitlements', { retry: 0 })
    } catch { entitlements.value = null }
  }, { immediate: true })

  watch(modules, (items) => {
    if (!items.some(item => item.id === active.value)) active.value = 'home'
  })

  function openModule(id: ModuleId) {
    active.value = id
  }

  return { active, entitlements, modules, openModule }
}
