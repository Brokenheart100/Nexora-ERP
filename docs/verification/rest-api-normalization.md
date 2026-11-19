# REST API 规范化本地验收

变更覆盖 Sales、Purchasing、Inventory、MasterData、Finance、Organization 和 Reporting。浏览器业务请求通过 Nitro BFF 和 YARP 到达目标服务，各服务继续执行自己的权限与数据范围检查。

## 契约范围

| 服务 | 核对项 |
| --- | --- |
| Sales | 报价和订单创建位置、订单条件写入、异步履约许可和可轮询位置、订单与许可分页。 |
| Purchasing | 采购订单创建位置、接收许可返回 `202`、订单和许可的版本门禁、幂等重放、错误响应和列表分页。 |
| Inventory | 仓库与库存操作创建位置、同步收发退与库存工作流、版本门禁、库存不足错误、仓库范围与流水查询。 |
| MasterData | 分类、计量单位、商品和往来单位的创建位置，版本标签、条件写入、并发、输入校验、工作区隔离和分页。 |
| Finance | 账簿初始化和同步审批结果、凭证和单据创建位置、持久化导入预览、导出和邮件任务、期间门禁、金额字符串以及 CSV 和 PDF。 |
| Organization | 工作区与邀请创建、成员治理版本、计费去重和配额、成员与邀请分页及既有审计分页。 |
| Reporting | 工作区投影返回 `200` 或带轮询位置和 `Retry-After` 的 `202`。无权访问返回 `404`，授权服务不可用返回 `503`。该端点按 ID 读取一条投影。 |

- 持久化的资源或任务创建返回 `201`，异步签发许可返回 `202`。导入验证失败且无预览记录时，`200` 返回校验明细。已有同步工作流返回当前结果。
- 支持请求头的接口继续接受旧正文中的 `operationId` 和对应版本。新旧字段同时使用时值须一致。带版本请求头的冲突返回 `412`，单用旧正文时维持原有 `409`。共享适配器接受单个带双引号的整数版本，Sales 订单采用已验收的完整条件匹配。
- 分页以已有响应结构向客户端返回，权限和数据范围用于确定可见集合。分页后的账龄明细继续使用完整的汇总金额。
- 已发布的 `/api/...` 路径以及浏览器 `/bff/api/...` 入口继续服务原客户端。未来的破坏性调整按[架构中的版本策略](../架构.md)发布。

## 复现

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 120 --non-interactive
pwsh -NoProfile -File scripts/p1/Test-OpenApiContracts.ps1
$env:NEXORA_TEST_P4_MAILPIT = '1'
pnpm --dir src/Web/nexora-web test:e2e --grep 'Catalog UI and API|Workspace invitation|Chart hierarchy|Opening, journal approval|Purchase orders require|P4 sales, inventory'
pnpm --dir src/Web/nexora-web test:e2e --grep 'Billing plans enforce'
aspire stop --apphost $nexoraAppHost --non-interactive
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
```

发票邮件验证使用本机 Mailpit。仅在 AppHost 使用该本机渠道时设置 `NEXORA_TEST_P4_MAILPIT`。

## 2026-11-15 本地结果

- Release 构建通过，0 个警告、0 个错误。60 个 .NET 测试通过，包含 Reporting 的授权拒绝、依赖不可用、投影待就绪与完成用例，以及 Organization 生成的 OpenAPI 接受请求头代替正文值。
- Aspire 本地网关就绪，7 个业务服务的 10 项 OpenAPI 检查通过。脚本也验证了财务金额字符串和网关匿名请求的 `401`、`WWW-Authenticate` 与 ProblemDetails。
- 已验证目录创建及权限、幂等、并发更新，成员邀请与权限生效，科目预览的创建位置，以及总账审批、期间并发、冲销和报表。
- 采购链路验证了订单重放、独立审批、并发签发许可、轮询位置、收货与退货、应付、银行导入和总账闭环。
- 6 项串行浏览器回归全部通过。销售闭环覆盖订单并发与幂等、仓库版本冲突、库存履约、应收、PDF、CSV 任务、发票邮件任务创建位置及 Mailpit 投递。另分别通过了工作区登录与投影读写、往来单位权限与状态回归。
- 计费浏览器回归通过。验证了请求头与旧正文共用一次配额预留，以及套餐降级后的限额拒绝、稳定错误码、模块门禁和付款后的权限恢复。
- Nuxt typecheck 和生产构建在按锁文件安装的独立副本中通过，避免影响正在运行的前端实例。类型检查仍输出已有的 `vue-router/volar/sfc-route-blocks` 插件解析提示，退出码为 0。
