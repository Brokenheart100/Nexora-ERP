#!/usr/bin/env node
/*
 * P6-03 local load baseline.
 *
 * Run from the repository root (CommonJS resolves @playwright/test from the web app):
 *   PGPASSWORD="$(docker exec postgres-frkgfdpc printenv POSTGRES_PASSWORD)" \
 *     NODE_PATH="D:/Code/CSharp/Nexora ERP/src/Web/nexora-web/node_modules" \
 *     node scripts/p6/load-baseline.cjs --items=100000 --movements=1000000 --concurrency=50 --rounds=10
 *
 * The script logs in through the real BFF with the demo alice account, selects an empty
 * non-personal workspace, seeds synthetic catalog/stock rows directly in PostgreSQL, then
 * measures BFF read latency and a 50-way concurrent read mix. It never prints the database password.
 */
'use strict';

const { chromium } = require('@playwright/test');
const { createHmac } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const artifactDir = path.join(repo, 'artifacts', 'p6');
const outputFile = path.join(artifactDir, 'load-baseline.json');
const summaryFile = path.join(artifactDir, 'load-baseline.md');
const seedFile = path.join(repo, 'artifacts', 'p1', 'runtime', 'browser-otp.json');
const realmFile = path.join(repo, 'artifacts', 'p1', 'runtime', 'keycloak', 'nexora-realm.json');

function cli(name, fallback) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find(value => value.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = process.argv.indexOf('--' + name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) return process.argv[index + 1];
  return fallback;
}
function integer(name, fallback) {
  const value = Number(cli(name, String(fallback)));
  if (!Number.isInteger(value) || value < 0) throw new Error('--' + name + ' must be a non-negative integer');
  return value;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
const options = {
  items: integer('items', 100000),
  movements: integer('movements', 1000000),
  concurrency: integer('concurrency', 50),
  rounds: integer('rounds', 10),
  workspace: cli('workspace', ''),
  postgresContainer: cli('postgres-container', 'postgres-frkgfdpc'),
};

const result = {
  suite: 'p6-03-local-load-baseline',
  startedAt: new Date().toISOString(),
  options,
  environment: {},
  workspace: {},
  definitions: {},
  warehouse: {},
  seed: {},
  apiChecks: {},
  measurements: {},
  notes: [],
};

function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
function uuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function hex12(index) { return index.toString(16).padStart(12, '0'); }
function seededItemId(index) { return 'a0000000-0000-4000-8000-' + hex12(index); }
function summarize(samples) {
  const values = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length === 0) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const at = fraction => values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    min: Number(values[0].toFixed(2)),
    p50: Number(at(0.5).toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
    p99: Number(at(0.99).toFixed(2)),
    max: Number(values[values.length - 1].toFixed(2)),
    mean: Number(mean.toFixed(2)),
  };
}

const dbUser = process.env.P6_POSTGRES_USER || 'postgres';
const dbPassword = process.env.PGPASSWORD;
if (!dbPassword) throw new Error('Set PGPASSWORD in the environment (read it from the postgres container); it is required for direct seeding.');

function psql(database, sql) {
  const args = ['exec', '-e', 'PGPASSWORD=' + dbPassword, options.postgresContainer,
    'psql', '-U', dbUser, '-d', database, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '|', '-P', 'pager=off', '-c', sql];
  return execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600000 }).trim();
}
function scalar(database, sql) { const text = psql(database, sql); return text.split('\n')[0].trim(); }
function lines(database, sql) { return psql(database, sql).split('\n').map(value => value.trim()).filter(Boolean); }

function totp(rawSecret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(rawSecret, 'utf8')).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
const seeds = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {};
async function freshTotp(username, rawSecret) {
  const key = username + ':lastCounter';
  while (Number(seeds[key] || 0) >= Math.floor(Date.now() / 30000) || 30000 - (Date.now() % 30000) < 2500) await sleep(250);
  seeds[key] = String(Math.floor(Date.now() / 30000));
  fs.mkdirSync(path.dirname(seedFile), { recursive: true });
  fs.writeFileSync(seedFile, JSON.stringify(seeds));
  return totp(rawSecret);
}

