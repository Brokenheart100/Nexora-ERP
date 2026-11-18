import { defineStore } from 'pinia'

export type SetupStepId = 'company' | 'fiscal' | 'accounts' | 'tax'
export type ChartTemplateId = 'standard' | 'retail' | 'service'
export type TaxRegimeId = 'general' | 'small' | 'none'

export const setupStepIds: SetupStepId[] = ['company', 'fiscal', 'accounts', 'tax']

export const chartTemplateOptions: Array<{
  id: ChartTemplateId
  name: string
  description: string
  accountCount: number
  samples: string[]
}> = [
  {
    id: 'standard',
    name: '标准企业科目表',
    description: '适用于一般工商企业，包含往来、存货、费用与损益科目。',
    accountCount: 42,
    samples: ['1001 库存现金', '1122 应收账款', '1405 库存商品', '2202 应付账款', '6001 主营业务收入']
  },
  {
    id: 'retail',
    name: '商贸流通科目表',
    description: '增加门店结算、商品损耗与促销费用科目，适合零售与批发。',
    accountCount: 36,
    samples: ['1001 库存现金', '1122 应收账款', '1405 库存商品', '2202 应付账款', '6401 主营业务成本']
  },
  {
    id: 'service',
    name: '服务企业科目表',
    description: '不启用存货与生产成本，保留项目收入、人工与外购服务科目。',
    accountCount: 28,
    samples: ['1001 库存现金', '1122 应收账款', '2202 应付账款', '6001 主营业务收入', '6602 管理费用']
  }
]

export const taxRegimeOptions: Array<{
  id: TaxRegimeId
  name: string
  description: string
  detail: string
}> = [
  {
    id: 'general',
    name: '一般纳税人',
    description: '按 13% / 9% / 6% 计算增值税，可抵扣进项税额。',
    detail: '默认启用销项与进项税码，发票与账单自动价税分离。'
  },
  {
    id: 'small',
    name: '小规模纳税人',
    description: '按 3% 征收率简化计税，不抵扣进项税额。',
    detail: '适合年销售额未超过标准的商贸或服务企业。'
  },
  {
    id: 'none',
    name: '暂不启用税制',
    description: '只做内部核算与往来管理，不生成税务申报数据。',
    detail: '稍后可在定义维护中启用税码并补充税务期间。'
  }
]

function nowStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

/**
 * C4 工作区初始化向导的会话内状态。
 * 完成后只影响本地演示，不写入后端或创建真实账套。
 */
export const useWorkspaceSetupStore = defineStore('workspace-setup', () => {
  const completedSteps = ref<SetupStepId[]>([])
  const deferredAt = ref('')
  const completedAt = ref('')
  const fiscalYearStart = ref('2026-01-01')
  const fiscalYearEnd = ref('2026-12-31')
  const openingDate = ref('2026-01-01')
  const openingConfirmed = ref(false)
  const chartTemplate = ref<ChartTemplateId>('standard')
  const taxRegime = ref<TaxRegimeId>('general')

  const progress = computed(() => Math.round((completedSteps.value.length / setupStepIds.length) * 100))
  const nextStep = computed<SetupStepId | null>(
    () => setupStepIds.find(step => !completedSteps.value.includes(step)) ?? null
  )
  const isComplete = computed(() => completedSteps.value.length === setupStepIds.length)

  function markStep(step: SetupStepId) {
    if (!completedSteps.value.includes(step)) completedSteps.value.push(step)
    deferredAt.value = ''
  }

  function setFiscal(input: {
    fiscalYearStart: string
    fiscalYearEnd: string
    openingDate: string
    openingConfirmed: boolean
  }) {
    fiscalYearStart.value = input.fiscalYearStart
    fiscalYearEnd.value = input.fiscalYearEnd
    openingDate.value = input.openingDate
    openingConfirmed.value = input.openingConfirmed
    markStep('fiscal')
  }

  function setAccounts(template: ChartTemplateId) {
    chartTemplate.value = template
    markStep('accounts')
  }

  function setTax(regime: TaxRegimeId) {
    taxRegime.value = regime
    markStep('tax')
  }

  function defer() {
    deferredAt.value = nowStamp()
  }

  function complete() {
    for (const step of setupStepIds) {
      if (!completedSteps.value.includes(step)) completedSteps.value.push(step)
    }
    completedAt.value = nowStamp()
    deferredAt.value = ''
  }

  function reset() {
    completedSteps.value = []
    deferredAt.value = ''
    completedAt.value = ''
    fiscalYearStart.value = '2026-01-01'
    fiscalYearEnd.value = '2026-12-31'
    openingDate.value = '2026-01-01'
    openingConfirmed.value = false
    chartTemplate.value = 'standard'
    taxRegime.value = 'general'
  }

  return {
    completedSteps,
    deferredAt,
    completedAt,
    fiscalYearStart,
    fiscalYearEnd,
    openingDate,
    openingConfirmed,
    chartTemplate,
    taxRegime,
    progress,
    nextStep,
    isComplete,
    markStep,
    setFiscal,
    setAccounts,
    setTax,
    defer,
    complete,
    reset
  }
})
