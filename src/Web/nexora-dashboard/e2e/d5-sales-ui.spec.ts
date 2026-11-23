import { expect, test } from '@playwright/test'
import { api, baseline, login, write } from './helpers'

test('D5 真实入口从报价草稿走到独立批准，重放仍指向原转单结果', async ({ browser }) => {
  const maker = await browser.newPage()
  const approver = await browser.newPage()
  const workspace = baseline.workspace.id
  const stamp = Date.now().toString(36).toUpperCase()
  const quoteNumber = 'D5-Q-' + stamp
  const orderNumber = 'D5-SO-' + stamp
  const root = `/bff/api/sales/workspaces/${workspace}/orders`

  try {
    await Promise.all([login(maker, 'alice'), login(approver, 'bob')])
    const listBeforeCreate = await api(maker, root + '?isQuote=true&page=1&pageSize=8')
    expect(listBeforeCreate.status, listBeforeCreate.text).toBe(200)
    expect(JSON.parse(listBeforeCreate.text).canCreate).toBe(true)
    await maker.goto(`/sales?tab=quotes&workspace=${workspace}`)
    await maker.getByTestId('quote-new').click()
    await maker.getByTestId('sales-form-number').fill(quoteNumber)
    await maker.getByTestId('sales-form-date').fill('2026-01-03')
    await maker.getByTestId('sales-form-customer').click()
    await maker.getByRole('option', { name: /^D0-CUS / }).click()
    await maker.getByTestId('sales-form-line-item').click()
    await maker.getByRole('option', { name: /^D0-SKU-001 / }).click()
    await maker.getByTestId('sales-form-line-qty').fill('2')
    await maker.getByTestId('sales-form-line-price').fill('10.123456')
    await maker.getByTestId('sales-form-submit').click()
    await expect(maker.getByTestId('quote-detail-status')).toHaveText('已发送')
    await expect(maker.getByTestId('quote-lines')).toContainText('20.25')

    await maker.getByTestId('quote-convert').click()
    await maker.getByTestId('quote-convert-number').fill(orderNumber)
    const conversion = maker.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/convert'))
    await maker.getByTestId('quote-convert-confirm').click()
    const response = await conversion
    expect(response.status()).toBe(201)
    const order = await response.json()
    const command = response.request()
    expect(response.headers().location).toBe(root + '/' + order.id)

    await expect(maker.getByTestId('sales-order-detail-status')).toHaveText('草稿')
    const replay = await write(maker, new URL(command.url()).pathname, 'POST', command.postDataJSON(), {
      'Idempotency-Key': command.headers()['idempotency-key']!, 'If-Match': command.headers()['if-match']!
    })
    expect(replay.status, replay.text).toBe(201)
    expect(JSON.parse(replay.text).id).toBe(order.id)
    const staleId = crypto.randomUUID()
    const stale = await write(maker, new URL(command.url()).pathname, 'POST', {
      ...command.postDataJSON(), operationId: staleId, orderNumber: orderNumber + '-STALE'
    }, { 'Idempotency-Key': staleId, 'If-Match': command.headers()['if-match']! })
    expect(stale.status, stale.text).toBe(412)

    await maker.getByTestId('sales-order-resubmit').click()
    await expect(maker.getByTestId('sales-order-detail-status')).toHaveText('待审批')
    await maker.getByTestId('sales-order-withdraw').click()
    await expect(maker.getByTestId('sales-order-detail-status')).toHaveText('草稿')
    await maker.getByTestId('sales-order-resubmit').click()
    await expect(maker.getByTestId('sales-order-detail-status')).toHaveText('待审批')
    await expect(maker.getByTestId('sales-order-approve')).toBeDisabled()

    await approver.goto(`/sales?workspace=${workspace}&order=${order.id}`)
    await expect(approver.getByTestId('sales-order-detail-status')).toHaveText('待审批')
    await approver.getByTestId('sales-order-approve').click()
    await expect(approver.getByTestId('sales-order-detail-status')).toHaveText('已批准')
    await approver.getByTestId('sales-order-quote-link').click()
    await expect(approver.getByTestId('quote-converted-alert')).toContainText(orderNumber)
    await expect(approver.getByTestId('quote-convert')).toBeDisabled()
    const list = await api(approver, root + '?isQuote=false&pageSize=100')
    expect(list.status, list.text).toBe(200)
    const orders = JSON.parse(list.text).orders as { id: string, number: string, isQuote: boolean }[]
    expect(orders.every(value => !value.isQuote)).toBe(true)
    expect(orders.filter(value => value.number === orderNumber).map(value => value.id)).toEqual([order.id])
    expect((await api(approver, `/bff/api/sales/workspaces/${baseline.isolatedWorkspace.id}/orders/${order.id}`)).status).toBe(404)
  } finally {
    await Promise.all([maker.close(), approver.close()])
  }
})
