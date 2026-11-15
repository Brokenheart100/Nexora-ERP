#!/usr/bin/env node
'use strict';

// P6-05 migration drill: generate EF SQL for every service, apply it to an
// empty scratch database, prove the idempotent script is safe to rerun, then
// execute the latest migration's rollback SQL and re-apply it.
//
// This script never touches an application database. Scratch databases are
// prefixed p6_migrate_ and dropped at the end unless --keep is passed.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const artifactDir = path.join(root, 'artifacts', 'p6');
const scriptDir = path.join(artifactDir, 'migration-scripts');
fs.mkdirSync(scriptDir, { recursive: true });

const container = process.env.POSTGRES_CONTAINER || 'postgres-frkgfdpc';
const superUser = process.env.POSTGRES_USER || 'postgres';
const password = execFileSync('docker', ['exec', container, 'printenv', 'POSTGRES_PASSWORD'], {
  encoding: 'utf8'
}).trim();
const dockerEnv = Object.assign({}, process.env, { PGPASSWORD: password });

const services = [
  {
    database: 'organizationdb',
    schema: 'organization',
    keyTable: 'organization.workspace_preferences',
    project: 'src/Services/Organization/Nexora.Organization.Infrastructure/Nexora.Organization.Infrastructure.csproj',
    startup: 'src/Services/Organization/Nexora.Organization.Api/Nexora.Organization.Api.csproj',
    context: 'OrganizationDbContext',
    migrations: 'src/Services/Organization/Nexora.Organization.Infrastructure/Persistence/Migrations'
  },
  {
    database: 'masterdatadb',
    schema: 'masterdata',
    keyTable: 'masterdata.items',
    project: 'src/Services/MasterData/Nexora.MasterData.Infrastructure/Nexora.MasterData.Infrastructure.csproj',
    startup: 'src/Services/MasterData/Nexora.MasterData.Api/Nexora.MasterData.Api.csproj',
    context: 'CatalogDbContext',
    migrations: 'src/Services/MasterData/Nexora.MasterData.Infrastructure/Persistence/Migrations'
  },
  {
    database: 'financedb',
    schema: 'finance',
    keyTable: 'finance.journals',
    project: 'src/Services/Finance/Nexora.Finance.Infrastructure/Nexora.Finance.Infrastructure.csproj',
    startup: 'src/Services/Finance/Nexora.Finance.Api/Nexora.Finance.Api.csproj',
    context: 'FinanceDbContext',
    migrations: 'src/Services/Finance/Nexora.Finance.Infrastructure/Persistence/Migrations'
  },
  {
    database: 'inventorydb',
    schema: 'inventory',
    keyTable: 'inventory.stock_movements',
    project: 'src/Services/Inventory/Nexora.Inventory.Infrastructure/Nexora.Inventory.Infrastructure.csproj',
    startup: 'src/Services/Inventory/Nexora.Inventory.Api/Nexora.Inventory.Api.csproj',
    context: 'InventoryDbContext',
    migrations: 'src/Services/Inventory/Nexora.Inventory.Infrastructure/Persistence/Migrations'
  },
  {
    database: 'purchasingdb',
    schema: 'purchasing',
    keyTable: 'purchasing.orders',
    project: 'src/Services/Purchasing/Nexora.Purchasing.Infrastructure/Nexora.Purchasing.Infrastructure.csproj',
    startup: 'src/Services/Purchasing/Nexora.Purchasing.Api/Nexora.Purchasing.Api.csproj',
    context: 'PurchasingDbContext',
    migrations: 'src/Services/Purchasing/Nexora.Purchasing.Infrastructure/Persistence/Migrations'
  },
  {
    database: 'salesdb',
    schema: 'sales',
    keyTable: 'sales.orders',
    project: 'src/Services/Sales/Nexora.Sales.Infrastructure/Nexora.Sales.Infrastructure.csproj',
    startup: 'src/Services/Sales/Nexora.Sales.Api/Nexora.Sales.Api.csproj',
    context: 'SalesDbContext',
    migrations: 'src/Services/Sales/Nexora.Sales.Infrastructure/Persistence/Migrations'
  },
  {
    database: 'reportingdb',
    schema: 'reporting',
    keyTable: 'reporting.workspace_projection',
    project: 'src/Services/Reporting/Nexora.Reporting.Infrastructure/Nexora.Reporting.Infrastructure.csproj',
    startup: 'src/Services/Reporting/Nexora.Reporting.Infrastructure/Nexora.Reporting.Infrastructure.csproj',
    context: 'ReportingDbContext',
    migrations: 'src/Services/Reporting/Nexora.Reporting.Infrastructure/Persistence/Migrations'
  }
];

const keep = process.argv.includes('--keep');

function runDocker(args, input) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: dockerEnv,
    input,
    maxBuffer: 128 * 1024 * 1024
  });
}

