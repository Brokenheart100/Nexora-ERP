import { useMockAsync } from './useMockAsync'

/**
 * 模拟列表刷新：延迟后执行回调，期间把 loading 交给骨架屏。
 * 实际数据仍来自 app/mocks；刷新不会向服务器发请求。
 */
export function useMockRefresh(delay = 550) {
  const { loading, run } = useMockAsync(async () => undefined, { delay })

  function runRefresh(after?: () => void) {
    void run().then(() => {
      after?.()
    })
  }

  return { loading, run: runRefresh }
}
