export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'slate',
    },
    alert: {
      defaultVariants: {
        color: 'primary',
        variant: 'subtle',
      },
      slots: {
        root: 'relative overflow-hidden w-full rounded-lg px-3 py-2 flex gap-2',
      },
    },
  },
})
