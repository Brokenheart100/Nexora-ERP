<script setup lang="ts">
const token = ref('')
const busy = ref(false)
const notice = ref('')
useHead({ title: '下载客户发票', meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex, nofollow' }] })
function clearFragment() {
  const url = new URL(window.location.href)
  if (!url.hash) return
  url.hash = ''
  window.history.replaceState(window.history.state, '', url.href)
}
function readToken() {
  token.value = window.location.hash.slice(1)
  clearFragment()
}
onMounted(() => {
  readToken()
  window.addEventListener('hashchange', readToken)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', readToken))
async function download() {
  if (busy.value) return
  busy.value = true; notice.value = ''
  clearFragment()
  try {
    const response = await fetch('/public/invoice-pdf', { method: 'POST', credentials: 'omit',
      referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.value }) })
    if (!response.ok) throw new Error('Download unavailable')
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = 'invoice.pdf'
    link.click()
    clearFragment()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch { notice.value = '无法下载。请核对链接有效期，或向发票发送人索取新链接。' }
  finally { busy.value = false }
}
</script>

<template>
  <main class="shared-invoice">
    <section class="card">
      <h1><UIcon class="heading-icon" name="i-lucide-file-text" aria-hidden="true" />客户发票</h1>
      <p v-if="!token">请打开完整的发票分享链接。</p>
      <button v-else type="button" class="primary" :disabled="busy" @click="download">下载共享发票 PDF</button>
      <UAlert v-if="notice" role="status" :description="notice" />
    </section>
  </main>
</template>

<style scoped>
.shared-invoice { max-width: 640px; margin: 12vh auto; padding: 0 24px }
</style>
