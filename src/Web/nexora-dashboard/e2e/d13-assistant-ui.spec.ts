import { expect, test, type Page } from '@playwright/test'
import { changeBusiness, readBusiness } from './business-actions'
import { api, emailLogin, login, write } from './helpers'
import type { z } from 'zod'
import type { assistantDetailSchema, assistantHistorySchema } from '../shared/types/assistant'
import type { WireWorkspace } from '../shared/types/wire'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const path = (id: string) => '/bff/api/assistant/workspaces/' + id
type History = z.infer<typeof assistantHistorySchema>
type Detail = z.infer<typeof assistantDetailSchema>

async function send(page: Page, workspace: string, prompt: string) {
  await page.getByTestId('live-assistant-prompt').fill(prompt)
  const [response] = await Promise.all([
    page.waitForResponse(result => new URL(result.url()).pathname === path(workspace) + '/runs' && result.request().method() === 'POST'),
    page.getByTestId('live-assistant-send').click()
  ])
  expect(response.status()).toBe(200)
  expect(await response.headerValue('content-type')).toContain('text/event-stream')
}

test('D13 助手流式回执、取消恢复、审批冲突、断线历史与工作区隔离', async ({ page }) => {
  test.setTimeout(180_000)
  const id = crypto.randomUUID().slice(0, 8)
  await login(page)
  const first = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 助手 ' + id }, 201)
  const second = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 分隔 ' + id }, 201)
  await page.goto('/assistant?workspace=' + first.id)
  await expect(page.getByTestId('live-assistant-history')).toBeVisible()

  await send(page, first.id, 'D13 流式 ' + id)
  const messages = page.getByTestId('live-assistant-messages')
  await expect(messages).toContainText('已收到你的请求')
  await expect(page.getByTestId('live-assistant-cancel')).toBeHidden()
  const { sessions } = await readBusiness<History>(page, path(first.id) + '/sessions')
  const conversation = sessions[0]!.id

  await send(page, first.id, 'D13 停止 ' + id)
  await page.getByTestId('live-assistant-cancel').click()
  const resume = page.getByTestId('live-assistant-resume').last()
  await expect(resume).toBeVisible()
  await resume.click()
  await expect(resume).toBeHidden()
  await expect(page.getByTestId('live-assistant-cancel')).toBeHidden()
  const detail = '/sessions/' + conversation
  expect((await readBusiness<Detail>(page, path(first.id) + detail)).session.messages.filter(message => message.role === 'assistant').at(-1)?.status).toBe('complete')

  await send(page, first.id, '添加备注 待拒绝 ' + id)
  await expect(page.getByTestId('live-assistant-reject')).toBeEnabled()
  await page.getByTestId('live-assistant-reject').click()
  await expect(messages).toContainText('工具调用已被拒绝')

  await send(page, first.id, '添加备注 待批准 ' + id)
  await expect(page.getByTestId('live-assistant-approve')).toBeEnabled()
  const next = (await readBusiness<Detail>(page, path(first.id) + detail)).session.messages.find(message => message.status === 'pending_approval')!
  const execution = path(first.id) + '/executions/' + next.id
  const [approved] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === execution + '/approve'),
    page.getByTestId('live-assistant-approve').click()
  ])
  expect(approved.status()).toBe(200)
  expect((await write(page, execution + '/approve', 'POST', {})).status).toBe(409)
  await expect(messages).toContainText('已批准并执行')

  await send(page, first.id, '添加备注 独立请求 ' + id)
  await expect(page.getByTestId('live-assistant-approve')).toBeEnabled()
  const pending = (await readBusiness<Detail>(page, path(first.id) + detail)).session.messages.find(message => message.status === 'pending_approval')!
  const decision = path(first.id) + '/executions/' + pending.id
  const simultaneous = await Promise.all([write(page, decision + '/approve', 'POST', {}), write(page, decision + '/reject', 'POST', {})])
  expect(simultaneous.map(item => item.status).sort()).toEqual([200, 409])
  await page.getByTestId('live-assistant-refresh').click()
  await expect(page.getByTestId('live-assistant-approve')).toBeHidden()

  await send(page, first.id, 'D13 断线恢复 ' + id)
  await page.reload()
  await page.getByTestId('live-assistant-session-' + conversation).click()
  await expect(messages).toContainText('D13 断线恢复 ' + id)
  await expect.poll(async () => (await readBusiness<Detail>(page, path(first.id) + detail)).session.messages.filter(message => message.role === 'assistant').at(-1)?.status).toMatch(/^(canceled|complete)$/)

  await page.goto('/assistant?workspace=' + second.id)
  await expect(page.getByTestId('live-assistant-history')).toContainText('当前工作区暂无会话记录')
  await expect(messages).toHaveCount(0)
  expect((await api(page, path(second.id) + detail)).status).toBe(404)

  const outsider = crypto.randomUUID()
  expect((await api(page, path(outsider) + '/capabilities')).status).toBe(404)
})

test('D13 助手读取与发送受套餐权益限制', async ({ page }) => {
  const owner = 'd13-plan-' + crypto.randomUUID().slice(0, 8)
  await emailLogin(page, owner + '@example.invalid', true)
  await expect(page.getByTestId('user-menu-trigger')).toHaveAttribute('aria-label', new RegExp(owner))
  const workspace = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 套餐 ' + owner }, 201)
  const root = path(workspace.id)
  expect((await api(page, root + '/capabilities')).status).toBe(200)
  await changeBusiness(page, '/bff/api/workspaces/' + workspace.id + '/billing/subscription', { planCode: 'free' })
  const restricted = await api(page, root + '/capabilities')
  expect(restricted.status).toBe(403)
  expect(restricted.text).toContain('module.not_in_plan')
  expect((await write(page, root + '/runs', 'POST', { message: 'D13 套餐限制' })).status).toBe(403)
  await page.goto('/assistant?workspace=' + workspace.id)
  await expect(page.getByTestId('live-assistant-unavailable')).toContainText('当前套餐未包含工作区助手')
  await expect(page.getByTestId('live-assistant-send')).toHaveCount(0)
})
