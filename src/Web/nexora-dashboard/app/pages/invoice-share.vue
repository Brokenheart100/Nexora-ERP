<script setup lang="ts">
import { invoiceShareTokenSchema } from '#shared/types/invoicing'
import { requireInvoicePdf, saveInvoicePdf } from '~/utils/sales/invoice-pdf'

definePageMeta({ layout: false, scrollToTop: false })
useHead({ title: '下载发票 PDF · Nexora', meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex, nofollow' }] })

const token = shallowRef('')
const loading = ref(false)
const message = ref('')
const router = useRouter()
let request: AbortController | null = null
function readLink() {
  const fragments = new URLSearchParams(location.hash.slice(1))
  const values = fragments.getAll('token')
  if (location.hash || location.search) {
    const path = location.pathname
    history.replaceState(history.state, '', path)
    void router.replace(path)
  }
  request?.abort()
  request = null
  loading.value = false
  const parsed = invoiceShareTokenSchema.safeParse(values.length === 1 ? values[0] : undefined)
  token.value = parsed.success ? parsed.data : ''
  message.value = parsed.success ? '' : '此发票链接不可用。'
}
onMounted(() => {
  readLink()
  window.addEventListener('hashchange', readLink)
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', readLink)
  request?.abort()
  token.value = ''
})

async function download() {
  if (!token.value || loading.value) return
  const controller = new AbortController()
  request = controller
  loading.value = true
  message.value = ''
  try {
    const response = await fetch('/public/invoice-pdf', {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/pdf' },
      body: JSON.stringify({ token: token.value }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)])
    })
    if (response.status === 404 || response.status === 410) {
      token.value = ''
      message.value = '此发票链接已失效。'
    } else if (response.status === 429) {
      message.value = '下载请求较多，请稍后再试。'
    } else if (response.ok) {
      saveInvoicePdf(await requireInvoicePdf(await response.blob()))
    } else throw new Error('Download unavailable')
  } catch {
    if (!controller.signal.aborted) message.value = '暂时无法下载发票，请重试。'
  } finally {
    if (request === controller) {
      request = null
      loading.value = false
    }
  }
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-default p-4">
    <UCard class="w-full max-w-md rounded-sm">
      <template #header>
        <h1 class="text-lg font-semibold text-highlighted">下载发票 PDF</h1>
      </template>
      <UAlert v-if="message" color="warning" variant="soft" :title="message" data-testid="public-invoice-status" />
      <UButton v-if="token" class="mt-3" icon="i-carbon-download" label="下载 PDF" :loading="loading"
        data-testid="public-invoice-download" @click="download" />
    </UCard>
  </main>
</template>
