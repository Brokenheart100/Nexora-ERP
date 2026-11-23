import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

async function checkBuild(output, mode, verify) {
  const reservation = createServer()
  await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  const { port } = reservation.address()
  await new Promise(resolve => reservation.close(resolve))

  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NUXT_|NITRO_)/i.test(key)))
  const child = spawn(process.execPath, [`${output}/server/index.mjs`], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...inherited, NODE_ENV: 'production', NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port), NUXT_PUBLIC_DATA_MODE: mode }
  })
  let rejectedConfig = false
  let exited = false
  const done = new Promise((resolve) => {
    child.once('error', () => resolve(false))
    child.once('close', code => resolve(code !== 0))
  }).then((failed) => {
    exited = true
    return failed
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    rejectedConfig ||= chunk.includes('Live dashboard requires its BFF')
  })
  const get = path => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) })
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const health = await get('/health').catch(() => null)
      if (health) {
        await verify(health, get)
        return
      }
      if (exited) {
        assert(mode === 'live' && rejectedConfig && await done, `${mode} build exited unexpectedly`)
        return
      }
      await setTimeout(200)
    }
    assert.fail(`${mode} build did not report readiness`)
  } finally {
    if (!exited) child.kill()
    await done
  }
}

await checkBuild('.output', 'mock', async (health, get) => {
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'Healthy', mode: 'mock' })
  const deepLink = await get('/catalog')
  assert.equal(deepLink.status, 200)
  const assetPath = /(?:href|src)="(\/_nuxt\/[^"?]+\.(?:js|css))"/.exec(await deepLink.text())?.[1]
  assert(assetPath, 'The catalog entry must reference a built asset')
  const asset = await get(assetPath)
  assert.equal(asset.status, 200)
  await asset.body?.cancel()
})
console.log('mock Node output passed health, deep link and asset checks')

await checkBuild('.output-live', 'live', async (health) => {
  assert.equal(health.status, 503, 'Live output without private configuration must not serve a ready environment')
  await health.body?.cancel()
})
console.log('live Node output rejected missing private configuration')