function psql(database, sql, options) {
  const settings = options || {};
  const args = [
    'exec', '-i', '-e', 'PGPASSWORD', container,
    'psql', '-U', superUser, '-d', database, '-v', 'ON_ERROR_STOP=1'
  ];
  if (settings.tuples) args.push('-t', '-A');
  if (settings.quiet !== false) args.push('-q');
  return runDocker(args, sql);
}

function scalar(database, sql) {
  return psql(database, sql + '\n', { tuples: true, quiet: true }).trim();
}

function execDotnet(args) {
  return execFileSync('dotnet', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  });
}

function migrationFiles(dir) {
  return fs.readdirSync(path.join(root, dir))
    .filter(function (name) { return name.endsWith('.cs'); })
    .filter(function (name) { return !name.endsWith('.Designer.cs') && !name.endsWith('Snapshot.cs'); })
    .sort();
}

function latestPair(database) {
  const rows = scalar(database,
    'select "MigrationId" from "__EFMigrationsHistory" order by 1 desc limit 2')
    .split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) throw new Error('database ' + database + ' needs at least two migrations');
  return { latest: rows[0], previous: rows[1] };
}

function createScratch(database) {
  const name = 'p6_migrate_' + database;
  psql('postgres', 'DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE);\nCREATE DATABASE "' + name + '";\n', { quiet: false });
  return name;
}

function dropScratch(database) {
  psql('postgres', 'DROP DATABASE IF EXISTS "p6_migrate_' + database + '" WITH (FORCE);\n', { quiet: false });
}

const startedAt = new Date();
const results = [];
const failures = [];

for (const service of services) {
  const result = {
    database: service.database,
    context: service.context,
    migrationCount: migrationFiles(service.migrations).length,
    sourceHistoryCount: Number(scalar(service.database, 'select count(*) from "__EFMigrationsHistory"')),
    sourceTables: Number(scalar(service.database,
      'select count(*) from information_schema.tables where table_schema not in (\'pg_catalog\',\'information_schema\')')),
    status: 'failed'
  };
  try {
    const pair = latestPair(service.database);
    result.latest = pair.latest;
    result.previous = pair.previous;

    const upFile = path.join(scriptDir, service.database + '-up.sql');
    const downFile = path.join(scriptDir, service.database + '-down-latest.sql');
    const upLatestFile = path.join(scriptDir, service.database + '-up-latest.sql');

    let t = Date.now();
    execDotnet(['ef', 'migrations', 'script', '--idempotent',
      '--project', service.project, '--startup-project', service.startup,
      '--context', service.context, '--configuration', 'Release', '--no-build', '-o', upFile]);
    result.upScriptBytes = fs.statSync(upFile).size;
    result.upScriptGenerateMs = Date.now() - t;

    t = Date.now();
    execDotnet(['ef', 'migrations', 'script', pair.latest, pair.previous,
      '--project', service.project, '--startup-project', service.startup,
      '--context', service.context, '--configuration', 'Release', '--no-build', '-o', downFile]);
    result.downScriptBytes = fs.statSync(downFile).size;
    result.downScriptGenerateMs = Date.now() - t;

    t = Date.now();
    execDotnet(['ef', 'migrations', 'script', pair.previous, pair.latest,
      '--project', service.project, '--startup-project', service.startup,
      '--context', service.context, '--configuration', 'Release', '--no-build', '-o', upLatestFile]);
    result.upLatestScriptBytes = fs.statSync(upLatestFile).size;
    result.upLatestScriptGenerateMs = Date.now() - t;

    const scratch = createScratch(service.database);
    const upSql = fs.readFileSync(upFile, 'utf8');

    t = Date.now();
    psql(scratch, upSql, { quiet: false });
    result.upApplyMs = Date.now() - t;

    result.historyAfterUp = Number(scalar(scratch, 'select count(*) from "__EFMigrationsHistory"'));
    result.keyTableAfterUp = scalar(scratch, "select to_regclass('" + service.keyTable + "')");
    result.tableCountAfterUp = Number(scalar(scratch,
      'select count(*) from information_schema.tables where table_schema not in (\'pg_catalog\',\'information_schema\')'));

    t = Date.now();
    psql(scratch, upSql, { quiet: false });
    result.upReapplyMs = Date.now() - t;
    result.historyAfterReapply = Number(scalar(scratch, 'select count(*) from "__EFMigrationsHistory"'));

    t = Date.now();
    psql(scratch, fs.readFileSync(downFile, 'utf8'), { quiet: false });
    result.downApplyMs = Date.now() - t;
    result.historyAfterDown = Number(scalar(scratch, 'select count(*) from "__EFMigrationsHistory"'));
    result.latestRemoved = scalar(scratch,
      'select count(*) from "__EFMigrationsHistory" where "MigrationId" = \'' + pair.latest + '\'') === '0';

    t = Date.now();
    psql(scratch, fs.readFileSync(upLatestFile, 'utf8'), { quiet: false });
    result.upLatestApplyMs = Date.now() - t;
    result.historyAfterRollback = Number(scalar(scratch, 'select count(*) from "__EFMigrationsHistory"'));
    result.latestRestored = scalar(scratch,
      'select count(*) from "__EFMigrationsHistory" where "MigrationId" = \'' + pair.latest + '\'') === '1';

    const ok = result.historyAfterUp === result.migrationCount
      && result.historyAfterUp === result.sourceHistoryCount
      && result.keyTableAfterUp === service.keyTable
      && result.historyAfterReapply === result.historyAfterUp
      && result.historyAfterDown === result.historyAfterUp - 1
      && result.latestRemoved
      && result.historyAfterRollback === result.historyAfterUp
      && result.latestRestored;
    result.status = ok ? 'verified' : 'mismatch';

    if (!keep) dropScratch(service.database);
    else result.scratchDatabase = scratch;
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr) : '';
    result.error = String((error && error.message ? error.message : error) + (stderr ? ' :: ' + stderr : '')).slice(0, 4000);
    failures.push(result);
    try { if (!keep) dropScratch(service.database); } catch (ignored) { /* noop */ }
  }
  results.push(result);
  console.log(service.database, result.status,
    'history=' + result.historyAfterUp + '/' + result.sourceHistoryCount,
    'down=' + result.historyAfterDown, 'up=' + result.historyAfterRollback);
}

