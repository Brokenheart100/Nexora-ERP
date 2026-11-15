<script setup lang="ts">
interface Presentation {
  legalName: string
  brandName: string
  accentColor: string
  dateFormat: string
  timeZone: string
  logoDataUrl: string | null
}
interface Settings {
  baseCurrency: string; version: number; presentation: Presentation
  sessionIdleMinutes: number; roleGrantApprovals: number; canManage: boolean
}
interface Link { personalWorkspaceId: string; isLinked: boolean }
const props = defineProps<{ workspaceId: string; personalWorkspaces: { id: string; name: string }[] }>()
const emit = defineEmits<{ navigate: [id: string] }>()
const path = computed(() => `/bff/api/workspaces/${props.workspaceId}`)
const settings = shallowRef<Settings>()
const draft = ref<Presentation>()
const idleMinutes = ref(30)
const grantApprovals = ref('1')
const approvalOptions = [{ label: '1 位所有者批准', value: '1' }, { label: '2 位所有者批准', value: '2' }]
const links = shallowRef<Link[]>([])
const personalId = ref('')
const notice = ref('')
const busy = ref(false)
const dateFormatOptions = [
  { label: '年-月-日', value: 'yyyy-MM-dd' },
  { label: '日/月/年', value: 'dd/MM/yyyy' },
  { label: '中文日期', value: 'yyyy年MM月dd日' },
]
const personalOptions = computed(() => props.personalWorkspaces.map(workspace => ({ label: workspace.name, value: workspace.id })))
function setTrimmed(field: 'legalName' | 'brandName' | 'timeZone', value: string | number) {
  if (!draft.value) return
  draft.value[field] = String(value).trim()
}

const datePreview = computed(() => {
  if (!draft.value) return ''
  const { timeZone, dateFormat } = draft.value
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return dateFormat.replace('yyyy', values.year!).replace('MM', values.month!).replace('dd', values.day!)
  } catch { return '请输入有效时区' }
})

async function refresh() {
  const [loaded, related] = await Promise.all([
    $fetch<Settings>(`${path.value}/settings`, { retry: 0 }),
    $fetch<Link[]>(`${path.value}/personal-links`, { retry: 0 }),
  ])
  settings.value = loaded
  draft.value = { ...loaded.presentation }
  idleMinutes.value = loaded.sessionIdleMinutes ?? 30
  grantApprovals.value = String(loaded.roleGrantApprovals ?? 1)
  links.value = related
  personalId.value ||= props.personalWorkspaces[0]?.id ?? ''
}

async function show() {
  busy.value = true
  notice.value = ''
  try { await refresh() }
  catch { settings.value = undefined; draft.value = undefined; links.value = []; notice.value = '暂时无法读取公司设置。' }
  finally { busy.value = false }
}

async function put<T>(suffix: string, body: object) {
  const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
  return $fetch<T>(`${path.value}${suffix}`, {
    method: 'PUT', headers: { 'X-CSRF-TOKEN': csrf.requestToken }, body, retry: 0,
  })
}

async function save() {
  if (busy.value || !settings.value || !draft.value) return
  busy.value = true
  notice.value = ''
  try {
    settings.value = await put<Settings>('/settings', {
      expectedVersion: settings.value.version,
      presentation: draft.value,
      sessionIdleMinutes: idleMinutes.value,
      roleGrantApprovals: Number(grantApprovals.value),
    })
    draft.value = { ...settings.value.presentation }
    idleMinutes.value = settings.value.sessionIdleMinutes ?? 30
    grantApprovals.value = String(settings.value.roleGrantApprovals ?? 1)
    notice.value = '公司设置已保存。'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    notice.value = status === 409 ? '设置版本已更新，请刷新后再编辑。'
      : status === 400 ? '请核对名称、时区、日期格式、自动登出分钟、审批人数与 PNG 标志。'
      : '未能确认保存，请刷新公司设置核对结果。'
  } finally { busy.value = false }
}

async function chooseLogo(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !draft.value) return
  if (file.type !== 'image/png' || file.size > 128 * 1024) {
    input.value = ''
    notice.value = '请选择不超过 128 KiB 的 PNG。'
    return
  }
  busy.value = true
  try {
    const logo = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    if (draft.value) draft.value.logoDataUrl = logo
  } catch { notice.value = '无法读取标志文件。' }
  finally { busy.value = false }
}

