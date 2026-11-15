# P1 成员、邀请与统一授权验收

日期：2026-11-06。状态：工作区治理切片已本地验证；P1 整体仍在进行。当前使用内置治理角色和整个工作区范围，不以此替代自定义业务角色、敏感业务政策或完整数据范围模型。

## 交付范围

| 能力 | 当前实现 |
| --- | --- |
| 账号映射 | `UserAccount` 按 issuer + subject 唯一；首次成功创建工作区 / 兑换邀请时建立，已验证邮箱只作资料快照，不按邮箱合并身份 |
| 成员管理 | Owner / AccessAdministrator / WorkspaceReader，工作区范围；加入、角色变更、停用、恢复、本人可访问工作区列表 |
| 最后治理人员 | 至少保留一个有效 Owner / 管理员；聚合版本控制并发，冲突返回 409，无原创建者永久旁路 |
| 邀请 | 24 小时、256 bit 随机令牌、数据库 SHA-256 哈希、创建时一次显示、兑换 / 撤销、重复 / 过期 / 身份不符拒绝 |
| 受邀身份 | 使用验签 token 中的已验证邮箱及相同 issuer；兑换绑定实际 subject，客户端提交 Actor / Role 不能替换该依据 |
| 授予限制 | Administrator 只能授予 / 管理普通 Reader，不能提升自己或治理管理员；所有内置角色均无财务权限 |
| 统一授权 | 纯 `IApplicationAuthorization` 端口，检查账号、当前成员、TenantId / WorkspaceId、操作；HTTP policy 与应用层复查，未知权限默认拒绝 |
| 消息入口 | Wolverine 生成 middleware 依据 receiver 的 listener / ReceivedAt 拒绝队列用户意图；接受事实使用独立契约，不信任任意 UserName / Actor header |
| 撤销 / 事件 | 当前不缓存授权；新请求读取权威状态。成员 / 邀请、授权版本、审计及 `WorkspaceAuthorizationChangedV1` Outbox 同事务提交 |
| Reporting | 每次回查明确的 `reports.workspace.read`，停用后拒绝；异步水位只记录观察版本，不作为授权依据；权威不可用返回 503 |
| Nuxt | 创建 / 兑换 / 撤销邀请、内置治理角色、停用 / 恢复及工作区切换；按权限展示管理入口，切换时隔离旧响应 |

本轮记录的邀请交付方式是复制邀请码后手工转交。2026-11-12 已在此基础上加入 Keycloak 邮箱注册和邮件邀请，新增流程及验证见 [邮箱开通与邀请](p1-email-onboarding.md)。

## 一致性与身份边界

Workspace 根拥有成员和邀请子实体，领域方法封装权限授予、最后治理人员、重复和状态规则；UserAccount 为独立身份映射。两个节点可以各自读到旧的两位 Owner，但根版本使第二个冲突事务整体回滚，不能都停用成功。成员状态必须显式提交；遗漏 `IsActive` 返回 400，避免被默认值意外停用。

原 `OwnerIssuer` / `OwnerSubject` 保留为创建者与创建操作幂等依据，授权使用当前有效成员。新查询端口为 `ListAccessibleAsync`，Reader / Administrator 加入后也能看到所属工作区。

幂等重放也会重新授权：创建者失去成员资格后，重放旧的 `POST /api/workspaces` 创建意图返回 404，不能绕过 GET 授权读取旧工作区；校验放在返回已有结果及比较名称之前。应用回归与真实 HTTP 测试均覆盖此边界。

邀请提案不会保留已撤销的授予权：兑换时重新检查邀请者账号、成员及授予权限。已加入或已停用的成员不能凭新邀请绕过显式治理。单次兑换由状态、成员唯一键和根并发版本共同保护，重复兑换返回明确冲突。

