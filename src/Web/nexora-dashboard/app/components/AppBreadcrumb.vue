<script setup lang="ts">
interface Crumb {
  label: string
  to?: string
  icon?: string
}

const props = defineProps<{
  current: string
  parent?: string
  detail?: string
}>()

const items = computed<Crumb[]>(() => {
  const list: Crumb[] = [{ label: '工作台', to: '/', icon: 'i-carbon-dashboard' }]
  if (props.parent) list.push({ label: props.parent })
  list.push({ label: props.current })
  if (props.detail) list.push({ label: props.detail })
  return list
})
</script>

<template>
  <UBreadcrumb
    :items="items"
    class="text-xs"
    :ui="{ link: 'text-xs', linkLabel: 'text-xs' }"
    data-testid="page-breadcrumb"
  />
</template>
