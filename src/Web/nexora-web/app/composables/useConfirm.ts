import ConfirmDialog from '~/components/ConfirmDialog.vue'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'primary' | 'error'
}

/**
 * Programmatic confirmation dialog backed by Nuxt UI's overlay stack.
 * Returns a promise that resolves true only when the user confirms; dismissing
 * with Escape or the overlay resolves false.
 */
export function useConfirm() {
  const overlay = useOverlay()
  return {
    confirm: (options: ConfirmOptions) =>
      overlay.create(ConfirmDialog, { destroyOnClose: true }).open(options) as unknown as Promise<boolean>,
  }
}
