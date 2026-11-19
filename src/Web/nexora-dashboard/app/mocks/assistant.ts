import type { Permission } from './types'

export type AssistantMessageStatus = 'complete' | 'streaming' | 'cancelled'
export type AssistantToolStatus = 'pending' | 'approved' | 'denied'

export interface AssistantCapability {
  id: string
  label: string
  detail: string
  icon: string
  permission?: Permission
  financeOnly?: boolean
}

export interface AssistantToolLink {
  label: string
  to: string
}

export interface AssistantTool {
  id: string
  name: string
  title: string
  purpose: string
  arguments: string
  scope: string
  status: AssistantToolStatus
  resultLines?: string[]
  links?: AssistantToolLink[]
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  status: AssistantMessageStatus
  at: string
  tool?: AssistantTool
}

export interface AssistantSession {
  id: string
  title: string
  updatedAt: string
  messages: AssistantMessage[]
}

export interface AssistantReply {
  text: string
  tool?: AssistantTool
}

export const assistantSuggestions = [
  { key: 'balances', label: '查询本期科目余额', prompt: '查询 2026-11 本期科目余额，并标出尚未关联业务凭证的科目。' },
  { key: 'aging', label: '复核应付账龄', prompt: '复核 2026-11-18 的应付账龄，列出 30 天内与 31–90 天的金额。' },
  { key: 'summary', label: '生成本月经营摘要', prompt: '生成本月经营摘要，并说明数据截止日期。' }
]

export const assistantCapabilities: AssistantCapability[] = [
  { id: 'balances', label: '余额与往来', detail: '读取科目余额、应收应付汇总', icon: 'i-carbon-calculator', permission: 'finance.view', financeOnly: true },
  { id: 'aging', label: '账龄与报表', detail: '读取账龄快照与四表区间数', icon: 'i-carbon-chart-line', permission: 'finance.view', financeOnly: true },
  { id: 'vouchers', label: '凭证与总账', detail: '检索凭证并跳转总账', icon: 'i-carbon-document', permission: 'finance.view', financeOnly: true },
  { id: 'catalog', label: '目录与伙伴', detail: '读取商品、客户与供应商档案', icon: 'i-carbon-catalog', permission: 'catalog.view' }
]

export const assistantSessions: AssistantSession[] = [
  {
    id: 'as-balances',
    title: '核对本期科目余额',
    updatedAt: '2026-11-19 16:22',
    messages: [
      {
        id: 'msg-b-1',
        role: 'user',
        content: '核对 2026-11 的科目余额，并标出尚未关联业务凭证的科目。',
        status: 'complete',
        at: '2026-11-19 16:20'
      },
      {
        id: 'msg-b-2',
        role: 'assistant',
        content: '已读取 2026-11 本期余额：库存现金 8,600.00 元、银行存款 471,770.50 元、应收账款 355,340.00 元。发现 1 个科目缺少业务关联：1003 备用金。读取明细前需要你确认一次只读工具调用。',
        status: 'complete',
        at: '2026-11-19 16:21'
      },
      {
        id: 'msg-b-3',
        role: 'tool',
        content: '',
        status: 'complete',
        at: '2026-11-19 16:22',
        tool: {
          id: 'tool-balances',
          name: 'finance.read_account_balances',
          title: '读取科目余额',
          purpose: '读取 2026-11 科目余额与业务关联状态，用于回答当前问题。',
          arguments: 'period=2026-11; includeUnlinked=true; limit=20',
          scope: '财务只读 · 华东总部 · 科目余额与关联标记',
          status: 'pending'
        }
      }
    ]
  },
  {
    id: 'as-aging',
    title: '应付账龄复核',
    updatedAt: '2026-11-18 15:08',
    messages: [
      {
        id: 'msg-a-1',
        role: 'user',
        content: '列出 2026-11-18 的应付账龄，并核对供应商账单是否已过账。',
        status: 'complete',
        at: '2026-11-18 15:06'
      },
      {
        id: 'msg-a-2',
        role: 'assistant',
        content: '应付合计 320,770.00 元，其中 30 天内 182,400.00 元、31–60 天 96,200.00 元、61–90 天 42,170.00 元。下一步需要读取账龄明细与账单过账状态。',
        status: 'complete',
        at: '2026-11-18 15:07'
      },
      {
        id: 'msg-a-3',
        role: 'tool',
        content: '',
        status: 'complete',
        at: '2026-11-18 15:08',
        tool: {
          id: 'tool-aging',
          name: 'finance.read_aging',
          title: '读取应付账龄明细',
          purpose: '读取应付账龄分桶、供应商账单状态与到期日，用于复核。',
          arguments: 'asOf=2026-11-18; side=payable; includeBillStatus=true',
          scope: '财务只读 · 华东总部 · 应付账龄与账单状态',
          status: 'pending'
        }
      }
    ]
  },
  {
    id: 'as-summary',
    title: '本月经营摘要',
    updatedAt: '2026-11-17 18:40',
    messages: [
      {
        id: 'msg-s-1',
        role: 'user',
        content: '生成本月经营摘要，并说明数据截止日期。',
        status: 'complete',
        at: '2026-11-17 18:38'
      },
      {
        id: 'msg-s-2',
        role: 'assistant',
        content: '截至 2026-11-18，本月营业收入 728,960.00 元，营业成本 477,473.00 元，营业利润 86,020.00 元，净利润 73,117.00 元。应收账款 355,340.00 元，应付账款 320,770.00 元。数据来自 W-142 工作台投影。',
        status: 'complete',
        at: '2026-11-17 18:40'
      }
    ]
  }
]