令牌不出现在 GET 列表、审计、授权事件中；创建响应采用 `no-store`，兑换命令的 `ToString()` 脱敏。兑换限流为每个经过验证的 issuer / subject、每节点 20 次 / 分钟，超限 429；这是本地保护，不声称已做分布式全局限流。

令牌创建响应丢失时不重新读取明文；先核对列表，撤销后以新操作编号创建。兑换响应丢失时刷新工作区列表核对结果，不自动重发写请求。成员与权限变更冲突时重新加载后再决定，前端所有写操作 `retry: 0`。

`IApplicationAuthorization` 提供业务授权，不充当认证器。HTTP Actor 来自 JwtBearer 验签后的 ClaimsPrincipal；进程内调用方也须提供经过认证边界的上下文。序列化 Actor 本身不构成身份凭据，因此当前用户治理命令拒绝 listener / 排队执行；未来需要异步新用户意图时，必须单独建立凭据验证适配器。

## 迁移与持久化

- Organization：`20261106044032_WorkspaceGovernance` 新增账号、成员、邀请以及审计目标 / 授权版本；将历史工作区创建者回填为账号及有效 Owner，没有删除工作区。
- Reporting：`AuthorizationWatermarks` 新增观察水位表；重复 / 旧版本不降低水位，并对投影的并发 / 唯一键竞争配置有界重试。
- 邀请与成员变更由显式 DbContext 的 Wolverine `[Transactional]` adapter 执行，应用层不引用 EF / Wolverine / ASP.NET；纯契约不共享持久化模型。
- 当前 Development 自动执行迁移；生产仍需独立迁移作业与备份 / 回退验收，不将删除成员数据的 Down 迁移当作无损回退。

## API 摘要

以下均在业务 API 上，浏览器经同源 `/bff` 前缀访问：

| 路径 | 行为 |
| --- | --- |
| `GET /api/me` | 当前 ERP 账号映射；尚未建立映射时 404 |
| `GET /api/workspaces` | 仅当前账号的有效成员工作区 |
| `GET /api/workspaces/{id}/access` | 当前权限、治理角色、租户与授权版本 |
| `GET /api/workspaces/{id}/authorization/{permission}` | 权威操作检查；非成员 404、无权操作 403 |
| `GET /api/workspaces/{id}/members` | 授权的治理成员查询 |
| `GET /api/workspaces/{id}/roles` | 当前内置治理角色目录，不等同于调用方可转授全部角色 |
| `GET /api/workspaces/{id}/invitations` | 邀请状态，不返回令牌或哈希 |
| `POST /api/workspaces/{id}/invitations` | OperationId、ExpectedVersion、Email、Role；成功返回一次性 token |
| `POST /api/invitations/{id}/redeem` | 只提交 token，身份取可信上下文 |
| `POST /api/workspaces/{id}/members/{memberId}` | 显式提交 ExpectedVersion、Role、IsActive |
| `POST /api/workspaces/{id}/invitations/{invitationId}/revoke` | ExpectedVersion 与作用域内邀请 |

## 本地验证

| 检查 | 实际结果 |
| --- | --- |
| 锁定恢复 | `dotnet restore --locked-mode`、`pnpm install --frozen-lockfile` 通过，无新增第三方包 |
| Debug / Release | 全 solution 构建均 0 警告 / 0 错误；后端各 **20/20** |
| 领域 / 应用 / 边界 | 账号不按邮箱合并、未知权限 / 财务权限拒绝、受邀邮箱 / issuer / token / 到期 / 重复 / 撤销、停用与授予限制、端点认证和用户命令 marker 防遗漏 |
| 真实 PostgreSQL / RabbitMQ | 4 个复合流程：原事务投影、成员生命周期、最后 Owner 并发快照、历史升级；包含审计故障整体回滚、跨工作区子资源、失效授权、新鲜版本、授权事实水位及限流 |
| 真实队列伪造 | 测试隔离队列接收伪造 Owner Actor，生成的 middleware 拒绝，没有新邀请；进入 RabbitMQ 原生 `wolverine-dead-letter-queue`，不是错误地断言 PostgreSQL dead-letter 表 |
| 授权依赖故障 | 独立负向测试：HTTP 连接失败返回 503，投影读取次数为 0，不用旧投影绕过权威检查 |
| 前端 | strict 类型检查、生产构建通过 |
| Playwright / Edge | **2/2**：原 OIDC + TOTP / CSRF / 工作区 / 注销；新增邀请 / 兑换、Reader 管理入口拒绝、管理员分配、保持登录时停用拒绝、恢复、撤销与重新邀请 |
| 可视检查 | 1440×1000 与 390×844；成员页面无横向溢出，截图不含一次性邀请码 |
| 远端 / 发布 | CI 已配置但未执行远端 Actions；没有生产发布 |