const finishedAt = new Date();
const report = {
  generatedAt: finishedAt.toISOString(),
  kind: 'P6-05 local migration and rollback drill',
  environment: {
    os: process.platform + ' ' + require('os').release(),
    node: process.version,
    dotnetEf: execFileSync('dotnet', ['ef', '--version'], { encoding: 'utf8' }).trim(),
    postgresContainer: container,
    postgresVersion: psql('postgres', 'select version();', { tuples: true, quiet: true }).trim()
  },
  scriptDir: path.relative(root, scriptDir),
  databases: results,
  totals: {
    databases: results.length,
    verified: results.filter(function (r) { return r.status === 'verified'; }).length,
    failed: results.filter(function (r) { return r.status !== 'verified'; }).length,
    elapsedMs: finishedAt.getTime() - startedAt.getTime()
  },
  notes: [
    'Scratch databases are created empty and dropped after the drill; no application database is modified.',
    'The idempotent up script is applied twice to prove rerun safety.',
    'The latest migration per service is rolled back with its generated down SQL and then re-applied, proving schema rollback is executable on a scratch database.',
    'Down migrations are not a production data rollback strategy: ADR 0012 prefers rolling back the application image and keeping a compatible schema.',
    'Application image rollback and blue/green cutover were not exercised because the repository has no application container images or production deployment target.'
  ]
};

fs.writeFileSync(path.join(artifactDir, 'migration-drill.json'), JSON.stringify(report, null, 2) + '\n');

const lines = [];
lines.push('# P6-05 本地迁移与回退演练');
lines.push('');
lines.push('日期：' + finishedAt.toISOString().slice(0, 10) + '。状态：本地演练完成，生产迁移与镜像回退未验证。');
lines.push('');
lines.push('## 环境');
lines.push('');
lines.push('- ' + report.environment.dotnetEf.replace(/\r?\n/g, ' '));
lines.push('- ' + report.environment.postgresVersion);
lines.push('- 容器：' + container + '；脚本：scripts/p6/migration-drill.cjs。');
lines.push('');
lines.push('## 结果');
lines.push('');
lines.push('| 数据库 | 迁移数 | 升级脚本 | 空库升级 | 重复执行 | 回退最新迁移 | 再升级 | 结论 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  lines.push('| ' + r.database + ' | ' + r.migrationCount + ' | ' + (r.upScriptBytes || 0) + ' B | '
    + (r.upApplyMs || '-') + ' ms | ' + (r.upReapplyMs || '-') + ' ms | ' + (r.downApplyMs || '-') + ' ms | '
    + (r.upLatestApplyMs || '-') + ' ms | ' + r.status + ' |');
}
lines.push('');
lines.push('总耗时：' + report.totals.elapsedMs + ' ms；通过 ' + report.totals.verified + ' / ' + report.totals.databases + '。');
lines.push('');
lines.push('## 说明');
lines.push('');
for (const note of report.notes) lines.push('- ' + note);
if (failures.length) {
  lines.push('');
  lines.push('## 失败项');
  lines.push('');
  for (const failure of failures) lines.push('- ' + failure.database + ': ' + failure.error);
}
lines.push('');
lines.push('机器可读结果：artifacts/p6/migration-drill.json；生成脚本：artifacts/p6/migration-scripts/。');
fs.writeFileSync(path.join(artifactDir, 'migration-drill.md'), lines.join('\n') + '\n');

console.log('WROTE', path.relative(root, path.join(artifactDir, 'migration-drill.json')),
  path.relative(root, path.join(artifactDir, 'migration-drill.md')));
if (failures.length) process.exitCode = 1;