export const assistantReplies: Record<string, AssistantReply> = {
  balances: {
    text: '已读取 2026-11 科目余额：库存现金 8,600.00 元、银行存款 471,770.50 元、应收账款 355,340.00 元。1003 备用金未关联业务凭证。需要确认只读工具调用后展示明细。',
    tool: {
      id: 'tool-balances-live',
      name: 'finance.read_account_balances',
      title: '读取科目余额',
      purpose: '读取 2026-11 科目余额与业务关联状态，用于回答当前问题。',
      arguments: 'period=2026-11; includeUnlinked=true; limit=20',
      scope: '财务只读 · 华东总部 · 科目余额与关联标记',
      status: 'pending'
    }
  },
  aging: {
    text: '应付账龄截至 2026-11-18 合计 320,770.00 元：30 天内 182,400.00 元、31–60 天 96,200.00 元、61–90 天 42,170.00 元。读取账单明细前需要审批只读工具。',
    tool: {
      id: 'tool-aging-live',
      name: 'finance.read_aging',
      title: '读取应付账龄明细',
      purpose: '读取应付账龄分桶、供应商账单状态与到期日，用于复核。',
      arguments: 'asOf=2026-11-18; side=payable; includeBillStatus=true',
      scope: '财务只读 · 华东总部 · 应付账龄与账单状态',
      status: 'pending'
    }
  },
  summary: {
    text: '截至 2026-11-18，本月营业收入 728,960.00 元，营业成本 477,473.00 元，营业利润 86,020.00 元，净利润 73,117.00 元。应收账款 355,340.00 元，应付账款 320,770.00 元。数据来自 W-142 工作台投影，未读取外部模型。'
  }
}

export function assistantToolResult(tool: AssistantTool): { lines: string[], links: AssistantToolLink[] } {
  if (tool.name === 'finance.read_aging') {
    return {
      lines: [
        '30 天内 · 182,400.00 元 · 8 张账单',
        '31–60 天 · 96,200.00 元 · 4 张账单',
        '61–90 天 · 42,170.00 元 · 2 张账单',
        '其中 1 张供应商账单仍为待复核状态'
      ],
      links: [
        { label: '打开采购应付', to: '/finance?tab=payables' },
        { label: '查看账龄与税务', to: '/finance?tab=aging' }
      ]
    }
  }
  return {
    lines: [
      '1001 库存现金 · 8,600.00 元',
      '1002 银行存款 · 471,770.50 元',
      '1122 应收账款 · 355,340.00 元',
      '1003 备用金 · 0.00 元 · 未关联业务凭证'
    ],
    links: [
      { label: '打开科目表', to: '/finance?tab=accounts' },
      { label: '查看总账', to: '/finance?tab=journals' },
      { label: '报表中心', to: '/finance?tab=reporting' }
    ]
  }
}

export const assistantStatusLabels: Record<AssistantMessageStatus, string> = {
  complete: '已完成',
  streaming: '生成中',
  cancelled: '已取消'
}

export const assistantToolStatusLabels: Record<AssistantToolStatus, string> = {
  pending: '等待审批',
  approved: '已允许',
  denied: '已拒绝'
}
