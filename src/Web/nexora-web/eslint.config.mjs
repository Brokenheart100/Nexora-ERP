// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Domain component names are intentionally multi-word and panel-specific.
    'vue/multi-word-component-names': 'off',
    // The page renders sibling panels directly under <main>; wrapping them would
    // break the print isolation contract for .financial-reports.
    'vue/no-multiple-template-root': 'off',
  },
})