async function setLink(linked: boolean) {
  if (!personalId.value || busy.value) return
  const id = personalId.value
  busy.value = true
  notice.value = ''
  try {
    const result = await put<Link>(`/personal-links/${id}`, { isLinked: linked })
    links.value = links.value.filter(link => link.personalWorkspaceId !== id)
    if (result.isLinked) links.value = [...links.value, result]
    notice.value = linked ? '个人工作区已关联。' : '关联已解除。'
  } catch { notice.value = '未能确认关联状态，请刷新后核对。' }
  finally { busy.value = false }
}

onMounted(() => { void show().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section class="card settings" aria-labelledby="settings-heading">
    <h2 id="settings-heading"><UIcon class="heading-icon" name="i-lucide-building" aria-hidden="true" />公司设置</h2>
    <button class="quiet" :disabled="busy" @click="show">{{ settings ? '刷新公司设置' : '打开公司设置' }}</button>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="settings && draft">
      <form @submit.prevent="save">
        <fieldset :disabled="busy || !settings.canManage">
          <legend>公司资料与品牌</legend>
          <UFormField label="法定名称" name="legalName" required>
            <UInput :model-value="draft.legalName" required maxlength="160" @update:model-value="value => setTrimmed('legalName', value)" />
          </UFormField>
          <UFormField label="品牌名称" name="brandName" required>
            <UInput :model-value="draft.brandName" required maxlength="160" @update:model-value="value => setTrimmed('brandName', value)" />
          </UFormField>
          <label>品牌颜色<input v-model="draft.accentColor" type="color"></label>
          <UFormField label="公司时区" name="timeZone" required>
            <UInput :model-value="draft.timeZone" required maxlength="80" placeholder="Asia/Shanghai" @update:model-value="value => setTrimmed('timeZone', value)" />
          </UFormField>
          <UFormField label="日期格式" name="dateFormat">
            <USelect v-model="draft.dateFormat" :items="dateFormatOptions" />
          </UFormField>
          <label>自动登出（闲置分钟）
            <input v-model.number="idleMinutes" type="number" min="1" max="480" required>
          </label>
          <p class="hint">成员可访问多个工作区时，登录会话按所有工作区的最短闲置时间自动登出，并在到期提示中显示来源。</p>
          <UFormField label="自定义角色授权审批" name="roleGrantApprovals">
            <USelect v-model="grantApprovals" :items="approvalOptions" />
          </UFormField>
          <p class="hint">设为 2 时，角色授权需两位不同的所有者批准后生效；提交人不能批准自己的申请。</p>
          <label v-if="settings.canManage">公司标志<input type="file" accept="image/png" @change="chooseLogo"></label>
          <p class="preview" :style="{ borderColor: draft.accentColor }">
            <img v-if="draft.logoDataUrl" :src="draft.logoDataUrl" alt="公司标志预览">
            <strong>{{ draft.brandName }}</strong><span>{{ datePreview }} · {{ settings.baseCurrency }}</span>
          </p>
          <div v-if="settings.canManage" class="actions">
            <button class="primary">保存公司设置</button>
            <button v-if="draft.logoDataUrl" class="quiet" type="button" @click="draft.logoDataUrl = null">移除标志</button>
          </div>
        </fieldset>
      </form>
      <h3>个人工作区快捷入口</h3>
      <p v-if="!personalWorkspaces.length">先创建个人工作区，再建立快捷入口。</p>
      <div v-else-if="settings.canManage" class="actions">
        <UFormField label="个人工作区">
          <USelect v-model="personalId" :items="personalOptions" :disabled="busy" />
        </UFormField>
        <button class="quiet" :disabled="busy" @click="setLink(true)">建立关联</button>
        <button class="quiet" :disabled="busy" @click="setLink(false)">解除关联</button>
      </div>
      <ul v-if="links.length">
        <li v-for="link in links" :key="link.personalWorkspaceId">
          <button class="quiet" @click="emit('navigate', link.personalWorkspaceId)">
            前往 {{ personalWorkspaces.find(workspace => workspace.id === link.personalWorkspaceId)?.name ?? '个人工作区' }}
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.settings { margin-top: 20px; min-width: 0 }
fieldset { margin: 16px 0; border: 1px solid #d1d9e6; border-radius: 8px; padding: 12px; display: grid; gap: 10px; min-width: 0 }
label { display: grid; gap: 4px }
select { font: inherit; padding: 8px; border: 1px solid #d1d9e6; border-radius: 6px; background: white }
input[type="color"] { width: 60px; height: 38px; padding: 4px }
.actions { display: flex; flex-wrap: wrap; align-items: end; gap: 10px }
.preview { margin: 0; border-left: 4px solid; padding: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px }
.preview img { width: 40px; height: 40px; object-fit: contain }
</style>
