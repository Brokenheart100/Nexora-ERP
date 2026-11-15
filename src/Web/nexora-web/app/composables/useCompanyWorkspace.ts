export function useCompanyWorkspace() {
  const route = useRoute()
  const store = useWorkspaceStore()
  const ready = ref(false)
  const workspace = computed(() => store.workspaces.find(item =>
    item.id === route.params.workspaceId && !item.isPersonal))

  onMounted(async () => {
    await store.load()
    ready.value = true
  })

  watch(workspace, (company) => {
    if (company && store.selected?.id !== company.id) void store.select(company)
  }, { immediate: true })

  return { ready, workspace }
}
