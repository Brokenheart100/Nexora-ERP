# P1 公司成员与业务角色

2026-11-12 在 Windows 本地 Aspire 环境验证。浏览器经 API Gateway 和 BFF 访问 Organization、Purchasing、Sales，登录由 Keycloak 提供，验证码和邀请邮件由 Mailpit 捕获。

## 操作与验证

| 场景 | 结果 |
| --- | --- |
| 公司侧栏 | 选中公司后可打开独立的「团队与成员」和「角色与权限」。角色页面刷新后仍加载路由对应的公司。 |
| 邀请与审批 | 选择「采购与销售制单」预设并勾选「财务制单」。提交后进入待审批，页面未显示邀请码，Mailpit 未收到邀请。发起人自批返回 403。另一位所有者批准后收到邮件，重复审批返回 409。 |
| 员工加入 | 使用受邀邮箱在 Keycloak 注册并接受邀请。采购和销售服务的订单列表返回 200，财务制单权限生效，采购审批权限返回 403。 |
| 成员权限编辑 | 从采购制单换为采购审批时，独立审批前保留原授权。自批和无权限修改返回 403，同模块角色冲突返回 400，旧授权版本审批返回 409。另一位所有者批准后，采购审批生效，采购制单撤销。 |
| 即时撤销 | 取消财务制单后，下一次检查立即返回 403，已获准的销售制单权限仍有效。 |
| 权限明细 | 「角色与权限」从 Organization 的角色目录读取权限。采购审批显示 `purchasing.order.approve`，公司只读成员访问角色目录返回 403。 |
| 数据库升级 | 现有 Organization 数据库应用 `20261112090355_BusinessRoleApprovals`，EF 模型与迁移快照一致。 |

现有财务、采购、销售业务角色可组合，每个模块可选一个。业务角色邀请待审批时有效 24 小时，批准后重新起算 24 小时兑换期。已有成员新增或替换角色时，申请绑定工作区授权版本。授权版本变化后须重新核对并提交。

## 复现

按 [README](../../README.md) 启动 AppHost 后运行以下命令。

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
$organization = 'src/Services/Organization/Nexora.Organization.Infrastructure'
dotnet ef migrations has-pending-model-changes --project $organization --startup-project $organization --context OrganizationDbContext --configuration Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire wait gateway --apphost $appHost --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'Team and roles pages|Email registration, company creation|incorrect email registration code|Workspace invitation, role assignment'
```

Release 后端构建 0 警告、0 错误，.NET 测试 31 项通过。4 项本地浏览器测试通过，覆盖新流程、邮件注册与已有账号加入、错误验证码，以及既有角色修改、停用与恢复。自定义角色、部门与仓库范围、生产邮件投递继续按 P1 验收。

前端类型检查、构建和本次变更文件的 ESLint 均以 0 退出。类型检查输出了 `vue-router/volar/sfc-route-blocks` 插件路径提示。
