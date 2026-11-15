import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicDir = join(root, 'public', 'icons')
const jobs = [
  { svg: 'nexora.svg', out: 'nexora-192.png', size: 192 },
  { svg: 'nexora.svg', out: 'nexora-512.png', size: 512 },
  { svg: 'nexora-maskable.svg', out: 'nexora-maskable-512.png', size: 512 },
]
const browser = await chromium.launch({ channel: 'msedge' })
try {
  for (const job of jobs) {
    const svg = readFileSync(join(publicDir, job.svg), 'utf8')
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 })
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:' + job.size + 'px;height:' + job.size + 'px}</style></head><body>' + svg + '</body></html>')
    await page.screenshot({ path: join(publicDir, job.out), omitBackground: true })
    await page.close()
    console.log('wrote', job.out, job.size)
  }
} finally {
  await browser.close()
}
