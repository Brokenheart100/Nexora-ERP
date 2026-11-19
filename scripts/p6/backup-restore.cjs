#!/usr/bin/env node
'use strict'

// P6-04 local backup/restore drill.
// Dumps key databases with pg_dump -Fc, restores each into a scratch database,
// compares row counts and aggregate checksums, then drops this run's scratch databases.

const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { performance } = require('node:perf_hooks')
const { reconcileRestored } = require('./reconcile-restored.cjs')

function argValue(name, fallback) {
  const prefix = '--' + name + '='
  const found = process.argv.find(value => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const options = {
  container: argValue('container', 'postgres-frkgfdpc'),
  keep: process.argv.includes('--keep'),
  reconcile: argValue('reconcile', ''),
}

const root = path.resolve(__dirname, '..', '..')
const runId = randomUUID().slice(0, 12).replace('-', '')
const output = options.reconcile ? path.join(root, 'artifacts', 'p1', 'runtime', 'restore-' + runId) : path.join(root, 'artifacts', 'p6')
const backupDir = path.join(output, 'backup')
fs.mkdirSync(backupDir, { recursive: true })

const databases = [
  { name: 'organizationdb', schema: 'organization', message: 'organization_messages' },
  { name: 'financedb', schema: 'finance', message: 'finance_messages' },
  { name: 'inventorydb', schema: 'inventory', message: 'inventory_messages' },
  { name: 'reportingdb', schema: 'reporting', message: 'reporting_messages' },
  { name: 'masterdatadb', schema: 'masterdata', message: 'masterdata_messages' },
  { name: 'purchasingdb', schema: 'purchasing', message: 'purchasing_messages' },
  { name: 'salesdb', schema: 'sales', message: 'sales_messages' },
  { name: 'identitydb', schema: 'public', message: null },
]

function containerEnv(name) {
  return execFileSync('docker', ['exec', options.container, 'printenv', name], { encoding: 'utf8' }).trim()
}
const user = containerEnv('POSTGRES_USER')
const password = containerEnv('POSTGRES_PASSWORD')

function psql(database, sql, timeout) {
  return execFileSync('docker', [
    'exec', '-e', 'PGPASSWORD=' + password, options.container,
    'psql', '-U', user, '-d', database, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '|', '-c', sql,
  ], { encoding: 'utf8', timeout: timeout || 300000, maxBuffer: 64 * 1024 * 1024 }).trim()
}

function dump(database, file) {
  const output = execFileSync('docker', [
    'exec', '-e', 'PGPASSWORD=' + password, options.container,
    'pg_dump', '-U', user, '-Fc', '--no-owner', '--no-privileges', '-d', database,
  ], { timeout: 600000, maxBuffer: 1024 * 1024 * 1024 })
  fs.writeFileSync(file, output)
  return output.length
}

function restore(file, database) {
  execFileSync('docker', [
    'exec', '-i', '-e', 'PGPASSWORD=' + password, options.container,
    'pg_restore', '-U', user, '-d', database, '--no-owner', '--no-privileges', '--exit-on-error',
  ], { input: fs.readFileSync(file), timeout: 600000, maxBuffer: 64 * 1024 * 1024 })
}

function createScratch(database) {
  psql('postgres', 'create database ' + quoteIdent(database))
}

function dropScratch(database) {
  psql('postgres', 'select pg_terminate_backend(pid) from pg_stat_activity where datname = ' + quoteLiteral(database))
  psql('postgres', 'drop database if exists ' + quoteIdent(database))
}

function quoteLiteral(value) { return "'" + String(value).replaceAll("'", "''") + "'" }
function quoteIdent(value) { return '"' + String(value).replaceAll('"', '""') + '"' }

function checks(db) {
  const list = []
  if (db.name === 'organizationdb') {
    list.push(['workspaces', 'select count(*) from organization.workspaces'])
    list.push(['workspace_members', 'select count(*) from organization.workspace_members'])
    list.push(['workspace_role_grants', 'select count(*) from organization.workspace_role_grants'])
    list.push(['billing_subscriptions', 'select count(*) from organization.billing_subscriptions'])
    list.push(['billing_invoices', 'select count(*), coalesce(sum("AmountCents"), 0) from organization.billing_invoices'])
    list.push(['workspace_audit', 'select count(*) from organization.workspace_audit'])
  }
  if (db.name === 'financedb') {
    list.push(['journals', 'select count(*) from finance.journals'])
    list.push(['journal_lines', 'select count(*), coalesce(sum("Debit"), 0), coalesce(sum("Credit"), 0) from finance.journal_lines'])
    list.push(['fiscal_periods', 'select count(*) from finance.fiscal_periods'])
    list.push(['record_changes', 'select count(*) from finance.record_changes'])
  }
  if (db.name === 'inventorydb') {
    list.push(['stock_movements', 'select count(*), coalesce(sum("Quantity"), 0), coalesce(sum("Cost"), 0) from inventory.stock_movements'])
    list.push(['warehouses', 'select count(*) from inventory.warehouses'])
    list.push(['cost_pools', 'select count(*), coalesce(sum("Quantity"), 0), coalesce(sum("Value"), 0) from inventory.cost_pools'])
    list.push(['record_changes', 'select count(*) from inventory.record_changes'])
  }
  if (db.name === 'reportingdb') {
    list.push(['workspace_projection', 'select count(*) from reporting.workspace_projection'])
    list.push(['workspace_authorization_watermarks', 'select count(*), coalesce(sum("Version"), 0) from reporting.workspace_authorization_watermarks'])
  }
  if (db.name === 'masterdatadb') {
    list.push(['items', 'select count(*) from masterdata.items'])
    list.push(['definitions', 'select count(*) from masterdata.definitions'])
    list.push(['partners', 'select count(*) from masterdata.partners'])
  }
  if (db.name === 'purchasingdb') {
    list.push(['orders', 'select count(*) from purchasing.orders'])
    list.push(['order_lines', 'select count(*), coalesce(sum("Amount"), 0) from purchasing.order_lines'])
    list.push(['receipt_permits', 'select count(*) from purchasing.receipt_permits'])
    list.push(['record_changes', 'select count(*) from purchasing.record_changes'])
  }
  if (db.name === 'salesdb') {
    list.push(['orders', 'select count(*) from sales.orders'])
    list.push(['order_lines', 'select count(*), coalesce(sum("Amount"), 0) from sales.order_lines'])
    list.push(['fulfillment_permits', 'select count(*) from sales.fulfillment_permits'])
    list.push(['record_changes', 'select count(*) from sales.record_changes'])
  }
  if (db.name === 'identitydb') {
    list.push(['realm', 'select count(*) from public.realm'])
    list.push(['client', 'select count(*) from public.client'])
    list.push(['user_entity', 'select count(*) from public.user_entity'])
    list.push(['credential', 'select count(*) from public.credential'])
  }
  if (db.message) {
    list.push(['outgoing_envelopes', 'select count(*) from ' + db.message + '.wolverine_outgoing_envelopes'])
    list.push(['incoming_envelopes', 'select count(*) from ' + db.message + '.wolverine_incoming_envelopes'])
    list.push(['dead_letters', 'select count(*) from ' + db.message + '.wolverine_dead_letters'])
  }
  return list
}

function collectChecks(database, db) {
  const values = {}
  for (const [label, sql] of checks(db)) values[label] = psql(database, sql)
  return values
}

const result = {
  suite: 'p6-04-local-backup-restore',
  startedAt: new Date().toISOString(),
  environment: {
    platform: process.platform + ' ' + os.release(),
    node: process.version,
    cpuCount: os.cpus().length,
    totalMemoryMiB: Math.round(os.totalmem() / 1048576),
    postgresImage: execFileSync('docker', ['inspect', '--format', '{{.Config.Image}}', options.container], { encoding: 'utf8' }).trim(),
    postgresVersion: psql('postgres', 'select version()'),
  },
  notes: [],
  databases: [],
}
const scratchDatabases = new Map()

try {
  psql('postgres', 'select 1')
  result.notes.push('Local drill only: pg_dump -Fc per database, restore into a scratch database in the same PostgreSQL instance, compare counts and aggregates. Cross-database consistency is not guaranteed because each database is dumped in its own transaction snapshot.')
  result.notes.push('The application keeps running during the dump. Business tables are read-only for this local environment at the time of the drill; outbox/inbox counts may change if background messages are processed.')
  result.notes.push('No WAL archiving or point-in-time recovery is configured, so RPO is tied to the last completed dump and is not the 15-minute production target.')
  result.notes.push('The scratch database is dropped after verification; this drill does not repoint running services or test traffic cutover.')

  for (const db of databases) {
    console.log('Dumping ' + db.name)
    const file = path.join(backupDir, db.name + '.dump')
    const dumpStarted = performance.now()
    const bytes = dump(db.name, file)
    const dumpMillis = Math.round(performance.now() - dumpStarted)

    const sourceChecks = collectChecks(db.name, db)
    const scratch = 'p6_restore_' + runId + '_' + db.name
    createScratch(scratch)
    scratchDatabases.set(db.name, scratch)

    console.log('Restoring ' + db.name + ' into ' + scratch)
    const restoreStarted = performance.now()
    restore(file, scratch)
    const restoreMillis = Math.round(performance.now() - restoreStarted)

    const restoredChecks = collectChecks(scratch, db)
    const mismatches = []
    for (const label of Object.keys(sourceChecks)) {
      if (sourceChecks[label] !== restoredChecks[label]) {
        mismatches.push({ label, source: sourceChecks[label], restored: restoredChecks[label] })
      }
    }

    result.databases.push({
      name: db.name,
      dumpFile: path.relative(root, file).replaceAll('\\', '/'),
      dumpBytes: bytes,
      dumpMillis,
      restoreMillis,
      checks: sourceChecks,
      mismatches,
      verified: mismatches.length === 0,
    })

    if (mismatches.length) {
      throw new Error('backup/restore verification failed for ' + db.name + ': ' + JSON.stringify(mismatches))
    }
    if (!options.keep && !options.reconcile) {
      dropScratch(scratch)
      scratchDatabases.delete(db.name)
    }
    console.log('Verified ' + db.name + ' in ' + restoreMillis + ' ms')
  }

  if (options.reconcile) {
    result.reconciliation = reconcileRestored(psql, Object.fromEntries(scratchDatabases), options.reconcile)
    if (result.reconciliation.checks.some(check => !check.matched) || !result.reconciliation.workspaceProjectionMatched)
      throw new Error('Restored business balances or workspace projection differ. See the drill report.')
  }
  const totalDump = result.databases.reduce((sum, item) => sum + item.dumpMillis, 0)
  const totalRestore = result.databases.reduce((sum, item) => sum + item.restoreMillis, 0)
  result.totals = {
    databases: result.databases.length,
    dumpBytes: result.databases.reduce((sum, item) => sum + item.dumpBytes, 0),
    dumpMillis: totalDump,
    restoreMillis: totalRestore,
    allVerified: result.databases.every(item => item.verified),
  }
  result.notes.push('Local restore time excludes provisioning, service restart, verification of external integrations and application warm-up; it is not an RTO measurement.')
  result.completedAt = new Date().toISOString()
} catch (error) {
  result.error = error.message
  result.completedAt = new Date().toISOString()
  throw error
} finally {
  if (!options.keep) {
    for (const scratch of scratchDatabases.values()) {
      try { dropScratch(scratch) }
      catch { result.notes.push('Could not remove scratch database ' + scratch) }
    }
  }
  if (!result.totals) {
    result.totals = {
      databases: result.databases.length,
      dumpBytes: result.databases.reduce((sum, item) => sum + item.dumpBytes, 0),
      dumpMillis: result.databases.reduce((sum, item) => sum + item.dumpMillis, 0),
      restoreMillis: result.databases.reduce((sum, item) => sum + item.restoreMillis, 0),
      allVerified: result.databases.length > 0 && result.databases.every(item => item.verified),
    }
  }
  fs.writeFileSync(path.join(output, 'backup-restore.json'), JSON.stringify(result, null, 2))
  const rows = result.databases.map(item => '| ' + item.name + ' | ' + (item.dumpBytes / 1048576).toFixed(1) + ' MiB | ' + item.dumpMillis + ' | ' + item.restoreMillis + ' | ' + (item.verified ? '一致' : '不一致') + ' |').join('\n')
  const crossChecks = result.reconciliation ? [
    '## 恢复后工作区对账', '',
    '| 项目 | 总账 | 子账 | 结果 |', '| --- | ---: | ---: | --- |',
    ...result.reconciliation.checks.map(check => `| ${check.name} | ${check.ledger} | ${check.subledger} | ${check.matched ? '一致' : '不一致'} |`),
    '', '组织与 Reporting 工作区投影 ' + (result.reconciliation.workspaceProjectionMatched ? '一致。' : '不一致。'), '',
  ] : []
  const lines = [
    '# P6-04 本地备份恢复演练',
    '',
    '生成时间: ' + new Date().toISOString(),
    '',
    '## 结果',
    '',
    '| 数据库 | 备份大小 | 备份耗时 (ms) | 恢复耗时 (ms) | 校验 |',
    '| --- | ---: | ---: | ---: | --- |',
    rows,
    '',
    '合计: ' + result.totals.databases + ' 个数据库，备份 ' + (result.totals.dumpBytes / 1048576).toFixed(1) + ' MiB，备份耗时 ' + result.totals.dumpMillis + ' ms，恢复耗时 ' + result.totals.restoreMillis + ' ms，全部校验: ' + (result.totals.allVerified ? '通过' : '失败') + '。',
    '',
    ...crossChecks,
    '## 说明',
    '',
    ...result.notes.map(note => '- ' + note),
    '',
    '## 校验项',
    '',
    '- 组织: workspaces、workspace_members、workspace_role_grants、billing_subscriptions、billing_invoices（含金额合计）、workspace_audit。',
    '- 财务: journals、journal_lines（含借贷合计）、fiscal_periods、record_changes。',
    '- 库存: stock_movements（含数量/成本合计）、warehouses、cost_pools（含数量/价值合计）、record_changes。',
    '- 报表: workspace_projection、workspace_authorization_watermarks。',
    '- 主数据: items、definitions、partners。',
    '- 采购: orders、order_lines（含金额合计）、receipt_permits、record_changes。',
    '- 销售: orders、order_lines（含金额合计）、fulfillment_permits、record_changes。',
    '- 身份: keycloak realm、client、user_entity、credential 计数。',
    '- 每个业务数据库的 Wolverine outgoing/incoming/dead-letter envelope 计数。',
    '',
    '## 限制与缺口',
    '',
    '- 没有 WAL 归档/时间点恢复；无法证明 RPO ≤ 15 分钟。',
    '- 没有异地备份或备份保留策略。备份目录为 ' + path.relative(root, backupDir).replaceAll('\\', '/') + '。',
    '- 服务切换、消息补投、投影重建尚需演练。',
    '- 恢复耗时不含容器/服务启动、应用预热和外部依赖校验，不能作为 RTO 结论。',
    '',
  ]
  fs.writeFileSync(path.join(output, 'backup-restore.md'), lines.join('\n'))
}
