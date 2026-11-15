type NoticeTone = 'success' | 'info' | 'warning' | 'error'

const toneConfig: Record<NoticeTone, { color: NoticeTone; icon: string }> = {
  success: { color: 'success', icon: 'i-lucide-circle-check' },
  info: { color: 'info', icon: 'i-lucide-info' },
  warning: { color: 'warning', icon: 'i-lucide-triangle-alert' },
  error: { color: 'error', icon: 'i-lucide-circle-alert' },
}

/**
 * Thin wrapper over Nuxt UI's useToast so transient feedback has one voice:
 * consistent color/icon/duration and a stable API for panels that used to keep
 * ad-hoc `notice` refs. Persistent states (empty results, access warnings)
 * still belong in the page, not in a toast.
 */
export function useNotice() {
  const toast = useToast()

  function notify(message: string, tone: NoticeTone = 'success', title?: string) {
    const config = toneConfig[tone]
    toast.add({
      title: title ?? message,
      description: title ? message : undefined,
      color: config.color,
      icon: config.icon,
      duration: tone === 'error' ? 8000 : 4000,
    })
  }

  return {
    notify,
    success: (message: string) => notify(message, 'success'),
    info: (message: string) => notify(message, 'info'),
    warning: (message: string) => notify(message, 'warning'),
    error: (message: string) => notify(message, 'error'),
  }
}
