# Nexora ERP

面向商贸 / 批发 / 零售的 ERP。后端采用 .NET 10、Aspire、Wolverine、Clean Architecture、DDD 与 CQRS，前端采用 Nuxt 4、Vue 3 与 TypeScript strict。

P1 已跑通真实 OIDC + TOTP 登录、BFF 服务端会话、工作区创建、事务 Outbox、RabbitMQ 与 Reporting 投影。

已增加 **邮箱开通、一次性邀请与工作区统一授权**。用户可用邮箱验证码注册和登录，创建公司后通过邮件邀请员工。受邀员工使用同一邮箱注册或登录后兑换邀请。自定义业务角色与完整范围模型仍在计划中。

**P2 商品目录**已接入工作区。选中工作区后点击「打开商品目录」，即可查看商品与服务。Owner 和 Administrator 可新增分类、计量单位和项目，并编辑或停用项目。

同一工作区还可打开「往来单位」，管理客户、供应商、捐赠人和联系人。一条往来档案可以承担多种身份。[往来单位验收](docs/verification/p2-partners.md)

在工作区打开「公司设置」可维护品牌及日期偏好。企业和个人工作区可在「账簿设置」中初始化自己的币种、年度与起始科目。[账簿验收](docs/verification/p2-books.md)

「账簿设置」还提供科目层级、归档与导入、税组和历史税额快照。企业账簿通过独立的制单与复核角色办理期初、手工凭证、冲销和期间关账。财务角色在公司侧栏的「团队与成员」申请及审批。[科目验收](docs/verification/p2-chart.md) · [税组验收](docs/verification/p2-tax.md) · [总账验收](docs/verification/p2-ledger.md)

P3 在企业工作区接通采购审批、收货许可、实收计价、采购退货、应付与供应商退款。账簿设置中的资金工作台支持银行及现金账户、对账单导入与审核、捐赠过账。[P3 端到端验收](docs/verification/p3-purchase-to-ledger.md)

P4 在企业工作区提供「销售报价与订单」「客户开票与应收」和库存发货入口。启用销售制单 / 审批角色后，可办理报价转单、批量预留、分批发货、发票与收款核销、退货贷项和退款。应收工作台还提供品牌 PDF、限时分享、邮件状态和周期开票。

P5 已接入工作区「财务报表」。可查询权责发生制的试算平衡表、利润表和资产负债表，比较上期、钻取凭证、导出 CSV 和打印。[P5 报表验收](docs/verification/p5-accrual-statements.md)

- [架构](docs/架构.md)
- [实施计划与 TODO](docs/计划.md)
- [依赖与版本](docs/依赖.md)
- [P1 运行方式、验证证据与剩余项](docs/verification/p1-foundation.md)
- [成员、邀请与统一授权验收](docs/verification/p1-membership-authorization.md)
- [本地 PostgreSQL 布局与数据迁移](docs/verification/postgres-consolidation.md)
- [依赖就绪、AMQP 权限与本地故障回归](docs/verification/p1-platform-readiness.md)
- [P2 商品目录与数据库升级](docs/verification/p2-catalog.md)

新版 Dashboard 独立入口为 **https://localhost:7444**，资源 `dashboard` 使用端口 `3002`；模拟预览保留 `3001`。独立构建、运行配置和当前接入范围见 [Dashboard README](src/Web/nexora-dashboard/README.md) 与 [D1/D2 验收](docs/verification/dashboard-d1-d2.md)。

## 本地运行

准备 .NET SDK 10.0.402、Aspire CLI 13.6.5、Node 24.21.0、pnpm 12.16.1、PowerShell 7（`pwsh`，AppHost 的 `identity-onboarding` 使用）、可用的 Linux Docker 引擎和受信任的 ASP.NET 开发证书。当前本地浏览器测试使用 Windows Edge。

Windows 上如果 `identity-onboarding` 报 `could not assign process ... to cleanup job: Access is denied`，检查是否使用了 Microsoft Store / MSIX 版 PowerShell。本机复现中，其执行别名和包内实体程序都受到 DCP 清理 Job 的进程分配限制。可使用微软官方 ZIP 版 PowerShell 7，并在 AppHost 的本机 User Secrets 中把 `Tools:PowerShellExecutable` 设置为该版本 `pwsh.exe` 的完整路径。机器路径留在本地，默认环境仍可直接使用 `pwsh`。[安装与恢复验证](docs/verification/aspire-powershell-startup.md)

```powershell
dotnet tool restore
dotnet restore Nexora.slnx --locked-mode
Push-Location src/Web/nexora-web
pnpm install --frozen-lockfile
Pop-Location
pnpm --dir src/Web/nexora-dashboard install --frozen-lockfile
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
# 从 P1 的既有 PostgreSQL 卷首次升级时执行：
# pwsh scripts/p2/Initialize-CatalogDatabase.ps1
# 既有卷首次启用 Finance 时执行：
# pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database financedb
# 既有卷首次启用 Purchasing 时执行
# pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database purchasingdb
# 既有卷首次启用 Inventory 时执行
# pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database inventorydb
# 既有卷首次启用 Sales 时执行
# pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database salesdb
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 150 --non-interactive
```

