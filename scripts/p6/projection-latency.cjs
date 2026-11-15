#!/usr/bin/env node
/*
 * P6-03 local projection latency probe.
 *
 * Creates a small number of workspaces as the demo bob account through the real BFF,
 * then polls the Reporting read endpoint until the WorkspaceCreated projection is visible.
 * This measures the local BFF -> YARP -> Organization outbox -> RabbitMQ -> Reporting path,
 * not production latency.
 *
 * Run from the repository root:
 *   NODE_PATH="D:/Code/CSharp/Nexora ERP/src/Web/nexora-web/node_modules" \
 *     node scripts/p6/projection-latency.cjs --samples=10
 */
'use strict';

const { chromium } = require('@playwright/test');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const artifactDir = path.join(repo, 'artifacts', 'p6');
const outputFile = path.join(artifactDir, 'projection-latency.json');
const summaryFile = path.join(artifactDir, 'projection-latency.md');
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
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
const samples = Number(cli('samples', '10'));
if (!Number.isInteger(samples) || samples < 1 || samples > 20) throw new Error('--samples must be 1..20');
const account = cli('account', 'bob');
const pollMs = Number(cli('poll-ms', '50'));
const timeoutMs = Number(cli('timeout-ms', '60000'));

function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0 };
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    p50: Number(at(0.5).toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    mean: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)),
  };
}

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
  const realm = JSON.parse(fs.readFileSync(realmFile, 'utf8'));
  const user = realm.users.find(item => item.username === account);
  if (!user) throw new Error(account + ' is missing from the demo realm');
  if (!seeds[account]) throw new Error(account + ' MFA seed is missing; run the e2e workspace suite once before this probe');

  const result = {
    suite: 'p6-03-local-projection-latency',
    startedAt: new Date().toISOString(),
    account,
    options: { samples, pollMs, timeoutMs },
    environment: {
      platform: process.platform + ' ' + os.release(),
      cpuCount: os.cpus().length,
      totalMemoryMiB: Math.round(os.totalmem() / 1048576),
      node: process.version,
      playwright: require('@playwright/test/package.json').version,
    },
    workspaces: [],
    notes: [
      'Creates real workspaces through the BFF as the demo account; this leaves workspace rows in the local database because the product has no workspace delete API.',
      'Measures local BFF -> gateway -> Organization outbox / RabbitMQ -> Reporting projection visibility; local single-node numbers are not a production projection-delay acceptance.',
    ],
  };

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ baseURL: 'https://localhost:7443', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    console.log('Logging in as ' + account + ' through the BFF');
    await page.goto('/bff/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(account);
    await page.locator('#password').fill(user.credentials[0].value);
    await page.locator('#kc-login').click();
    await page.waitForSelector('input[name="otp"], input[name="totpSecret"]', { timeout: 60000 });
    if (await page.locator('input[name="totpSecret"]').count()) {
      const raw = await page.locator('input[name="totpSecret"]').inputValue();
      seeds[account] = raw;
      fs.writeFileSync(seedFile, JSON.stringify(seeds));
      await page.locator('input[name="totp"]').fill(await freshTotp(account, raw));
      await page.locator('input[name="userLabel"]').fill('P6 projection latency');
      await page.locator('input[type="submit"], button[type="submit"]').last().click();
    } else {
      await page.locator('input[name="otp"]').fill(await freshTotp(account, seeds[account]));
      await page.locator('#kc-login').click();
    }
    await page.waitForURL(url => url.origin === 'https://localhost:7443' || url.searchParams.get('execution') === 'VERIFY_PROFILE', { timeout: 60000 });
    if (new URL(page.url()).searchParams.get('execution') === 'VERIFY_PROFILE') {
      await page.locator('input[name="firstName"]').fill(account);
      await page.locator('input[name="lastName"]').fill('Probe');
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
    }
    await page.waitForURL('https://localhost:7443/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByLabel('企业名称').waitFor({ state: 'visible', timeout: 60000 });
    console.log('Login passed');

    const http = context.request;
    let csrfToken = null;
    async function antiforgery() {
      if (csrfToken) return csrfToken;
      const response = await http.get('/bff/antiforgery', { failOnStatusCode: false });
      if (!response.ok()) throw new Error('antiforgery returned ' + response.status());
      csrfToken = (await response.json()).requestToken;
      return csrfToken;
    }
    async function get(pathname) {
      const started = performance.now();
      const response = await http.get(pathname, { failOnStatusCode: false, timeout: 60000 });
      const text = await response.text();
      return { status: response.status(), ms: performance.now() - started, text, json: parseJson(text) };
    }
    async function send(pathname, method, body) {
      const token = await antiforgery();
      const response = await http.fetch(pathname, {
        method, failOnStatusCode: false, timeout: 60000,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        data: JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status(), text, json: parseJson(text) };
    }

    for (let index = 1; index <= samples; index++) {
      const name = 'P6 投影延迟 ' + new Date().toISOString() + ' #' + index;
      const started = performance.now();
      const created = await send('/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name });
      if (created.status !== 200 && created.status !== 201) throw new Error('workspace create failed: HTTP ' + created.status + ' ' + created.text.slice(0, 300));
      if (!created.json || !created.json.id) throw new Error('workspace create returned no id');
      const workspaceId = created.json.id;
      const createMs = performance.now() - started;
      let report200Ms = null;
      let lastStatus = null;
      let pendingPolls = 0;
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        const report = await get('/bff/api/reports/workspaces/' + workspaceId);
        lastStatus = report.status;
        if (report.status === 200) { report200Ms = performance.now() - started; break; }
        if (report.status !== 202) throw new Error('report read failed: HTTP ' + report.status + ' ' + report.text.slice(0, 300));
        pendingPolls++;
        await sleep(pollMs);
      }
      if (report200Ms === null) throw new Error('projection did not become visible within ' + timeoutMs + ' ms for ' + workspaceId);
      result.workspaces.push({
        index,
        id: workspaceId,
        name,
        createHttpMs: Number(createMs.toFixed(2)),
        projectVisibleMs: Number(report200Ms.toFixed(2)),
        pendingPolls,
        lastStatus,
      });
      console.log('sample ' + index + ': create ' + createMs.toFixed(1) + ' ms, projection visible ' + report200Ms.toFixed(1) + ' ms, pending polls ' + pendingPolls);
    }

    result.summary = {
      createHttp: summarize(result.workspaces.map(item => item.createHttpMs)),
      projectVisible: summarize(result.workspaces.map(item => item.projectVisibleMs)),
    };
    result.finishedAt = new Date().toISOString();
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    const rows = result.workspaces.map(item => '| ' + item.index + ' | ' + item.id + ' | ' + item.createHttpMs + ' | ' + item.projectVisibleMs + ' | ' + item.pendingPolls + ' |').join('\n');
    const markdown = [
      '# P6-03 本地投影延迟探测',
      '',
      '> 状态：本地单机探测，**不是生产投影延迟验收**。日期：' + new Date().toISOString().slice(0, 10) + '。',
      '',
      '- 账号：' + account + '；样本：' + samples + '；轮询间隔：' + pollMs + ' ms；路径：真实 BFF → 网关 → Organization outbox / RabbitMQ → Reporting。',
      '- 投影可见时间从创建请求开始计时，到 GET /bff/api/reports/workspaces/{id} 首次返回 200 为止；期间 202 表示 pending。',
      '',
      '| # | 工作区 | 创建 HTTP (ms) | 投影可见 (ms) | pending 轮询 |',
      '| ---: | --- | ---: | ---: | ---: |',
      rows,
      '',
      '汇总：创建 HTTP P50 ' + result.summary.createHttp.p50 + ' ms / P95 ' + result.summary.createHttp.p95 + ' ms；投影可见 P50 ' + result.summary.projectVisible.p50 + ' ms / P95 ' + result.summary.projectVisible.p95 + ' ms / Max ' + result.summary.projectVisible.max + ' ms。',
      '',
      '说明：本次调用会真实创建工作区，本地库不提供工作区删除接口，因此会留下样本工作区；本地单节点结果不代表生产容量或跨服务恢复能力。',
      '',
      '原始结果：artifacts/p6/projection-latency.json。',
      '',
    ].join('\n');
    fs.writeFileSync(summaryFile, markdown);
    console.log('Artifacts written:', outputFile);
    console.log('Projection visible P50/P95:', result.summary.projectVisible.p50, result.summary.projectVisible.p95);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
