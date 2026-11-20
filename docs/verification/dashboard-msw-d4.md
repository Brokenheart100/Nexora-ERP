# Dashboard：MSW 与 D4 采购到付款

> 2026-11-20 状态更新：替代 UI 已按用户要求删除。本记录为当时版本的历史验证；当前保留 BFF / 客户端 / MSW 基础，原界面接入状态见 [删除记录](dashboard-replacement-ui-removal.md)。

2026-11-20，已完成本地验收。范围为新版 Dashboard 的 MSW 开发测试入口，以及 [D4 清单](../ui-dashboard-api-integration-todolist.md#d4-采购到付款) 的五项验收，承接 [D3](dashboard-d3.md)。

## 实施顺序

1. MSW：独立端口的模拟入口，复用真实页面与 API 客户端；浏览器与 Node 测试共享 handlers。仅在明确选择的开发/测试模式启动，真实 BFF 入口保持真实请求。先验收现有工作区、目录、权限和错误场景，再开发 D4。
2. 采购：分页列表、详情、新增及版本化编辑，提交、撤回、退回、批准、取消；部门范围与制单/审批分离。
3. 收货：按订单行和仓库签发许可，202 状态回查，仓库侧按许可修订号执行，取消与关闭余量。
4. 应付：实收事实与暂估状态、账单、税额评估、独立付款和明细回读。完成 CNY 1,130.00 账单、600.00 部分付款、530.00 未结样例。
5. 恢复：超量、重放、并发签发、取消与执行交错，以及 Finance 消费者暂时落后的真实恢复。最终执行单测、浏览器、类型与构建检查，再更新 TODO。

## 验证边界

MSW 用于可重复的界面分支，模拟数据遵循已有 DTO 与十进制字符串契约。它不实现后端事务、Outbox 或领域规则。审批、收货、账单、付款及恢复通过指定 Aspire AppHost 和真实业务 API 验收。

保留工作区现有 D0–D3、技能及配置改动，分段保存本次实施前快照。本次不提交或推送混合的既有变更。测试凭据、状态、日志和故障诊断保留在忽略的 `artifacts/p1/runtime/`。本次启动的 AppHost 在验证结束后正常停止，保留声明的数据卷。

## 来源

- [MSW 浏览器集成](https://mswjs.io/guides/integrations/browser)：在渲染前等待 Service Worker 就绪。
- [MSW Node 集成](https://mswjs.io/guides/integrations/node)：按测试生命周期启用、复位及关闭共享 handlers。
- [Nuxt 环境配置](https://nuxt.com/docs/4.x/getting-started/configuration#environment-overrides)：用显式环境覆盖隔离 MSW 开发入口。
- 业务契约以本仓库 Purchasing、Inventory、Finance 的端点、DTO、用例与实际响应为准。

## 实现与契约

- MSW 3.0.7 是 Dashboard 的锁定开发依赖，浏览器与 Node 共用 `app/mocks/api/`。`dev:msw` 使用 3003、`.nuxt-msw/` 与 `.output-msw-dev/`，与原 3001 界面原型、7444 真实入口隔离。浏览器等待 `worker.start()` 后初始化页面，真实及生产模式拒绝启用。未实现的 BFF 路由返回 501。
- 模拟覆盖目录正常、空态、403、503、延迟、ETag 冲突；采购新增、编辑、提交、撤回；应付样例、税额快照、付款申请与取消。模拟制单人不显示审批按钮。刷新页面复位样例，MSW 不代替后端事务或权限验收。
- 采购页面按工作区、部门权限和服务器单据状态显示动作；编辑携带版本，冲突保留输入。许可签发回读 202 Location 与许可 ID，仓库执行携带仓库侧 `expectedRevision`。取消中的额度持续占用，收到库存终态回执后才释放。
- 账务页面区分库存实收与财务暂估，展示 `pendingReason`，复核人可明确重试暂估。账单逐行选择实收、数量、未税单价及税额评估，显示匹配、价差与关联凭证；独立付款选择已入账且余额足够的账单。列表与选择器按接口分页读取。
- 数量、金额保留十进制字符串；前端求和、比较与币种舍入使用整数精确运算。请求中的 TradeKind 使用后端数字枚举，账单为 1、付款为 2。`TaxAmounts` 合计字段为 `total`；含税金额由 Finance 评估快照返回。
- 新写入先冻结操作 ID、版本和请求体，确认响应也通过结构校验。无有效回执或请求超时保持 unknown，先读取当前状态，再明确重试同一操作。10 秒截止时间与工作区取消信号共同生效。

## 实际联调与修复

1. 部门审批人在已有采购许可入口被公司级检查拦截。修正 `PurchaseReceiptUseCases`：读取订单后按该单据部门验证审批权限；签发、取消、关单和幂等回放均重新校验当前资源范围。回放允许原版本，但授权撤销后不能借旧回执越权。3 项专项测试先红后绿，真实审批人仅拥有本部门采购审批授权。
2. 用户已在 AppHost 禁用旧版 `web`，Gateway 仍强制要求其地址，导致真实入口启动失败。保留用户的 AppHost 设置和旧版源码；Gateway 在未配置旧版时不注册旧版路由，业务服务和新版入口仍必需。3 项测试验证只启新版、配置旧版及业务端点缺失。
3. 税额返回的 `total` 最初误写为 `gross`，真实响应校验进入 unknown，未误报成功。按 Finance DTO 修正，增加契约回归测试。
4. 停机演练发现 ofetch 1.5.1 在已传入 `signal` 时不会建立其 `timeout` 定时器。将截止时间放入共享请求控制器，超时读取可展示错误，超时写入维持 unknown；两项测试验证截止时间与不自动重发。
5. 取消与实收交错时，库存回执可能先推进采购版本。409 是有效并发门禁；测试读取新版本后明确再提交取消，等待终态并核对实际执行数量。
6. 完整套件首次为 15 通过、1 入口检查失败：Node 请求客户端不使用 Edge 的本机证书信任链。入口检查改为实际 Edge 导航，保留 TLS 校验。未启用旧版时，Gateway 的认证兜底对根路径返回 401，测试明确核对该挑战；该项独立复验通过。

## 本地业务验收

真实公司、独立制单人、部门审批人、仓库收货人和财务复核人通过新版 7444 入口验收。测试准备账簿、科目、银行资金和税组使用拥有方发布的 API，后续正常业务路径使用新版页面。

| 场景 | 已核对的事实 |
| --- | --- |
| 分批收货 | 100 件、未税单价 10，按 40 / 60 实收；库存数量 100、成本 1000，Finance 两行暂估各只处理一次 |
| 含税账单 | 两行净额 400 / 600，13% 税额 52 / 78，账单合计 CNY 1130，匹配数量与零价差可回读 |
| 部分付款 | CNY 600；账单未结、供应商应付明细和账龄均为 CNY 530；银行流水 -600，银行余额由 2000 变为 1400 |
| 操作重放 | 相同付款操作与相同实收操作返回原结果；没有第二笔银行或库存流水 |
| 版本与范围 | 同一版本并发签发只成功一次，超量拒绝；部门审批人与制单人权限分离，异部门订单隐藏 |
| 取消及关单 | 取消与仓库执行交错后只保留实际执行数量；终态前不释放余量，取消确认后可重新签发和关闭余量 |
| Finance 落后 | 正常停止 Finance 后，通过新版仓库页面确认单行实收；恢复并等待资源健康后，库存流水、财务事实和暂估凭证各一份 |
| 传输恢复 | 停止 RabbitMQ 时库存实收成功、采购回执仍未确认；恢复后收到终态与成本事实，无重复实收 |
| 暂估等待 | 二月期间未开放时，实收保留等待原因且不能匹配；错误重试不误报入账，开放期间后由复核人从页面重试成功 |

故障演练通过 Aspire 的 `resource <name> stop/start` 及 `wait`，资源恢复放在 `finally`，不强杀服务、不删除卷。

## 验证命令

从仓库根目录、准备好 README 所列本地依赖后执行。浏览器套件串行运行，D4 会短暂停启专用本地栈的 Finance 与 RabbitMQ。

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard test:msw
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 150 --non-interactive
pnpm --dir src/Web/nexora-dashboard test:e2e
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

专项入口为 `test:e2e --grep 'D4'`，包含并发边界、完整付款与消费者/传输恢复三项。入口专项复验使用 `test:e2e --grep '新版 HTTPS 跳转'`。去敏结果与当前源码指纹见 [results.json](../../artifacts/dashboard-msw-d4/results.json)。

## 五项质量复查

| 方向 | 复查结论 |
| --- | --- |
| 正确性 | 按实际 DTO 校验成功回执；金额、数量、版本、税额及回执状态由服务确认；失败输入和未知写入不丢失 |
| 可读性 | 采购、许可、仓库任务、账单行、账单、付款及凭证分别放入职责组件，API 与表单计算独立 |
| 架构 | 浏览器只调用同源 BFF；采购、库存及财务各自持有状态和事务，未引入共享数据库或前端领域实现 |
| 安全 | 部门和仓库范围、制单复核分离、跨区隐藏、幂等回放重新授权；测试凭据与完整诊断留在受保护运行目录 |
| 性能 | 列表和账单选择器按页加载；读请求有截止时间，写请求不自动重发；许可回查有时限 |

## 验收范围

| 检查 | 结果 |
| --- | --- |
| .NET 锁定还原 / Release 构建 | 通过，构建 0 警告 / 0 错误 |
| .NET 测试 | 68 通过，0 跳过 |
| Dashboard 单测 | 100 通过；MSW 状态隔离调整后 4 项专项再验通过 |
| MSW Edge | 5 通过，0 跳过 |
| 新版真实浏览器 | 16 个场景均有通过记录：完整套件首轮 15 通过、1 入口检查失败；该项修正后单独复验通过 |
| lint / strict typecheck | 通过，入口测试变更另行 lint |
| mock / live Node 产物 | 两种构建均通过；开发服务及浏览器套件启动后，两份生产产物仍存在 |
| 条件反转检验 | 反转“仅已入账账单可付款”的新守卫，测试必须失败；从字节副本恢复后专项重新通过 |

本地实测不代表远程 CI 或生产验收。停机恢复覆盖正常停止与恢复消费者、消息代理断连及期间门禁；Inbox 落库后的进程崩溃、多节点重新接管、受控死信重放属于已有后续验收范围。Finance OpenAPI 同名 SetupRequest 的 D0 元数据缺口未被本次验收覆盖，D4 使用拥有方 DTO、用例和真实响应核对契约。


## 结束状态

本次启动的指定 AppHost 已通过 `aspire stop` 正常停止。`aspire ps --format Json` 返回空列表；PostgreSQL、Redis、Keycloak 与 RabbitMQ 四个声明的命名卷保留。用户停用旧版 Web 的 AppHost 文件与实施前快照字节一致。

原始测试结果、首次失败与复验、业务样例和恢复证据保留在忽略的 `artifacts/p1/runtime/d4-*`，公开 JSON 只记录统计、去敏结果与源码指纹。未提交或推送混合工作区改动；D3 历史证据保持原样。