在 Aspire Dashboard 打开 `gateway`，或访问 **https://localhost:7443**。首次使用点「邮箱注册」，之后点「登录 Nexora」接收六位验证码。默认开发环境启动 [Mailpit](http://localhost:8025) 捕获本机邮件，验证码和邀请邮件在 **http://localhost:8025** 查看。

登录后创建或选中公司，打开侧栏的「团队与成员」。填写员工邮箱并选择工作区角色，按需选权限预设或跨财务、采购、销售勾选业务角色，每个模块可选一个。包含业务角色的邀请由另一位所有者批准后发送邮件，员工用受邀邮箱注册或登录后接受邀请。已有成员通过「编辑权限」申请或撤销业务角色，新增授权由另一位所有者批准。侧栏的「角色与权限」可查看内置角色的权限明细。

在「角色与权限」可新建或编辑自定义角色，逐项勾选权限。在「团队与成员」的「自定义角色授权」选择成员、角色和数据范围，再由另一位所有者批准。部门范围用于采购和销售订单，仓库范围用于库存读取。部门可在同一页面创建，仓库来自库存模块。

浏览器访问 Nuxt 开发端口 `3000` 时会自动转到网关入口。BFF 随 Nuxt 运行在 Nitro 中，代码位于 `src/Web/nexora-web/server/`。Keycloak 本地入口为 **https://localhost:8088**。点「开发账号登录」可使用 `alice` / `bob` 的密码加验证器流程，密码在 Aspire Dashboard 的 `demo-alice-password` / `demo-bob-password` 参数中查看。升级前已登录的浏览器需要重新登录，以建立 Nitro 会话。

参数沿用 AppHost 的 UserSecretsId，数据库使用持久卷。`artifacts/p1/runtime/` 包含本地 realm 导入与浏览器测试 MFA 种子，属于敏感开发数据，已忽略。AppHost 在 Keycloak 启动后运行 `identity-onboarding`，通过管理 API 更新 BFF 的认证流程和 SMTP 设置。已存在的账号和工作区数据继续使用原有卷。

AppHost 默认通过 Aspire Community Toolkit 的 `AddMailPit` 启动 Mailpit。可从 Aspire Dashboard 打开 `mailpit` 收件箱，或访问 `http://localhost:8025`。未配置外部渠道时，发票邮件也投递到该收件箱。P4 的 SMTP 故障注入使用同仓库捕获器，见 [P4 验收记录](docs/verification/p4-sales-to-ledger.md)。

可在 AppHost 的 User Secrets 设置 `OnboardingMail:Host`、`OnboardingMail:Port`（默认 `587`）、`OnboardingMail:From` 和 `OnboardingMail:Username`，需要认证时将 SMTP 密码配置为 `Parameters:onboarding-smtp-password`。外部 SMTP 使用 STARTTLS。开发环境生成的邀请链接指向本机 BFF，适合同一台机器上验证。

本地 PostgreSQL 使用一个 `postgres` 实例（端口 `6543`、卷 `nexora-postgres-data`）。Organization、Reporting、Keycloak、MasterData、Finance、Purchasing、Sales 和 Inventory 各使用独立数据库与账号。新卷首次启动时自动初始化，既有卷可使用上述升级脚本补建账号。

验证与停止：

```powershell
pwsh scripts/p1/Test-Foundation.ps1
# 已启动 AppHost，并需执行真实登录 / 页面验收时：
pwsh scripts/p1/Test-Foundation.ps1 -Browser
# 已启动 AppHost，验证运行依赖及 AMQP 权限：
pwsh scripts/p1/Test-Platform.ps1
# 会短暂停止并恢复本项目 RabbitMQ / PostgreSQL / Redis / Keycloak：
pwsh scripts/p1/Test-Platform.ps1 -Faults
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

发票 PDF 需要准备固定字体和对应的 Chromium。先构建 Finance，再执行以下命令。本机邮件默认投递到 AppHost 的 Mailpit；外部 SMTP 凭据与故障注入见 [P4 验收记录](docs/verification/p4-sales-to-ledger.md)。

```powershell
python -m pip install fonttools==4.62.1
pwsh scripts/p4/Initialize-InvoiceFont.ps1
pwsh src/Services/Finance/Nexora.Finance.Api/bin/Release/net10.0/playwright.ps1 install chromium --only-shell
```

当前 AppHost 只提供本地示例身份与资源，发布操作会明确拒绝；生产 realm、密钥保护、迁移作业和部署配置仍在计划中。
