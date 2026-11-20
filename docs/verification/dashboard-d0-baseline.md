# Dashboard D0：界面、联调环境与契约基线

2026-11-19。用户要求开始 D0，以当前新版界面作为接入起点。D0-01–04 已完成基线工作及模板格式门禁修正；API 元数据缺口已记录，随所属接入波次复验。对应 [接入 TODO](../ui-dashboard-api-integration-todolist.md#d0-确认接入范围与联调基线)。

## 1. 界面范围与版本

- 项目：`src/Web/nexora-dashboard/`，Nuxt UI、Carbon 主题及既有布局。旧 `nexora-web` 作为已运行的 BFF 和契约参照，本次未修改其代码。
- Git：`main`，HEAD `eb06469eacda6351cb2cb66e7495bd3a5e14cb9d`。新版有既有未提交界面改动，因此同时保存工作树标识，未将 HEAD 描述为包含全部界面修改的提交。
- 218 个源码/配置文件的接入起点 SHA-256：`0e05f5a65f8bfaa4982052751370e77d200c0386f0db7ab25690689407d0c115`。逐文件摘要见 [初始 UI 清单](../../artifacts/dashboard-d0/ui-manifest.json)，排除依赖和构建产物；相对上述 HEAD 的修改见 [初始工作树补丁](../../artifacts/dashboard-d0/ui-working-tree.patch)。
- 为恢复 lint 门禁，对 13 个既有 UI 文件运行现有 ESLint 格式修正。全部 111 个 Vue 文件的非空白内容摘要保持一致，见 [格式核对](../../artifacts/dashboard-d0/format-check.json)。最终工作树 SHA-256 为 `659efb8421ab7684388f8ecba6c353ba2dae4dd207a5fbbc0ca44ca9b0105ed1`，见 [最终清单](../../artifacts/dashboard-d0/ui-manifest-after-lint.json) 与 [最终补丁](../../artifacts/dashboard-d0/ui-working-tree-after-lint.patch)。
- [C 清单](../ui-dashboard-backend-todolist.md) 的 C1–C23 共 67 个原型子项已勾选，所引用的本地源文件均存在。既有交互验收见 [原型记录](web-ui-dashboard-prototype.md)；本次运行 70 项单元测试、类型检查和构建。本次未重跑全部 C 浏览器脚本。

逐项接入核对如下。表中的“已有”均指模拟数据原型，真实权限、金额及流程状态以后端响应为准。

| C 项 | 已有承载 | 接入前需要核对或补充的交互 | 对应阶段 |
| --- | --- | --- | --- |
| C1 采购到付款（5 项） | 采购列表、收货抽屉、供应商应付面板 | 真实版本、许可异步等待、账单与部分付款读回 | D4 |
| C2 销售到收款（5 项） | 报价、订单、履约、发票与收款面板 | 预留/发货许可、收款核销与贷项来源 | D5 |
| C3 收发货与商品表单（3 项） | 商品表单、库存任务和执行抽屉 | 商品引用版本、仓库许可修订号及异常结果 | D3–D6 |
| C4 初始化与授权（2 项） | `setup`、治理面板、权限摘要 | 真实工作区、身份和权益，替换演示权限映射 | D1、D3、D12 |
| C5 期初与导出（2 项） | Opening、ReportExports | 预览/提交 ID、异步任务和文件响应 | D7、D11 |
| C6 退货（3 项） | StockReturn、贷项和退款抽屉 | 原实收/实发来源、冲销与可退数量 | D6 |
| C7 作废与对账更正（3 项） | BankRecon、资金/付款操作 | 原流水版本、作废关联和更正记录 | D8 |
| C8 期初追溯（3 项） | Opening 与凭证来源入口 | 期初批次、来源行及真实入账结果 | D7 |
| C9 定期开票（2 项） | RecurringTable/Plan/Form | 真实调度状态、计划版本及下一次执行时间 | D9 |
| C10 外部凭证（2 项） | ImportedJournals | 导入预览、50 张批次限制及独立过账结果 | D7 |
| C11 捐赠收据（3 项） | Donations、寄送记录 | 普通收据/财政票据能力、渠道与重寄状态 | D8、D9 |
| C12 单据与往来（4 项） | 采购/销售详情和 partners 页面 | 单据版本、部门范围、多身份档案与停用引用 | D3–D5 |
| C13 仓库与调拨（2 项） | WarehouseOperations、盘点/调拨抽屉 | 接收人、源/目标仓权限、在途状态 | D6 |
| C14 资金与流水（3 项） | Treasury、BankRecon | 科目映射、银行余额字符串、对账版本 | D8 |
| C15 总账与年结（5 项） | AccountTree、JournalPanel、Closing | 期间版本、过账水位与合伙份额 | D7 |
| C16 税务（2 项） | Tax/TaxCenter | 适用日期、税率快照、申报更正与日历锁定 | D10 |
| C17 编号与发票交付（3 项） | InvoiceDelivery、PDF/分享预览 | 正式编号、PDF 二进制、分享令牌及邮件状态 | D9 |
| C18 报表与投影（3 项） | Reports、ReportingCenter、AgingLedger | 正式期间、水位、分页、钻取和 CSV | D11 |
| C19 工作区治理（4 项） | WorkspaceMenu、GovernanceCenter、邀请面板 | 真实邀请回跳、授权版本、范围和公告过滤 | D3、D12 |
| C20 审计（2 项） | AuditCenter、ChangeLogTimeline | 服务实际支持的筛选、分页和来源记录 | D12 |
| C21 计费（2 项） | BillingPanel | 实际报价、权益/权限分开处理及支付环境 | D12 |
| C22 账户与设备（2 项） | 账户设备页、CLI/MCP 授权页 | 新 BFF 会话、MFA、用途令牌与撤销 | D1、D13 |
| C23 助手（2 项） | assistant 页面与会话/工具卡片 | 真实能力、SSE、审批、取消/恢复和授权 | D13 |

进入真实模式前需要的公共交互：401 恢复会话、403/隐藏式 404、CSRF/MFA 反馈、加载与空态、取消在途请求、版本冲突后保留输入、结果待确认和 202 回查。真实客户端、查询键和模拟模式隔离在 D1、D2 实现。

## 2. 联调环境与专用样例

本次通过精确指定的 `src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj` 启动。CLI `17.0.0`，AppHost SDK `13.6.5`，.NET SDK `10.0.402`，Node `24.21.0`，pnpm `12.16.1`；未升级工程依赖。

Gateway、七个业务服务、Keycloak、Redis、PostgreSQL、RabbitMQ、Mailpit 及八个数据库就绪。停止前的 [13 个核心资源快照](../../artifacts/dashboard-d0/resources.json) 均为 Running/Healthy。`Test-Platform.ps1` 的服务连接串检查、基础健康/存活/匿名入口检查和 4 项 AMQP 权限探针通过；未使用 `-Faults`。这验证当前依赖与 listener 就绪，交易消息的实际交付/恢复仍由 D4–D6 验收。

使用既有 HTTPS BFF `https://localhost:7443` 完成真实 OIDC/TOTP、邮箱验证码登录及业务 API 初始化。邮箱仅使用本机 Mailpit 捕获的 `.invalid` 测试地址；密码、MFA 种子及会话均不写入下方公开产物。

| 样例 | 记录 |
| --- | --- |
| 主工作区 | `01a1f3f6-2a50-7be4-bf0b-1416976b93da`，`Nexora Dashboard D0 20261119131912` |
| 无权工作区 | `01a1f3f6-5fca-79ff-97b7-2f3cda2208d8`，只属于 Alice；其他三位成员不可见，Bob 详情查询为 404 |
| 制单 | `alice@nexora.invalid`：采购/销售操作、Accountant；组织 Owner 不代替业务角色 |
| 独立复核 | `bob@nexora.invalid`：PurchasingApprover、SalesApprover、FinanceReviewer；角色授权由另一位 Owner 批准 |
| 收货人 | `dashboard-d0-receiver-20261119131912@example.invalid`：WorkspaceReader，加指定主仓的库存只读授权，并被仓库指派为 receiver；仓库详情 `canReceive=true` |
| 只读成员 | `dashboard-d0-reader-20261119131912@example.invalid`：WorkspaceReader，加同一主仓的库存只读授权；`canReceive=false`，有效往来单位创建请求返回 403 |
| 部门 | `01a1f3f6-368a-77f6-bbb4-d606987ad206`，D0 商贸联调部门；本轮制单/复核授权为公司范围，部门受限样例在 D3 验收 |
| 仓库 | `01a1f3f6-4ed6-7643-8169-769ae1f0dc78`，`D0-MAIN`；收货人与只读成员的库存查询授权均限此仓 |
| 账簿与期间 | CNY，2026-01-01 起账；2026-01 开放、版本 1。财务角色为公司范围，本次没有声称验证按期间限制的授权 |
| 交易配置 | 已初始化采购暂估/应付和销售应收科目映射、银行控制科目及 `D0-BANK`；银行余额 `"0"` 为字符串 |
| 主数据 | `D0-SKU-001`、`D0-SUP`、`D0-CUS`、类别和单位，以及 13% 的 `D0-TAX` 样例税组；税率仅为固定算例 |
| 套餐 | 实际权益返回专业版 `pro` / active，包含库存、采购、销售、应收、审计和助手；未执行真实支付 |
| 业务编号 | 后续用 `D0-` 前缀及阶段/操作 UUID，与现有验收数据区分 |

当前 ID、权限摘要、科目 ID、首波响应状态/字段和最后一次成功校验见 [工作区产物](../../artifacts/dashboard-d0/workspace.json)。初始化过程曾因样例脚本让目标成员批准自己的授权而收到 403，改为独立审批后通过；一次只读负例因输入不完整先返回 400，补齐有效请求后验证 403。保留中间记录以区分探针问题与服务缺陷；早期未完成样例工作区不作为后续基线。

复现从仓库根目录执行：

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 150 --non-interactive
pwsh -NoProfile -File scripts/p1/Test-Platform.ps1
pwsh -NoProfile -File scripts/p1/Test-OpenApiContracts.ps1
pwsh -NoProfile -File scripts/dashboard/Export-IntegrationContracts.ps1
node scripts/dashboard/Initialize-IntegrationBaseline.mjs --resume-validation
```

`--resume-validation` 读取已有样例产物，重新登录后只读回基线并执行预期被拒绝的权限负例。首次建立全新独立样例时省略此参数；每次无参数运行均新建测试身份和工作区。脚本借用既有 `nexora-web` 的 Playwright 测试依赖，不引入新版应用的运行时依赖。

## 3. 契约基线与缺口

[采集脚本](../../scripts/dashboard/Export-IntegrationContracts.ps1) 使用 Aspire 发现实际 HTTPS 端点，等待对应资源就绪后获取 `/openapi/v1.json`，不读取或导出资源环境变量。结果包括原始文档、摘要哈希，以及方法、路径、参数、写入头、请求体、响应状态、头与媒体类型索引。

[索引](../../artifacts/dashboard-d0/contracts/index.json) · [操作清单](../../artifacts/dashboard-d0/contracts/operations.json)

| 服务 | 操作数 | Schema 数 |
| --- | ---: | ---: |
| Organization | 48 | 58 |
| MasterData | 15 | 22 |
| Purchasing | 12 | 20 |
| Sales | 13 | 24 |
| Inventory | 25 | 21 |
| Finance | 129 | 198 |
| Reporting | 1 | 3 |
| 合计 | 243 | 346 |

首波实际响应取自已有 BFF；新版独立 BFF 尚未实现，不能将这些结果当作 D1/D2 的验收。

| 方法与路径（浏览器同源） | 当前真实契约 | 新版适配与来源 |
| --- | --- | --- |
| `GET /bff/me` | 200，`{subject,name}`，JSON | 演示账户资料不能作为此接口的额外字段；更多安全能力走专门入口 |
| `POST /bff/api/workspaces` | 首次 201，`Location`，WorkspaceView；重放 200 见既有验收 | `operationId` / `Idempotency-Key` 以同一 UUID 为准；[WorkspaceEndpoints](../../src/Services/Organization/Nexora.Organization.Api/Endpoints/Workspaces/WorkspaceEndpoints.cs) |
| `GET /bff/api/workspaces` | 200 数组，只含可见工作区 | 账号/工作区切换清理旧缓存；四身份已验证主工作区可见 |
| `GET .../workspaces/{id}/access` | `authorizationVersion,permissions,role,memberId,scopedPermissions,departmentIds` | 演示的 `purchase.create`、`finance.post` 需适配为服务的 `purchasing.order.create`、`finance.journal.post` 等权限 |
| `GET .../masterdata/workspaces/{id}/catalog` | `{definitions,page,canManage}`；分页参数取对应 OpenAPI | 不能按本地 mock 的扁平数组直接映射 |
| `GET .../items/{itemId}` | 200，顶层项目字段、`version`，本样例 `ETag: "1"` | 更新的 `If-Match` 与 412 由既有契约探针验证；[目录端点](../../src/Services/MasterData/Nexora.MasterData.Api/Endpoints) |
| `GET .../purchasing/workspaces/{id}/orders` | `{canCreate,canApprove,hasMore,orders}` | 以服务分页参数、部门范围和返回快照为准 |
| `GET .../sales/workspaces/{id}/orders` | `{canCreate,canApprove,hasMore,orders}` | 空列表已验证，真实行字段与履约在 D5 逐阶段验证 |
| `GET .../inventory/workspaces/{id}/warehouses/{warehouseId}` | receiver、版本和可执行动作按当前身份返回 | 接收人和库存查询授权分开处理；四身份结果不可复用 |
| `GET .../finance/workspaces/{id}/trade` | `{currency,minorUnits,canConfigure,canSubmit,canApprove,setup,banks}` | 采购科目映射在 `setup`，资金余额为十进制字符串 |
| `GET .../finance/workspaces/{id}/receivables` | `{accounts,canConfigure,canDraft,canPost,currency,fiscalNumbering}` | 销售科目映射字段与采购不同 |
| `GET .../finance/workspaces/{id}/ledger` | 权限、币种、开放期间及版本 | 业务日期为 `YYYY-MM-DD`，正式过账结果以后端为准 |

错误基线：匿名 Gateway/BFF 业务入口为 401；越权工作区为隐藏式 404；有效的只读写入请求为 403 `application/problem+json`。Nitro 的会话/CSRF/MFA 错误仍须在 D1 经新版入口复验。采购收货、销售履约的 202/Location、Reporting 的 202/503、PDF 媒体类型及关键写入头已通过既有 OpenAPI 样例检查。

明确登记的缺口：

| 编号 | 所属服务与证据 | 影响、读取替代与跟踪 |
| --- | --- | --- |
| API-D0-01 | Organization `POST /api/workspaces`：实现和 BFF 实际返回 201/Location，OpenAPI 只有 200/IResult | D1/D3 不能只据该响应 schema 生成创建结果类型。读取 `GET /api/workspaces/{id}` / 工作区列表；当前 DTO 参照 WorkspaceView。修正创建分支的 OpenAPI 元数据后复验 |
| API-D0-02 | Finance 的采购、销售两个 `/setup` 都引用同名 `SetupRequest`，采购的 accounts 被描述成 `ReceivableAccounts`；运行时采购使用 inventory/accrual/payable 等字段 | D3/D4/D5 使用各自正式 DTO，避免按错误 schema 组装。读取 `/trade` 的 `setup` 与 `/receivables` 的 `accounts`；需为嵌套同名请求生成唯一 schema ID，复验两个请求体 |
| API-D0-03 | 7 份文档中有 11 个操作使用 IResult 成功 schema（Organization 5、Finance 2、MasterData/Purchasing/Sales/Inventory 各 1，Reporting 0） | 已保留快照；在所属接入波次用正常入口、DTO 和实际响应逐项核对，不将占位 schema 当成完整字段契约 |

本轮保存来源和缺口，没有调整业务 API。新 BFF 的配置、真实/模拟数据开关、受众/CSRF/MFA、会话命名空间及新入口运行时响应归 D1、D2。

## 4. 验证结果与边界

| 检查 | 当前结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-dashboard typecheck` | 通过 |
| `pnpm --dir src/Web/nexora-dashboard test:unit` | 16 个文件、70 项测试通过 |
| `pnpm --dir src/Web/nexora-dashboard build` | 初验 49.1 秒通过；格式修正后最终复验 28.5 秒通过，Node 输出 16.4 MB |
| `pnpm --dir src/Web/nexora-dashboard lint` | 初次有 1,523 个错误、622 个警告；13 个文件的格式修正后，独立 lint 命令复验通过 |
| `Test-Platform.ps1` | 通过，包括 4 项 AMQP 权限探针 |
| `Test-OpenApiContracts.ps1` | 通过，10 个操作分支及匿名 401 ProblemDetails 检查 |
| 七服务契约采集 | 243 个操作；保存逐文档 SHA-256 |
| 专用样例正常 BFF 入口 | 初始化与最后一轮验证通过；包含工作区可见性、404/403、收货人/只读动作区别 |

验证摘要见 [checks.json](../../artifacts/dashboard-d0/checks.json)。初始 lint 问题来自新版布局和页面的模板属性换行、缩进及空白规则；保留原界面内容后，按现有规则完成格式修正，并复验 lint、类型、单测和构建。日志保留在被忽略的 `artifacts/p1/runtime/d0-*.log`；没有降低 lint 规则。

由本次启动的 AppHost 在结束时按普通停止流程关闭，保留卷和专用样例。当前新版仍是模拟数据原型。未验证新版独立 HTTPS/BFF、完整采购/销售交易、失败恢复、远程 CI 或生产环境，相关父项与功能总清单不随本次基线自动勾选。
