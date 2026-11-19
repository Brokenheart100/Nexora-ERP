# F36 捐赠确认单补发与正式票据手动关联

## 本地流程

- 入口为「账簿 → 打开账簿设置 → 打开资金工作台」，在已过账的捐赠单据下打开「捐赠票据与邮件」。财务复核权限可发送和补发普通确认单，也可录入正式票据。具备账簿读取权限的成员可查看已关联的票据资料。
- 初发和补发使用现有 Finance 持久投递流程。提交时校验收件地址属于有效捐赠人档案，附件沿用普通确认单的编号与 PDF。补发保留与原投递的关联，重复提交复用原记录。SMTP 已接受时显示 `sent`，结果未知的补发需要人工确认。
- 每笔已过账且未冲销的捐赠可关联一张已经开具的正式票据，记录代码、号码与开具日期。号码保留前导零，同一工作区的代码与号码组合唯一。捐赠冲销后，已关联的票据和普通确认单仍可查阅。
- 用票主体资格、财政票据开具与更正渠道联调、真实 SMTP 投递均待独立验收。

## 本地复现

从仓库根目录运行。使用 Aspire 自带的 Mailpit 和本地 Keycloak OIDC / TOTP。使用已有账簿验证增量迁移时，Finance 启动会应用 `DonationReceiptDeliveryAndLinks`。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
dotnet ef migrations has-pending-model-changes --project src/Services/Finance/Nexora.Finance.Infrastructure --startup-project src/Services/Finance/Nexora.Finance.Api --context FinanceDbContext --configuration Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 150 --non-interactive
$env:NEXORA_TEST_F36_MAILPIT = '1'
$env:NEXORA_TEST_P4_MAILPIT = '1'
pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require|P4 sales, inventory' --reporter=list --output '../../../artifacts/p1/runtime/f36-browser'
aspire stop --apphost $appHost --non-interactive
```

## 2026-11-16 验收结果

| 项目 | 本地结果 |
| --- | --- |
| 普通确认单 | 经浏览器提交初发、刷新投递状态并补发。Mailpit 捕获两封邮件，两份附件的文件名沿用同一确认单编号，附件类型为 `application/pdf`，下载内容以 `%PDF-` 开头。补发记录关联原投递，同一操作重放未增加第三封邮件。 |
| 正式票据 | 经浏览器录入并读取关联详情。创建返回 `201` 与可访问的 `Location`，相同操作重放返回原记录，重复关联返回 `409`，开具日期早于捐赠日期返回 `400`。捐赠冲销后仍能读取原关联，新的邮件请求被拒绝。 |
| 权限与并发 | 制单角色无法发送邮件或关联票据，未登记捐赠人邮箱被拒绝，其他工作区无法读取该关联。发票投递接口无法操作捐赠投递。捐赠投递详情返回 `ETag`，旧版本的 `If-Match` 返回 `412`。开发环境 OpenAPI 已核对新增路由与写入头。 |
| 回归与迁移 | Finance 增量迁移已在本地数据库应用，EF Core 无待生成的模型变更。Release 构建和 62 项 .NET 测试通过。Nuxt 类型检查、构建及新增组件 lint 通过。Playwright 的 F36 用例与 P4 权责发生制、收付实现制两条现有发票用例均通过。 |
