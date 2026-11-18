import type { Ref } from 'vue'

interface UseMockAsyncOptions {
  delay?: number
  immediate?: boolean
}

/**
 * 模拟异步加载：保留统一的 loading / error / data 形态，延迟后再读取本地 mock。
 * 不发起网络请求；?state=error 或 ?state=forbidden 时返回可演示的错误。
 */
export function useMockAsync<T>(loader: () => T | Promise<T>, options: UseMockAsyncOptions = {}) {
  const { isError, isForbidden } = useMockState()
  const data = ref(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let runId = 0

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    runId += 1
  }

  async function run(): Promise<void> {
    cancel()
    const current = runId
    error.value = null

    if (isForbidden.value) {
      error.value = '当前演示身份没有访问权限'
      return
    }

    loading.value = true
    await new Promise<void>((resolve) => {
      timer = setTimeout(resolve, options.delay ?? 420)
    })
    if (current !== runId) return

    loading.value = false
    if (isError.value) {
      error.value = '模拟加载失败，请重试'
      return
    }

    data.value = await loader()
  }

  onMounted(() => {
    if (options.immediate) void run()
  })
  onBeforeUnmount(cancel)

  return { data, error, loading, run, cancel }
}
