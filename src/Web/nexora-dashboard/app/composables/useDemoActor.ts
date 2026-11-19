import { computed, ref } from 'vue'

export type DemoActorRole = 'maker' | 'approver'

export interface DemoActor {
  id: string
  name: string
  title: string
  role: DemoActorRole
}

const actorOptions: DemoActor[] = [
  { id: 'u-1001', name: '张明远', title: '业务经办', role: 'maker' },
  { id: 'u-1004', name: '陈立', title: '业务主管', role: 'approver' }
]

/**
 * 单据制单与审批的演示身份。仅影响界面按钮与本地状态机，
 * 真实职责分离由服务端按操作者、角色和单据版本校验。
 */
export function useDemoActor() {
  const actorRole = ref<DemoActorRole>('maker')
  const actor = computed(() => actorOptions.find(item => item.role === actorRole.value) ?? actorOptions[0]!)
  const isMaker = computed(() => actorRole.value === 'maker')
  const isApprover = computed(() => actorRole.value === 'approver')

  function setActorRole(role: DemoActorRole) {
    actorRole.value = role
  }

  return { actorOptions, actorRole, actor, isMaker, isApprover, setActorRole }
}
