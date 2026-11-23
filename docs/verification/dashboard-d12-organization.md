# D12 组织、计费与审计验收

日期为 2026-11-22。范围为新版 `src/Web/nexora-dashboard` 的工作区管理、订阅、专项审计和记录变更。页面通过同源 Nitro BFF 请求现有服务，组织授权和套餐权益分别取自后端。

## 接入范围

| 入口 | 行为 |
| --- | --- |
| 工作区菜单与 `/setup` | 新建企业工作区与个人账本。企业初始化读取公司资料和 D7 账簿状态，可刷新后继续开账，并从账簿状态跳到财务科目、期初导入和税务。 |
| `/settings` 公司与成员 | 公司资料使用独立设置版本。个人账本链接可解除。成员页读取内置角色，提交启停、组织角色、采购、销售、财务单项角色与组合角色操作。通知抽屉读取当前工作区的公告。 |
| `/settings?tab=invitations` 与 `/join` | 邀请列表、详情、独立批准和撤销。邮件携带片段链接，Dashboard 在当前标签页保留片段供登录回跳后主动兑换。邮件和兑换状态由服务返回。 |
| 角色、部门与治理 | 自定义角色显示当前版本。授权范围按权限目录求交集，可选择公司、部门、仓库或会计期间。显示申请期限、批准人数和已批准的权限快照。 |
| `/settings?tab=billing` | 读取套餐、报价、账单与权益。报价变动后再次确认。登记付款引用、取消订阅或从开发环境恢复已开始的测试结账。 |
| `/change-log`、设置审计和 `/purchase-audit` | 组织、采购、销售、财务专项审计，以及上述服务和主数据、库存的业务记录变更。按来源和条件查询，记录变更使用服务端分页与 CSV。CSV 按生效筛选导出每个服务最多 5,000 条。可识别来源支持工作区内回链。 |

组织写入按后端使用 `If-Match`，需要幂等的端点使用 `Idempotency-Key`。新建工作区和兑换邀请按账号隔离请求。未收到明确写入结果时先读取服务端记录。可重试的端点保留原操作标识供当前页面手动重试。快照脱敏在通用记录变更读取层执行，覆盖既有记录及 CSV。新快照捕获时排除凭据字段。

## 本地复现

从仓库根目录运行。真实入口为 `https://localhost:7444`，邮箱使用本机 Mailpit 捕获的测试地址。邀请链接的公开地址随 AppHost 启动配置生效。

```powershell
$nexoraD12Host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire wait gateway --apphost $nexoraD12Host --timeout 120 --non-interactive
$nexoraD12Resource = aspire describe dashboard --apphost $nexoraD12Host --format json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $nexoraD12Resource.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d12-administration-ui.spec.ts
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d12-administration.msw.spec.ts
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard typecheck
dotnet test tests/Nexora.Tests/Nexora.Tests.csproj -c Release --no-restore --filter 'FullyQualifiedName~RecordChangeCaptureTests|FullyQualifiedName~Record_changes_redact_historical|FullyQualifiedName~Invitation_email_uses|FullyQualifiedName~CustomRolePolicyTests|FullyQualifiedName~GovernanceDomainTests|FullyQualifiedName~BillingProrationTests|FullyQualifiedName~Membership_invitation_and_application_authorization_lifecycle'
dotnet build src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj -c Release --no-restore
```

```powershell
$env:NUXT_PUBLIC_DATA_MODE = 'mock'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
Remove-Item Env:NUXT_PUBLIC_DATA_MODE
```

正在运行的 AppHost 保持启动时的配置。本轮在 Mailpit 核对了既有配置生成的邀请，并在新版入口验证相同邀请的回跳与兑换。隔离的 SMTP 集成测试验证了 `https://localhost:7444/join` 的新链接，AppHost Release 构建包含该配置。现有本地进程下次启动时加载新地址。

## 验收结果

| 检查 | 本地结果 |
| --- | --- |
| 真实 Edge、Nitro、Gateway 与业务服务 | 3 项通过。覆盖企业与个人工作区、链接和解除、开账及刷新恢复、设置版本 `412`、最后所有者约束、六源变更查询、导出与来源回链。 |
| 邀请与范围授权 | 真实浏览器验证独立批准、邮箱不匹配与重复兑换、成员停用、独立批准财务角色、部门范围及仓库和会计期间的范围内外读取和撤销。后端测试验证过期、撤销、公告的时间和权限过滤及双人审批条件。 |
| 订阅 | 真实浏览器验证敏感设置 MFA、测试结账刷新恢复、重复确认、取消订阅、付款引用与权益生效。MSW 验证报价更新后等待重新确认。 |
| MSW | 2 项通过。覆盖公司版本、公告、审计分页、相同筛选范围的 CSV 和报价变化。 |
| 后端 | 21 项通过，包含新捕获与历史快照的凭据字段脱敏、CSV 筛选与脱敏、SMTP 邀请公开地址验证。AppHost Release 构建通过，0 警告 0 错误。 |
| 前端 | 171 项单测通过。Nuxt 类型检查、变更文件 ESLint，以及 mock 和 live 的 Nitro Node 构建通过。 |
