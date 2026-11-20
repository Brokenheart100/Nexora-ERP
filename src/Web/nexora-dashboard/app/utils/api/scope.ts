export interface ScopeIdentity {
  mode: string
  subject: string
  workspaceId: string
  authorizationVersion: string
}

export class ScopeChangedError extends Error {
  constructor() { super('身份、工作区或权限已变化，请重新读取当前数据。') }
}

export class RequestScope {
  private controller = new AbortController()
  private generation = 0
  identity: ScopeIdentity

  constructor(identity: ScopeIdentity) { this.identity = { ...identity } }

  change(identity: ScopeIdentity) {
    if (JSON.stringify(identity) === JSON.stringify(this.identity)) return
    this.controller.abort()
    this.controller = new AbortController()
    this.generation++
    this.identity = { ...identity }
  }

  capture() { return { generation: this.generation, signal: this.controller.signal } }

  demand(snapshot: { generation: number }) {
    if (snapshot.generation !== this.generation) throw new ScopeChangedError()
  }

  key(resource: string, filters: unknown = null) {
    return JSON.stringify([this.identity.mode, this.identity.subject, this.identity.workspaceId, this.identity.authorizationVersion, resource, filters])
  }
}
