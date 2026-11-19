<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: false })

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

type Status = '待审批' | '已批准' | '逾期' | '草稿'
interface Order { id: string; supplier: string; amount: number; status: Status; due: string; owner: string }

const orders: Order[] = [
  { id: 'PO-2026-0184', supplier: '华东精密制造', amount: 128600, status: '待审批', due: '2026-11-20', owner: '林澈' },
  { id: 'PO-2026-0183', supplier: '苏州恒润电子', amount: 46280, status: '已批准', due: '2026-11-18', owner: '周宁' },
  { id: 'PO-2026-0181', supplier: '宁波港联物流', amount: 12600, status: '逾期', due: '2026-11-12', owner: '陈可' },
  { id: 'PO-2026-0179', supplier: '无锡新材科技', amount: 98240, status: '待审批', due: '2026-11-22', owner: '林澈' },
  { id: 'PO-2026-0176', supplier: '上海远见包装', amount: 8750, status: '草稿', due: '2026-11-25', owner: '周宁' },
  { id: 'PO-2026-0172', supplier: '杭州云仓服务', amount: 33800, status: '已批准', due: '2026-11-16', owner: '陈可' },
]
const columns: TableColumn<Order>[] = [
  { accessorKey: 'id', header: '订单号' },
  { accessorKey: 'supplier', header: '供应商' },
  { accessorKey: 'amount', header: '金额' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'due', header: '到期日' },
  { accessorKey: 'owner', header: '负责人' },
]
const money = (value: number) => '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
const query = ref('')
const status = ref('all')
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待审批', value: '待审批' },
  { label: '已批准', value: '已批准' },
  { label: '逾期', value: '逾期' },
]
const filtered = computed(() => orders.filter((order) => {
  const keyword = query.value.trim().toLowerCase()
  const matchQuery = !keyword || order.id.toLowerCase().includes(keyword) || order.supplier.includes(keyword)
  return matchQuery && (status.value === 'all' || order.status === status.value)
}))
const total = computed(() => filtered.value.reduce((sum, order) => sum + order.amount, 0))

const kpis = [
  { label: '本月采购额', value: '¥ 2,486,300', delta: '+8.2%', trend: 'up', note: '较上月' },
  { label: '未结应付', value: '¥ 862,140', delta: '12 笔', trend: 'flat', note: '逾期 2 笔' },
  { label: '库存周转天数', value: '38.4 天', delta: '-2.1 天', trend: 'down', note: '较上月' },
  { label: '订单履约率', value: '96.7%', delta: '+1.4%', trend: 'up', note: '近 30 天' },
]
const revenue = [
  { month: '6 月', income: 186, cost: 132 }, { month: '7 月', income: 204, cost: 141 },
  { month: '8 月', income: 198, cost: 138 }, { month: '9 月', income: 236, cost: 152 },
  { month: '10 月', income: 254, cost: 161 }, { month: '11 月', income: 272, cost: 168 },
]
const trendPoints = (key: 'income' | 'cost') => revenue
  .map((point, index) => (40 + index * 112) + ',' + (200 - (point[key] - 100) * 1.05))
  .join(' ')
const areaPoints = '40,200 ' + trendPoints('income') + ' 600,200'
const inventory = [
  { label: '原材料', value: 78, amount: '¥ 1,024,000' },
  { label: '在制品', value: 46, amount: '¥ 612,400' },
  { label: '成品', value: 63, amount: '¥ 836,900' },
  { label: '低值易耗', value: 24, amount: '¥ 182,300' },
]
const activity = [
  { text: '采购订单 PO-2026-0184 提交审批', who: '林澈', time: '8 分钟前', tone: 'blue' },
  { text: '供应商「苏州恒润电子」银行账户已更新', who: '周宁', time: '32 分钟前', tone: 'green' },
  { text: '销售订单 SO-2026-0912 完成出库', who: '系统', time: '1 小时前', tone: 'green' },
  { text: '应付账款 AP-2026-0441 标记逾期', who: '系统', time: '2 小时前', tone: 'red' },
]
const tasks = ref([
  { id: 't1', label: '审批 3 张采购订单', done: false },
  { id: 't2', label: '核对 11 月银行对账单', done: false },
  { id: 't3', label: '确认供应商「宁波港联」资质', done: true },
])
const activeNav = ref('运营驾驶舱')
const navGroups = [
  { label: '工作台', items: [{ name: '运营驾驶舱', icon: 'i-lucide-layout-dashboard' }] },
  { label: '采购与销售', items: [
    { name: '采购订单', icon: 'i-lucide-shopping-cart' },
    { name: '销售订单', icon: 'i-lucide-receipt-text' },
    { name: '供应商', icon: 'i-lucide-truck' },
    { name: '客户', icon: 'i-lucide-users' },
  ] },
  { label: '库存与财务', items: [
    { name: '库存台账', icon: 'i-lucide-boxes' },
    { name: '总账', icon: 'i-lucide-book-open' },
    { name: '应收应付', icon: 'i-lucide-wallet' },
    { name: '财务报表', icon: 'i-lucide-chart-column' },
  ] },
  { label: '组织', items: [
    { name: '成员', icon: 'i-lucide-user-round' },
    { name: '角色与权限', icon: 'i-lucide-shield-check' },
  ] },
]
</script>

