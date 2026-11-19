export const localeOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' }
]

export function useLocaleSwitch() {
  const { locale, setLocale } = useI18n()

  function changeLocale(value: string) {
    if ((value !== 'zh-CN' && value !== 'en') || value === locale.value) return
    void setLocale(value)
  }

  const localeModel = computed({
    get: () => locale.value,
    set: changeLocale
  })

  return { locale, localeModel, localeOptions, changeLocale }
}