async function main() {
  result.environment = {
    capturedAt: new Date().toISOString(),
    platform: process.platform + ' ' + os.release(),
    cpuCount: os.cpus().length,
    cpuModel: os.cpus()[0] ? os.cpus()[0].model : null,
    totalMemoryMiB: Math.round(os.totalmem() / 1048576),
    node: process.version,
    playwright: require('@playwright/test/package.json').version,
    postgresImage: execFileSync('docker', ['inspect', '--format', '{{.Config.Image}}', options.postgresContainer], { encoding: 'utf8' }).trim(),
    postgresVersion: scalar('organizationdb', 'select version()'),
  };
  result.notes.push('Single host, single Aspire app host, shared local PostgreSQL container; latency is measured through the real browser-session BFF -> YARP -> service path.');
  result.notes.push('Synthetic catalog and stock rows are inserted directly into PostgreSQL, not through domain APIs; this is a read-path baseline, not a write-throughput or correctness test.');
  result.notes.push('50 concurrent users are approximated by 50 concurrent requests on one authenticated BFF session; it is not an independent-user session benchmark.');
  result.notes.push('Reporting only projects WorkspaceCreated in this build; projection lag is probed separately by scripts/p6/projection-latency.cjs. Here only report-read latency is recorded.');

  const realm = JSON.parse(fs.readFileSync(realmFile, 'utf8'));
  const alice = realm.users.find(user => user.username === 'alice');
  if (!alice) throw new Error('alice is missing from the demo realm');
  if (!seeds.alice) throw new Error('alice MFA seed is missing; run the e2e workspace suite once before this baseline');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ baseURL: 'https://localhost:7443', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    console.log('Logging in as alice through the BFF');
    await page.goto('/bff/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill('alice');
    await page.locator('#password').fill(alice.credentials[0].value);
    await page.locator('#kc-login').click();
    await page.waitForSelector('input[name="otp"], input[name="totpSecret"]', { timeout: 60000 });
    if (await page.locator('input[name="totpSecret"]').count()) {
      const raw = await page.locator('input[name="totpSecret"]').inputValue();
      seeds.alice = raw;
      fs.writeFileSync(seedFile, JSON.stringify(seeds));
      await page.locator('input[name="totp"]').fill(await freshTotp('alice', raw));
      await page.locator('input[name="userLabel"]').fill('P6 load baseline');
      await page.locator('input[type="submit"], button[type="submit"]').last().click();
    } else {
      await page.locator('input[name="otp"]').fill(await freshTotp('alice', seeds.alice));
      await page.locator('#kc-login').click();
    }
    await page.waitForURL(url => url.origin === 'https://localhost:7443' || url.searchParams.get('execution') === 'VERIFY_PROFILE', { timeout: 60000 });
    if (new URL(page.url()).searchParams.get('execution') === 'VERIFY_PROFILE') {
      await page.locator('input[name="firstName"]').fill('alice');
      await page.locator('input[name="lastName"]').fill('Load');
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
    }
    await page.waitForURL('https://localhost:7443/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByLabel('企业名称').waitFor({ state: 'visible', timeout: 60000 });
    console.log('Login passed; selecting an empty workspace');

    const http = context.request;
    let csrfToken = null;
    async function antiforgery() {
      if (csrfToken) return csrfToken;
      const response = await http.get('/bff/antiforgery', { failOnStatusCode: false });
      if (!response.ok()) throw new Error('antiforgery returned ' + response.status());
      csrfToken = (await response.json()).requestToken;
      return csrfToken;
    }
    async function get(pathname, timeout) {
      const started = performance.now();
      const response = await http.get(pathname, { failOnStatusCode: false, timeout: timeout || 120000 });
      const text = await response.text();
      return { status: response.status(), ms: performance.now() - started, text, json: parseJson(text) };
    }
    async function send(pathname, method, body, timeout) {
      const token = await antiforgery();
      const response = await http.fetch(pathname, {
        method, failOnStatusCode: false, timeout: timeout || 120000,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        data: JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status(), text, json: parseJson(text) };
    }

    const listed = await get('/bff/api/workspaces');
    if (listed.status !== 200 || !Array.isArray(listed.json)) throw new Error('workspace list failed: HTTP ' + listed.status + ' ' + listed.text.slice(0, 300));
    const usedByCatalog = new Set(lines('masterdatadb', 'select distinct "WorkspaceId" from masterdata.items').map(value => value.toLowerCase()));
    const usedByStock = new Set(lines('inventorydb', 'select distinct "WorkspaceId" from inventory.stock_movements').map(value => value.toLowerCase()));
    const loadWorkspaces = new Set(lines('masterdatadb', `select distinct "WorkspaceId" from masterdata.items where "Code" like 'LOAD-%'`).map(value => value.toLowerCase()));
    let workspace = null;
    if (options.workspace) {
      workspace = listed.json.find(item => item.id.toLowerCase() === options.workspace.toLowerCase());
      if (!workspace) throw new Error('--workspace ' + options.workspace + ' is not accessible to alice');
    } else {
      workspace = listed.json.find(item => !item.isPersonal && loadWorkspaces.has(item.id.toLowerCase()));
      if (!workspace) workspace = listed.json.find(item => !item.isPersonal && !usedByCatalog.has(item.id.toLowerCase()) && !usedByStock.has(item.id.toLowerCase()));
    }
    if (!workspace) throw new Error('no empty non-personal workspace is available for the load baseline');
    const ws = workspace.id;
    const tenant = workspace.tenantId;
    if (!uuid(ws) || !uuid(tenant)) throw new Error('workspace metadata is not usable');
    result.workspace = { id: ws, name: workspace.name, tenantId: tenant, countryCode: workspace.countryCode, baseCurrency: workspace.baseCurrency };

    async function catalog() {
      const response = await get('/bff/api/masterdata/workspaces/' + ws + '/catalog?page=1');
      if (response.status !== 200) throw new Error('catalog read failed: HTTP ' + response.status + ' ' + response.text.slice(0, 300));
      return response.json;
    }
    async function ensureDefinition(kind, code, name) {
      let view = await catalog();
      let existing = (view.definitions || []).find(item => item.code === code && item.kind === kind);
      if (existing) return { id: existing.id, created: false };
      const response = await send('/bff/api/masterdata/workspaces/' + ws + '/definitions', 'POST', { operationId: crypto.randomUUID(), kind, code, name });
      if (response.status === 200 || response.status === 201) return { id: response.json.id, created: true };
      if (response.status === 409) {
        view = await catalog();
        existing = (view.definitions || []).find(item => item.code === code && item.kind === kind);
        if (existing) return { id: existing.id, created: false };
      }
      const error = new Error('definition ' + code + ' failed: HTTP ' + response.status + ' ' + response.text.slice(0, 300));
      error.status = response.status;
      throw error;
    }
    try {
      const category = await ensureDefinition('category', 'P6-LOAD-CAT', 'P6 负载分类');
      const unit = await ensureDefinition('unit', 'P6-LOAD-UNIT', 'P6 负载单位');
      result.definitions = { categoryId: category.id, categoryCreated: category.created, unitId: unit.id, unitCreated: unit.created };
    } catch (error) {
      if (error.status === 403) throw new Error('alice has no write permission on workspace ' + ws + '; choose another --workspace');
      throw error;
    }
    const categoryId = result.definitions.categoryId;
    const unitId = result.definitions.unitId;

    const inventoryView = await get('/bff/api/inventory/workspaces/' + ws + '/warehouses');
    if (inventoryView.status !== 200) throw new Error('warehouse list failed: HTTP ' + inventoryView.status);
    let warehouse = (inventoryView.json.warehouses || [])[0];
    if (!warehouse) {
      const createdWarehouse = await send('/bff/api/inventory/workspaces/' + ws + '/warehouses', 'POST', { operationId: crypto.randomUUID(), code: 'P6LOAD', name: 'P6 负载仓' });
      if (createdWarehouse.status !== 200 && createdWarehouse.status !== 201) throw new Error('warehouse create failed: HTTP ' + createdWarehouse.status + ' ' + createdWarehouse.text.slice(0, 300));
      warehouse = { id: createdWarehouse.json.id, code: 'P6LOAD', name: 'P6 负载仓' };
    }
    result.warehouse = { id: warehouse.id, code: warehouse.code, name: warehouse.name };

    const countSql = "select count(*) from masterdata.items where \"WorkspaceId\" = '" + ws + "'";
    const itemCountBefore = Number(scalar('masterdatadb', countSql));
    if (itemCountBefore > options.items) throw new Error('workspace already holds ' + itemCountBefore + ' catalog rows, more than --items ' + options.items);
    const loadSql = "select count(*) from masterdata.items where \"WorkspaceId\" = '" + ws + "' and \"Code\" like 'LOAD-%'";
    if (itemCountBefore > 0 && Number(scalar('masterdatadb', loadSql)) !== itemCountBefore) throw new Error('workspace already contains non-load catalog rows; choose another empty workspace');
    const movementCountSql = "select count(*) from inventory.stock_movements where \"WorkspaceId\" = '" + ws + "'";
    const movementCountBefore = Number(scalar('inventorydb', movementCountSql));

    if (options.items > itemCountBefore) {
      console.log('Seeding catalog rows ' + (itemCountBefore + 1) + '..' + options.items);
      const started = performance.now();
      const seedItems = "insert into masterdata.items select " +
        "('a0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, '" + tenant + "'::uuid, '" + ws + "'::uuid, " +
        "'LOAD-' || lpad(g::text, 8, '0'), '负载商品 ' || g, 1, true, '" + categoryId + "'::uuid, '" + unitId + "'::uuid, true, 1 " +
        "from generate_series(" + (itemCountBefore + 1) + ", " + options.items + ") as g";
      psql('masterdatadb', seedItems);
      result.seed.itemsMillis = Math.round(performance.now() - started);
    }
    const itemCount = Number(scalar('masterdatadb', countSql));
    if (itemCount < options.items) throw new Error('catalog seed incomplete: ' + itemCount + '/' + options.items);

    if (options.movements > movementCountBefore) {
      console.log('Seeding stock movements ' + (movementCountBefore + 1) + '..' + options.movements);
      const started = performance.now();
      const seedMovements = "insert into inventory.stock_movements select " +
        "('b0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, '" + tenant + "'::uuid, '" + ws + "'::uuid, '" + warehouse.id + "'::uuid, " +
        "('a0000000-0000-4000-8000-' || lpad(to_hex(1 + ((g - 1) % " + options.items + ")), 12, '0'))::uuid, " +
        "('c0000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, g, " +
        "date '2025-01-01' + ((g - 1) % 365)::int, (1 + (g % 9))::numeric, ((g % 100)::numeric / 100), " +
        "timestamptz '2025-01-01 00:00:00+00' + (((g - 1) % 31536000)::text || ' seconds')::interval, null, null " +
        "from generate_series(" + (movementCountBefore + 1) + ", " + options.movements + ") as g";
      psql('inventorydb', seedMovements);
      result.seed.movementsMillis = Math.round(performance.now() - started);
    }
    const movementCount = Number(scalar('inventorydb', movementCountSql));
    if (movementCount < options.movements) throw new Error('stock seed incomplete: ' + movementCount + '/' + options.movements);
    result.seed.items = itemCount;
    result.seed.movements = movementCount;
    result.seed.itemsBytes = Number(scalar('masterdatadb', "select pg_total_relation_size('masterdata.items')"));
    result.seed.movementsBytes = Number(scalar('inventorydb', "select pg_total_relation_size('inventory.stock_movements')"));
    result.seed.catalogDatabaseBytes = Number(scalar('masterdatadb', 'select pg_database_size(current_database())'));
    result.seed.inventoryDatabaseBytes = Number(scalar('inventorydb', 'select pg_database_size(current_database())'));

    console.log('Warming up');
    for (let index = 0; index < 5; index++) {
      await get('/bff/api/masterdata/workspaces/' + ws + '/catalog?page=1');
      await get('/bff/api/inventory/workspaces/' + ws + '/warehouses/' + warehouse.id + '/movements?page=1');
      await get('/bff/api/reports/workspaces/' + ws);
    }

    const totalCatalogPages = Math.ceil(itemCount / 50);
    const catalogPages = [...new Set([1, 100, 1000, totalCatalogPages].filter(page => page >= 1 && page <= totalCatalogPages))];
    const measurements = {};
    for (const pageNumber of catalogPages) {
      const samples = [];
      for (let index = 0; index < 30; index++) {
        const response = await get('/bff/api/masterdata/workspaces/' + ws + '/catalog?page=' + pageNumber);
        samples.push(response.ms);
        if (response.status !== 200) throw new Error('catalog page ' + pageNumber + ' returned HTTP ' + response.status);
      }
      measurements['catalogPage' + pageNumber] = { path: '/bff/api/masterdata/workspaces/{id}/catalog?page=' + pageNumber, ...summarize(samples) };
    }
    {
      const samples = [];
      const detailStatuses = new Set();
      for (let index = 0; index < 40; index++) {
        const itemIndex = 1 + Math.floor(Math.random() * itemCount);
        const response = await get('/bff/api/masterdata/workspaces/' + ws + '/items/' + seededItemId(itemIndex));
        samples.push(response.ms);
        detailStatuses.add(response.status);
      }
      measurements.itemDetail = { path: '/bff/api/masterdata/workspaces/{id}/items/{itemId}', statuses: [...detailStatuses], ...summarize(samples) };
      if (detailStatuses.size !== 1 || !detailStatuses.has(200)) throw new Error('item detail smoke failed: ' + JSON.stringify([...detailStatuses]));
    }
    {
      const samples = [];
      for (let index = 0; index < 20; index++) {
        const response = await get('/bff/api/inventory/workspaces/' + ws + '/warehouses/' + warehouse.id + '/movements?page=1');
        samples.push(response.ms);
        if (response.status !== 200) throw new Error('movement page returned HTTP ' + response.status);
      }
      measurements.movementsPage1 = { path: '/bff/api/inventory/workspaces/{id}/warehouses/{wid}/movements?page=1', ...summarize(samples) };
    }
    {
      const itemId = seededItemId(1);
      const samples = [];
      for (let index = 0; index < 20; index++) {
        const response = await get('/bff/api/inventory/workspaces/' + ws + '/warehouses/' + warehouse.id + '/movements?itemId=' + itemId + '&page=1');
        samples.push(response.ms);
        if (response.status !== 200) throw new Error('movement item filter returned HTTP ' + response.status);
      }
      measurements.movementsByItem = { path: '/bff/api/inventory/workspaces/{id}/warehouses/{wid}/movements?itemId={itemId}&page=1', ...summarize(samples) };
    }
    {
      const samples = [];
      const statuses = {};
      for (let index = 0; index < 20; index++) {
        const response = await get('/bff/api/reports/workspaces/' + ws);
        samples.push(response.ms);
        statuses[response.status] = (statuses[response.status] || 0) + 1;
      }
      measurements.reportRead = { path: '/bff/api/reports/workspaces/{id}', statuses, ...summarize(samples) };
    }

    console.log('Running ' + options.rounds + ' concurrency rounds with ' + options.concurrency + ' requests each');
    const concurrentSamples = [];
    const concurrentStatuses = {};
    let wall = 0;
    for (let round = 1; round <= options.rounds; round++) {
      const started = performance.now();
      const tasks = [];
      for (let slot = 0; slot < options.concurrency; slot++) {
        const kind = slot % 10;
        let pathname;
        if (kind < 6) {
          const pageNumber = 1 + Math.floor(Math.random() * Math.min(totalCatalogPages, 200));
          pathname = '/bff/api/masterdata/workspaces/' + ws + '/catalog?page=' + pageNumber;
        } else if (kind < 8) {
          pathname = '/bff/api/masterdata/workspaces/' + ws + '/items/' + seededItemId(1 + Math.floor(Math.random() * itemCount));
        } else if (kind < 9) {
          pathname = '/bff/api/inventory/workspaces/' + ws + '/warehouses/' + warehouse.id + '/movements?page=1';
        } else {
          pathname = '/bff/api/reports/workspaces/' + ws;
        }
        tasks.push((async () => {
          const response = await get(pathname);
          concurrentSamples.push(response.ms);
          concurrentStatuses[response.status] = (concurrentStatuses[response.status] || 0) + 1;
        })());
      }
      await Promise.all(tasks);
      wall += performance.now() - started;
    }
    const requestCount = options.rounds * options.concurrency;
    const errors = Object.entries(concurrentStatuses).reduce((sum, [status, count]) => sum + (status === '200' ? 0 : count), 0);
    measurements.concurrentMixed = {
      concurrency: options.concurrency,
      rounds: options.rounds,
      requests: requestCount,
      statuses: concurrentStatuses,
      errorRate: requestCount === 0 ? null : Number((errors / requestCount).toFixed(4)),
      wallSeconds: Number((wall / 1000).toFixed(2)),
      requestsPerSecond: wall === 0 ? null : Number((requestCount / (wall / 1000)).toFixed(2)),
      ...summarize(concurrentSamples),
    };

    result.measurements = measurements;
    result.apiChecks = {
      catalogFirstPageItems: (await catalog()).page.items.length,
      movementFirstPageItems: (await get('/bff/api/inventory/workspaces/' + ws + '/warehouses/' + warehouse.id + '/movements?page=1')).json.length,
      lastCatalogPage: totalCatalogPages,
    };
    result.completedAt = new Date().toISOString();
    console.log('Load baseline complete for workspace ' + ws);
  } finally {
    await browser.close();
  }
}

main().then(() => {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  const rows = [];
  const add = (name, data) => rows.push('| ' + name + ' | ' + data.count + ' | ' + data.p50 + ' | ' + data.p95 + ' | ' + data.p99 + ' | ' + data.max + ' |');
  rows.push('| 场景 | 样本 | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) |');
  rows.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  const labels = {
    catalogPage1: '目录列表第 1 页', catalogPage100: '目录列表第 100 页', catalogPage1000: '目录列表第 1000 页',
    itemDetail: '商品详情', movementsPage1: '库存流水第 1 页', movementsByItem: '库存流水按商品筛选', reportRead: '报表投影读取',
  };
  for (const [key, label] of Object.entries(labels)) if (result.measurements[key]) add(label, result.measurements[key]);
  const mixed = result.measurements.concurrentMixed;
  if (mixed) rows.push('', '并发混合读: ' + mixed.concurrency + ' 并发 x ' + mixed.rounds + ' 轮，请求 ' + mixed.requests + '，错误率 ' + mixed.errorRate + '，吞吐 ' + mixed.requestsPerSecond + ' req/s，P95 ' + mixed.p95 + ' ms，墙钟 ' + mixed.wallSeconds + ' s');
  const markdown = ['# P6-03 本地负载基线', '', '生成时间: ' + result.startedAt, '', '工作区 ID: ' + (result.workspace.id || ''), '工作区名称: ' + (result.workspace.name || ''), '',
    '数据量: ' + (result.seed.items || 0) + ' SKU / ' + (result.seed.movements || 0) + ' 库存流水行', '', ...rows, '',
    '说明: 本记录是单机本地读路径基线，合成数据直插数据库，并发请求共享一个 BFF 会话；不能作为生产容量或 P6-03 生产验收。', ''].join('\n');
  fs.writeFileSync(summaryFile, markdown);
  console.log('Wrote ' + outputFile);
  console.log(markdown);
}).catch(error => {
  result.error = { message: error.message, stack: error.stack };
  try {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  } catch { /* ignore secondary write failure */ }
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
