'use strict'

function reconcileRestored(psql, databases, workspaceId) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workspaceId))
    throw new Error('The reconciliation workspace must be a UUID.')
  const workspace = "'" + workspaceId + "'::uuid"
  const finance = databases.financedb
  const inventory = databases.inventorydb
  const shape = psql(finance, `
    select count(*)
    from finance.trade_setup t join finance.receivable_setup r using ("WorkspaceId", "TenantId")
    where t."WorkspaceId" = ${workspace}
  `)
  if (shape !== '1') throw new Error('Use a restored business workspace with trade and receivables configured.')

  const controls = psql(finance, `
    with scoped as (
      select l."AccountId", l."Debit" - l."Credit" as amount
      from finance.journal_lines l join finance.journals j on j."Id" = l."JournalId"
      join finance.books b on b."TenantId" = j."TenantId" and b."WorkspaceId" = j."WorkspaceId"
      where b."WorkspaceId" = ${workspace} and j."State" = 3
    ), accounts as (
      select t."InventoryAccountId" inventory, t."PayableAccountId" payable,
          t."SupplierRecoveryAccountId" recovery,
          (r."Accounts"->>'ReceivableAccountId')::uuid receivable, (r."Accounts"->>'AdvanceAccountId')::uuid advance
      from finance.trade_setup t join finance.receivable_setup r using ("WorkspaceId", "TenantId")
      where t."WorkspaceId" = ${workspace}
    )
    select trim_scale(coalesce(sum(amount) filter (where "AccountId" = inventory), 0)),
           trim_scale(coalesce(sum(-amount) filter (where "AccountId" = payable), 0)),
           trim_scale(coalesce(sum(amount) filter (where "AccountId" = recovery), 0)),
           trim_scale(coalesce(sum(amount) filter (where "AccountId" = receivable), 0)),
           trim_scale(coalesce(sum(-amount) filter (where "AccountId" = advance), 0)),
           trim_scale(coalesce(sum(amount), 0))
    from scoped cross join accounts
  `).split('|')
  const inventoryValue = psql(inventory, `
    select trim_scale(coalesce(sum(p."Value"), 0))
    from inventory.cost_pools p where p."WorkspaceId" = ${workspace}
  `)
  const suppliers = psql(finance, `
    select trim_scale(coalesce(sum("Outstanding") filter (where "Terms"->>'Kind' = '1'), 0)),
           trim_scale(coalesce(sum("Recoverable") filter (where "Terms"->>'Kind' = '9'), 0))
    from finance.trade_documents where "WorkspaceId" = ${workspace} and "State" = 2
  `).split('|')
  const customers = psql(finance, `
    select trim_scale(coalesce(sum("OpenBalance") filter (where "Terms"->>'Kind' = '1'), 0)),
           trim_scale(coalesce(sum("OpenBalance") filter (where "Terms"->>'Kind' in ('2', '4')), 0))
    from finance.customer_documents where "WorkspaceId" = ${workspace} and "State" = 2
  `).split('|')
  const subledgers = [inventoryValue, ...suppliers, ...customers, '0']
  const labels = ['inventory', 'payables', 'supplierRecovery', 'receivables', 'customerFunds', 'trialBalance']
  const checks = labels.map((name, index) => ({
    name, ledger: controls[index], subledger: subledgers[index], matched: controls[index] === subledgers[index],
  }))

  const projection = psql(databases.reportingdb, `
    select concat_ws('|', "TenantId", "WorkspaceId", "Name", "CountryCode", "BaseCurrency")
    from reporting.workspace_projection where "WorkspaceId" = ${workspace}
  `)
  const organization = psql(databases.organizationdb, `
    select concat_ws('|', "TenantId", "Id", "Name", "CountryCode", "BaseCurrency")
    from organization.workspaces where "Id" = ${workspace}
  `)
  return { workspaceId, checks, workspaceProjectionMatched: organization.length > 0 && projection === organization }
}

module.exports = { reconcileRestored }