后端组件流程使用测试专用 AuthenticationStub，真实认证另由浏览器用例验证；不能把 stub 当成 Keycloak 验签证据。首次 RuntimeCompilation 冷启动曾超过旧的 5 秒断言，浏览器现使用有界 30 秒期望和正常条件等待；静态生成与性能验收继续由 P1-04 跟踪。

Windows Debug 全量构建必须在本 AppHost 及其进程退出后执行；运行期间曾出现文件锁，已正常停止并等待退出后完成构建，没有删除 bin / obj 或强制终止服务。`Test-Foundation.ps1` 使用独立 Release 目录，适合在 Debug AppHost 运行时验证。

源码：[领域与治理](../../src/Services/Organization/Nexora.Organization.Domain/Aggregates/Workspaces/Workspace.cs)、[应用用例 / 授权](../../src/Services/Organization/Nexora.Organization.Application/UseCases/Governance/GovernanceUseCases.cs)、[HTTP 适配](../../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/GovernanceEndpoints.cs)、[消息 guard](../../src/Services/Organization/Nexora.Organization.Infrastructure/Messaging/Middleware/LocalUserCommandGuard.cs)、[集成测试](../../tests/Nexora.Tests/GovernanceSliceTests.cs)、[浏览器用例](../../src/Web/nexora-web/e2e/workspace.spec.ts)。

产物：[脱敏汇总](../../artifacts/p1/membership-validation.json)、[浏览器结果](../../artifacts/p1/browser-results.json)、[桌面](../../artifacts/p1/members-desktop.png)、[移动](../../artifacts/p1/members-mobile.png)。TRX / 运行日志保存在被忽略的本地 test-results / runtime 目录；不上传 MFA 种子或含邀请码的失败页面。

## 复现与剩余项

依 [README](../../README.md) 启动并等待 BFF healthy，然后执行：

```powershell
pwsh scripts/p1/Test-Foundation.ps1 -Browser
```

当前脚本覆盖全体后端 Release 测试、锁定安装、类型检查、构建与两条真实浏览器流程。若复验 Debug，先正常停止本 AppHost 并等待资源退出，避免 Windows 文件锁。浏览器验证身份与 MFA 种子沿用本机 runtime 目录；不要在真实业务库执行测试。

仍待：自定义 BusinessRole / 多角色与细分范围、敏感业务授予政策、权益与审计查询、机器账户最小权限 / 受控重放、全局账号 / 会话撤销、协调刷新、真实邀请邮件与注册 / OTP / Google / 恢复产品。当前无授权缓存，所以没有声称已验证跨节点缓存失效。P1 其他静态生成、Saga / 延时 / 崩溃恢复和生产配置也继续保留为待办，见 [计划 TODO](../计划.md)。

依据：[ASP.NET Core 资源授权](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based?view=aspnetcore-10.0)、[Wolverine middleware](https://wolverinefx.io/guide/handlers/middleware)、[Wolverine HTTP 安全](https://wolverinefx.io/guide/http/security.html)。具体签名以本项目已解析程序集和编译 / 运行结果核实。