<template>
  <div class="carbon">
    <header class="c-header">
      <div class="c-brand">
        <span class="c-brand-mark" aria-hidden="true">N</span>
        <span class="c-brand-name">Nexora</span>
        <span class="c-env">Carbon 风格原型</span>
      </div>
      <div class="c-crumbs">运营 / 驾驶舱</div>
      <div class="c-header-actions">
        <UButton icon="i-lucide-search" color="neutral" variant="ghost" class="c-icon-btn" aria-label="全局搜索" />
        <UButton icon="i-lucide-bell" color="neutral" variant="ghost" class="c-icon-btn" aria-label="通知" />
        <UButton :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" color="neutral" variant="ghost" class="c-icon-btn" :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'" @click="toggleTheme" />
        <span class="c-header-divider" aria-hidden="true" />
        <span class="c-avatar" aria-hidden="true">AL</span>
        <span class="c-user">Alice Lin</span>
      </div>
    </header>

    <aside class="c-sidenav" aria-label="主导航">
      <div class="c-sidenav-head">
        <span class="c-ws-dot" aria-hidden="true" />
        <div>
          <p class="c-ws-name">远山制造集团</p>
          <p class="c-ws-meta">专业版 · CNY</p>
        </div>
      </div>
      <nav>
        <div v-for="group in navGroups" :key="group.label" class="c-nav-group">
          <p class="c-nav-label">{{ group.label }}</p>
          <button v-for="item in group.items" :key="item.name" type="button" class="c-nav-item" :class="{ 'is-active': activeNav === item.name }" @click="activeNav = item.name">
            <UIcon :name="item.icon" aria-hidden="true" />
            <span>{{ item.name }}</span>
          </button>
        </div>
      </nav>
      <div class="c-sidenav-foot">
        <p>演示数据 · v0.1</p>
        <p>Design reference: IBM Carbon</p>
      </div>
    </aside>

    <main class="c-main">
      <div class="c-notice" role="note">
        <UIcon name="i-lucide-info" aria-hidden="true" />
        <span>独立的 Carbon 风格原型页：复用 Nuxt UI 组件，不影响现有 Odoo 试点与工作台页面。</span>
      </div>

      <div class="c-page-head">
        <div>
          <p class="c-breadcrumb">Nexora / 运营 / 驾驶舱</p>
          <h1>运营驾驶舱</h1>
          <p class="c-page-sub">2026 年 11 月 · 数据截至今日 15:40 · 演示样例</p>
        </div>
        <div class="c-page-actions">
          <UButton variant="outline" color="neutral" class="c-btn c-btn-tertiary" icon="i-lucide-download">导出报表</UButton>
          <UButton color="primary" class="c-btn c-btn-primary" icon="i-lucide-plus">新建采购订单</UButton>
        </div>
      </div>

      <section class="c-kpis" aria-label="关键指标">
        <article v-for="kpi in kpis" :key="kpi.label" class="c-kpi">
          <p class="c-kpi-label">{{ kpi.label }}</p>
          <p class="c-kpi-value">{{ kpi.value }}</p>
          <p class="c-kpi-delta" :class="'is-' + kpi.trend">
            <UIcon :name="kpi.trend === 'up' ? 'i-lucide-arrow-up-right' : kpi.trend === 'down' ? 'i-lucide-arrow-down-right' : 'i-lucide-minus'" aria-hidden="true" />
            <span>{{ kpi.delta }}</span>
            <span class="c-kpi-note">{{ kpi.note }}</span>
          </p>
        </article>
      </section>

      <div class="c-grid c-grid-charts">
        <section class="c-panel" aria-labelledby="revenue-title">
          <div class="c-panel-head">
            <div><h2 id="revenue-title">收入与成本趋势</h2><p>单位：万元 · 近 6 个月</p></div>
            <div class="c-legend"><span><i class="c-dot is-blue" />收入</span><span><i class="c-dot is-purple" />成本</span></div>
          </div>
          <svg class="c-chart" viewBox="0 0 640 220" role="img" aria-label="近六个月收入与成本趋势图">
            <line v-for="y in [40, 80, 120, 160, 200]" :key="'g' + y" x1="40" :y1="y" x2="600" :y2="y" class="c-grid-line" />
            <line v-for="(point, index) in revenue" :key="'x' + index" :x1="40 + index * 112" y1="30" :x2="40 + index * 112" y2="200" class="c-grid-line is-vertical" />
            <polygon :points="areaPoints" class="c-area" />
            <polyline :points="trendPoints('income')" class="c-line is-blue" />
            <polyline :points="trendPoints('cost')" class="c-line is-purple" />
            <circle v-for="(point, index) in revenue" :key="'p' + index" :cx="40 + index * 112" :cy="200 - (point.income - 100) * 1.05" r="3.5" class="c-point" />
            <text v-for="(point, index) in revenue" :key="'t' + index" :x="40 + index * 112" y="216" class="c-axis">{{ point.month }}</text>
            <text x="8" y="44" class="c-axis">280</text><text x="8" y="124" class="c-axis">190</text><text x="8" y="204" class="c-axis">100</text>
          </svg>
        </section>
        <section class="c-panel" aria-labelledby="inventory-title">
          <div class="c-panel-head"><div><h2 id="inventory-title">库存结构</h2><p>按账面价值占比</p></div><span class="c-panel-total">¥ 2.65M</span></div>
          <ul class="c-bars">
            <li v-for="item in inventory" :key="item.label">
              <div class="c-bar-head"><span>{{ item.label }}</span><span>{{ item.amount }}</span></div>
              <div class="c-bar-track"><span class="c-bar-fill" :style="{ width: item.value + '%' }" /></div>
            </li>
          </ul>
          <div class="c-inline-stat"><span>库存准确率</span><strong>98.2%</strong><span class="c-inline-delta">+0.6%</span></div>
        </section>
      </div>

      <section class="c-panel c-table-panel" aria-labelledby="orders-title">
        <div class="c-table-head">
          <div><h2 id="orders-title">待处理采购订单</h2><p>共 {{ filtered.length }} 笔 · 金额合计 ¥ {{ total.toLocaleString('zh-CN') }}</p></div>
          <div class="c-table-tools">
            <UInput v-model="query" icon="i-lucide-search" placeholder="搜索订单号或供应商" class="c-input c-search" />
            <USelect v-model="status" :items="statusOptions" class="c-input c-select" />
            <UButton variant="outline" color="neutral" class="c-btn c-btn-tertiary" icon="i-lucide-sliders-horizontal">筛选</UButton>
          </div>
        </div>
        <UTable :data="filtered" :columns="columns" :get-row-id="order => order.id" class="c-table">
          <template #amount-cell="{ row }"><span class="c-amount">{{ money(row.original.amount) }}</span></template>
          <template #status-cell="{ row }"><span class="c-tag" :class="'is-' + row.original.status"><i aria-hidden="true" />{{ row.original.status }}</span></template>
          <template #id-cell="{ row }"><span class="c-order-id">{{ row.original.id }}</span></template>
          <template #due-cell="{ row }"><span :class="{ 'c-overdue': row.original.status === '逾期' }">{{ row.original.due }}</span></template>
        </UTable>
        <div class="c-table-foot">
          <span>显示 1–{{ filtered.length }} 笔，共 128 笔</span>
          <div class="c-pager">
            <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-chevron-left" disabled aria-label="上一页" />
            <span class="c-page-current">1</span>
            <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-chevron-right" aria-label="下一页" />
          </div>
        </div>
      </section>

      <div class="c-grid c-grid-bottom">
        <section class="c-panel" aria-labelledby="activity-title">
          <div class="c-panel-head"><div><h2 id="activity-title">最近活动</h2><p>跨模块审计事件</p></div><UButton variant="ghost" color="neutral" size="xs" class="c-link-btn">查看全部</UButton></div>
          <ul class="c-activity">
            <li v-for="event in activity" :key="event.text">
              <i class="c-activity-dot" :class="'is-' + event.tone" aria-hidden="true" />
              <div><p>{{ event.text }}</p><span>{{ event.who }} · {{ event.time }}</span></div>
            </li>
          </ul>
        </section>
        <section class="c-panel" aria-labelledby="tasks-title">
          <div class="c-panel-head"><div><h2 id="tasks-title">我的待办</h2><p>{{ tasks.filter(task => !task.done).length }} 项未完成</p></div><UButton variant="ghost" color="neutral" size="xs" class="c-link-btn">管理</UButton></div>
          <ul class="c-tasks">
            <li v-for="task in tasks" :key="task.id"><UCheckbox v-model="task.done" :label="task.label" class="c-check" /></li>
          </ul>
          <div class="c-quick">
            <p class="c-quick-label">快捷入口</p>
            <div class="c-quick-grid">
              <button type="button"><UIcon name="i-lucide-file-plus" aria-hidden="true" />录入采购单</button>
              <button type="button"><UIcon name="i-lucide-banknote" aria-hidden="true" />登记付款</button>
              <button type="button"><UIcon name="i-lucide-clipboard-check" aria-hidden="true" />库存盘点</button>
              <button type="button"><UIcon name="i-lucide-chart-no-axes-combined" aria-hidden="true" />经营报表</button>
            </div>
          </div>
        </section>
      </div>

      <footer class="c-foot"><span>Nexora ERP · Carbon 风格原型</span><span>网格 8px · 圆角 2px · IBM Plex Sans · 无阴影</span></footer>
    </main>
  </div>
