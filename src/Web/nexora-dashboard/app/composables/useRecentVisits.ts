/**
 * 最近访问的页面：命令面板「最近访问」分组使用，持久化到 localStorage。
 * 只记录应用内固定导航页面，不包含详情抽屉等临时状态。
 */
export interface RecentVisit {
  label: string
  to: string
  icon: string
  at: number
}

export function useRecentVisits() {
  const visits = useLocalStorage<RecentVisit[]>('nexora.recent-visits', [], { initOnMounted: true })

  function recordVisit(visit: Omit<RecentVisit, 'at'>) {
    visits.value = [
      { ...visit, at: Date.now() },
      ...visits.value.filter(item => item.to !== visit.to)
    ].slice(0, 6)
  }

  function clearVisits() {
    visits.value = []
  }

  return { visits, recordVisit, clearVisits }
}