</template>

<style scoped>
.carbon {
  --c-bg: #f4f4f4; --c-layer: #ffffff; --c-layer-2: #f4f4f4; --c-border: #e0e0e0; --c-border-strong: #8d8d8d;
  --c-text: #161616; --c-text-2: #525252; --c-text-3: #6f6f6f; --c-shell: #161616; --c-shell-text: #f4f4f4;
  --c-nav-text: #c6c6c6; --c-nav-hover: #353535; --c-nav-active: #393939; --c-blue: #0f62fe; --c-blue-hover: #0043ce;
  --c-purple: #8a3ffc; --c-green: #24a148; --c-red: #da1e28; --c-yellow: #f1c21b;
  min-height: 100vh; display: grid; grid-template-columns: 256px minmax(0, 1fr); grid-template-rows: 48px minmax(0, 1fr);
  grid-template-areas: "header header" "nav main"; background: var(--c-bg); color: var(--c-text);
  font-family: "IBM Plex Sans", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 14px; line-height: 1.43; letter-spacing: 0.16px;
}
html.dark .carbon {
  --c-bg: #161616; --c-layer: #262626; --c-layer-2: #393939; --c-border: #393939; --c-border-strong: #6f6f6f;
  --c-text: #f4f4f4; --c-text-2: #c6c6c6; --c-text-3: #8d8d8d; --c-blue: #4589ff; --c-blue-hover: #78a9ff;
  --c-purple: #a56eff; --c-green: #42be65; --c-red: #fa4d56;
}
.c-header { grid-area: header; display: flex; align-items: center; gap: 16px; padding: 0 16px 0 0; background: var(--c-shell); color: var(--c-shell-text); border-bottom: 1px solid #393939; }
.c-brand { display: flex; align-items: center; gap: 10px; width: 256px; height: 48px; padding: 0 16px; flex: none; }
.c-brand-mark { display: grid; place-items: center; width: 24px; height: 24px; background: var(--c-blue); color: #fff; font-size: 13px; font-weight: 600; border-radius: 2px; }
.c-brand-name { font-size: 14px; font-weight: 600; }
.c-env { margin-left: 4px; padding: 1px 6px; font-size: 10px; line-height: 16px; color: #c6c6c6; border: 1px solid #525252; border-radius: 2px; white-space: nowrap; }
.c-crumbs { flex: 1; min-width: 0; font-size: 12px; color: #c6c6c6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-header-actions { display: flex; align-items: center; gap: 2px; }
.c-header-divider { width: 1px; height: 20px; margin: 0 8px; background: #525252; }
.c-user { margin-left: 8px; font-size: 12px; color: #c6c6c6; white-space: nowrap; }
.carbon .c-icon-btn { width: 40px; height: 40px; border-radius: 0; background: transparent; color: #c6c6c6; }
.carbon .c-icon-btn:hover { background: #353535; color: #fff; }
.c-avatar { display: grid; place-items: center; width: 28px; height: 28px; background: #393939; color: #f4f4f4; border-radius: 2px; font-size: 11px; font-weight: 600; }
.c-sidenav { grid-area: nav; display: flex; flex-direction: column; min-height: 0; background: var(--c-shell); color: var(--c-nav-text); border-right: 1px solid #393939; overflow-y: auto; }
.c-sidenav-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #393939; }
.c-ws-dot { width: 8px; height: 8px; flex: none; background: var(--c-green); border-radius: 50%; }
.c-ws-name { margin: 0; font-size: 12px; font-weight: 600; color: #f4f4f4; }
.c-ws-meta { margin: 2px 0 0; font-size: 11px; color: #8d8d8d; }
.c-nav-group { padding: 12px 0 4px; }
.c-nav-label { margin: 0; padding: 6px 16px; font-size: 11px; font-weight: 600; letter-spacing: 0.32px; color: #8d8d8d; }
.c-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; height: 40px; padding: 0 16px; font: inherit; font-size: 13px; color: var(--c-nav-text); background: transparent; border: 0; border-left: 3px solid transparent; cursor: pointer; text-align: left; }
.c-nav-item:hover { background: var(--c-nav-hover); color: #f4f4f4; }
.c-nav-item.is-active { background: var(--c-nav-active); color: #fff; border-left-color: var(--c-blue); }
.c-nav-item :deep(svg) { width: 16px; height: 16px; flex: none; opacity: 0.9; }
.c-sidenav-foot { margin-top: auto; padding: 16px; font-size: 10px; line-height: 1.6; color: #6f6f6f; border-top: 1px solid #393939; }
.c-sidenav-foot p { margin: 0; }
.c-main { grid-area: main; min-width: 0; padding: 24px 40px 40px; overflow-x: hidden; }
.c-notice { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: var(--c-text-2); background: var(--c-layer); border: 1px solid var(--c-border); border-left: 3px solid var(--c-blue); border-radius: 2px; }
.c-notice :deep(svg) { width: 16px; height: 16px; flex: none; margin-top: 1px; color: var(--c-blue); }
.c-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.c-breadcrumb { margin: 0 0 6px; font-size: 12px; color: var(--c-text-2); }
.c-page-head h1 { margin: 0; font-size: 28px; font-weight: 400; line-height: 1.29; }
.c-page-sub { margin: 6px 0 0; font-size: 13px; color: var(--c-text-2); }
.c-page-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.c-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin-bottom: 24px; background: var(--c-border); border: 1px solid var(--c-border); }
.c-kpi { padding: 16px; background: var(--c-layer); }
.c-kpi-label { margin: 0; font-size: 12px; color: var(--c-text-2); }
.c-kpi-value { margin: 8px 0 10px; font-size: 30px; font-weight: 400; line-height: 1.2; font-variant-numeric: tabular-nums; }
.c-kpi-delta { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 12px; color: var(--c-text-2); }
.c-kpi-delta :deep(svg) { width: 14px; height: 14px; }
.c-kpi-delta.is-up { color: var(--c-green); }
.c-kpi-delta.is-down { color: var(--c-blue); }
.c-kpi-note { color: var(--c-text-3); }
.c-grid { display: grid; gap: 16px; margin-bottom: 16px; }
.c-grid-charts { grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); }
.c-grid-bottom { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
.c-panel { min-width: 0; padding: 16px; background: var(--c-layer); border: 1px solid var(--c-border); border-radius: 2px; }
.c-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.c-panel-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1.375; }
.c-panel-head p { margin: 2px 0 0; font-size: 12px; color: var(--c-text-2); }
.c-panel-total { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.c-legend { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--c-text-2); }
.c-legend span { display: inline-flex; align-items: center; gap: 6px; }
.c-dot { width: 8px; height: 8px; border-radius: 50%; }
.c-dot.is-blue { background: var(--c-blue); }
.c-dot.is-purple { background: var(--c-purple); }
.c-chart { display: block; width: 100%; height: auto; overflow: visible; }
.c-grid-line { stroke: var(--c-border); stroke-width: 1; }
.c-grid-line.is-vertical { stroke-dasharray: 2 4; opacity: 0.7; }
.c-area { fill: var(--c-blue); opacity: 0.1; }
.c-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.c-line.is-blue { stroke: var(--c-blue); }
.c-line.is-purple { stroke: var(--c-purple); }
.c-point { fill: var(--c-layer); stroke: var(--c-blue); stroke-width: 2; }
.c-axis { fill: var(--c-text-3); font-size: 10px; text-anchor: middle; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; }
.c-bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.c-bar-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 12px; }
.c-bar-head span:last-child { color: var(--c-text-2); font-variant-numeric: tabular-nums; }
.c-bar-track { height: 8px; background: var(--c-border); overflow: hidden; }
.c-bar-fill { display: block; height: 100%; background: var(--c-blue); }
.c-inline-stat { display: flex; align-items: baseline; gap: 8px; margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--c-border); font-size: 12px; color: var(--c-text-2); }
.c-inline-stat strong { font-size: 20px; font-weight: 400; color: var(--c-text); }
.c-inline-delta { color: var(--c-green); }
.c-table-panel { padding: 16px 0 0; margin-bottom: 16px; }
.c-table-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 0 16px 16px; }
.c-table-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
.c-table-head p { margin: 2px 0 0; font-size: 12px; color: var(--c-text-2); }
.c-table-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.carbon .c-input { width: 210px; }
.carbon .c-input :deep(input) { height: 32px; padding: 0 10px; font-size: 13px; color: var(--c-text); background: var(--c-layer-2); border: 0; border-bottom: 1px solid var(--c-border-strong); border-radius: 0; box-shadow: none; }
.carbon .c-input :deep(input):focus { outline: 2px solid var(--c-blue); outline-offset: -2px; }
.carbon .c-input :deep(input)::placeholder { color: var(--c-text-3); }
.carbon .c-select { width: 132px; }
.carbon .c-select :deep(button) { height: 32px; padding: 0 10px; font-size: 13px; background: var(--c-layer-2); border: 0; border-bottom: 1px solid var(--c-border-strong); border-radius: 0; box-shadow: none; color: var(--c-text); }
.carbon .c-select :deep(button):focus { outline: 2px solid var(--c-blue); outline-offset: -2px; }
.carbon .c-btn { height: 40px; padding: 0 16px; font-size: 14px; font-weight: 400; border-radius: 2px; box-shadow: none; }
.carbon .c-btn-primary { background: var(--c-blue); color: #fff; border: 1px solid var(--c-blue); }
.carbon .c-btn-primary:hover { background: var(--c-blue-hover); border-color: var(--c-blue-hover); color: #fff; }
.carbon .c-btn-tertiary { background: transparent; color: var(--c-blue); border: 1px solid var(--c-blue); }
.carbon .c-btn-tertiary:hover { background: var(--c-blue); color: #fff; }
.carbon .c-link-btn { height: 24px; padding: 0 2px; color: var(--c-blue); border-radius: 2px; }
.carbon .c-table :deep(table) { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.carbon .c-table :deep(thead th) { height: 40px; padding: 0 16px; font-size: 12px; font-weight: 600; text-align: left; color: var(--c-text); background: var(--c-border); border-bottom: 1px solid var(--c-border-strong); white-space: nowrap; }
.carbon .c-table :deep(thead th:nth-child(3)) { text-align: right; }
.carbon .c-table :deep(tbody td) { height: 48px; padding: 0 16px; color: var(--c-text); border-bottom: 1px solid var(--c-border); white-space: nowrap; }
.carbon .c-table :deep(tbody tr:hover td) { background: var(--c-layer-2); }
.carbon .c-table :deep(tbody tr:last-child td) { border-bottom: 0; }
.c-amount { display: block; text-align: right; font-variant-numeric: tabular-nums; }
.c-order-id { color: var(--c-blue); font-variant-numeric: tabular-nums; }
.c-overdue { color: var(--c-red); }
.c-tag { display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; font-size: 11px; line-height: 20px; border-radius: 10px; white-space: nowrap; border: 1px solid transparent; }
.c-tag i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.c-tag.is-待审批 { color: #8e6a00; background: #fcf4d6; border-color: #f1c21b; }
.c-tag.is-已批准 { color: #0e6027; background: #defbe6; border-color: #42be65; }
.c-tag.is-逾期 { color: #a2191f; background: #fff1f1; border-color: #fa4d56; }
.c-tag.is-草稿 { color: var(--c-text-2); background: var(--c-layer-2); border-color: var(--c-border-strong); }
html.dark .c-tag.is-待审批 { color: #f1c21b; background: #3d2f05; border-color: #8e6a00; }
html.dark .c-tag.is-已批准 { color: #42be65; background: #0e2b18; border-color: #24a148; }
html.dark .c-tag.is-逾期 { color: #fa4d56; background: #3b0d10; border-color: #a2191f; }
.c-table-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; font-size: 12px; color: var(--c-text-2); border-top: 1px solid var(--c-border); }
.c-pager { display: flex; align-items: center; gap: 4px; }
.c-page-current { display: grid; place-items: center; width: 24px; height: 24px; font-size: 12px; color: #fff; background: var(--c-blue); border-radius: 2px; }
.c-activity { list-style: none; margin: 0; padding: 0; }
.c-activity li { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--c-border); }
.c-activity li:last-child { border-bottom: 0; }
.c-activity-dot { width: 8px; height: 8px; margin-top: 5px; flex: none; border-radius: 50%; background: var(--c-text-3); }
.c-activity-dot.is-blue { background: var(--c-blue); }
.c-activity-dot.is-green { background: var(--c-green); }
.c-activity-dot.is-red { background: var(--c-red); }
.c-activity p { margin: 0; font-size: 13px; }
.c-activity span { display: block; margin-top: 2px; font-size: 11px; color: var(--c-text-3); }
.c-tasks { list-style: none; margin: 0; padding: 0; }
.c-tasks li { padding: 6px 0; border-bottom: 1px solid var(--c-border); }
.c-tasks li:last-child { border-bottom: 0; }
.carbon .c-check :deep(button) { border-radius: 2px; border-color: var(--c-border-strong); background: transparent; }
.carbon .c-check :deep(label) { font-size: 13px; color: var(--c-text); }
.c-quick { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--c-border); }
.c-quick-label { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.32px; color: var(--c-text-3); }
.c-quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--c-border); border: 1px solid var(--c-border); }
.c-quick-grid button { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 10px; font: inherit; font-size: 12px; color: var(--c-text); background: var(--c-layer); border: 0; cursor: pointer; text-align: left; }
.c-quick-grid button:hover { background: var(--c-layer-2); }
.c-quick-grid :deep(svg) { width: 14px; height: 14px; color: var(--c-blue); }
.c-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; padding-top: 12px; font-size: 11px; color: var(--c-text-3); border-top: 1px solid var(--c-border); }
@media (max-width: 1180px) {
  .c-grid-charts, .c-grid-bottom { grid-template-columns: minmax(0, 1fr); }
  .c-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .carbon { grid-template-columns: 1fr; grid-template-rows: 48px auto minmax(0, 1fr); grid-template-areas: "header" "nav" "main"; }
  .c-brand { width: auto; }
  .c-sidenav { max-height: none; border-right: 0; border-bottom: 1px solid #393939; }
  .c-sidenav-head, .c-sidenav-foot { display: none; }
  .c-sidenav nav { display: flex; overflow-x: auto; padding: 2px 8px; }
  .c-nav-group { display: flex; align-items: center; padding: 0; }
  .c-nav-label { display: none; }
  .c-nav-item { width: auto; height: 36px; border-left: 0; border-bottom: 3px solid transparent; white-space: nowrap; }
  .c-nav-item.is-active { border-left: 0; border-bottom-color: var(--c-blue); }
  .c-main { padding: 16px; }
  .c-page-head, .c-table-head { flex-direction: column; align-items: flex-start; }
  .c-table-tools { justify-content: flex-start; width: 100%; }
  .carbon .c-input { width: 100%; flex: 1 1 160px; }
  .c-foot { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 560px) {
  .c-kpis { grid-template-columns: minmax(0, 1fr); }
  .c-crumbs, .c-user, .c-env { display: none; }
  .c-page-actions { width: 100%; flex-wrap: wrap; }
  .c-table-tools { flex-direction: column; align-items: stretch; }
  .carbon .c-select { width: 100%; }
}
</style>
