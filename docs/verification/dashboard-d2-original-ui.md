# Dashboard D2：原有商品页接入类型化请求

2026-11-20。D2 使用原 `WorkspaceMenu.vue`、`catalog.vue` 的表格和编辑抽屉作为接入样例。登录沿用 D1 的原用户菜单；没有增加另一套页面、布局或 Vue 组件。

## 原界面保留证据

以本轮开始的 112 个 Vue / CSS 文件为基线，全部保留。仅适配以下 4 个原文件，其余 108 个文件的 SHA-256 相同；原有 14 个页面文件及 `app.vue → NuxtLayout → NuxtPage` 入口保留。此前删除的 38 个替代 UI 文件没有恢复。

| 原文件 | 本轮适配 |
| --- | --- |
| `app/components/WorkspaceMenu.vue` | 原菜单选择当前身份获授权的工作区，刷新工作区与权限。 |
| `app/pages/catalog.vue` | 原表格读取目录、翻页；原抽屉编辑名称、分类和启用状态，显示版本、错误和提交恢复操作。 |
| `app/components/UserMenu.vue`、`app/layouts/default.vue` | 仅补充商品目录使用 MSW / 真实接口的来源说明。 |

[文件摘要对照](../../artifacts/dashboard-d2-original-ui/ui-preservation.json) · [真实目录截图](../../artifacts/dashboard-d2-original-ui/live-catalog.png) · [原抽屉的 MSW 截图](../../artifacts/dashboard-d2-original-ui/msw-editor.png) · [真实 412 保留输入](../../artifacts/dashboard-d2-original-ui/live-conflict.png)

## 当前可用范围

| 入口 | 原商品页的数据来源与行为 |
| --- | --- |
| `http://localhost:3001/catalog` | 原离线原型，保留原模拟数据和原型交互。 |
| `http://localhost:3003/catalog` | 原 UI 通过 MSW 的同源 `/bff/*` 请求登录、选择工作区、读取及修改模拟商品。 |
| `https://localhost:7444/catalog` | 原 UI 通过独立 Nitro BFF、Gateway 与真实服务读取及修改当前授权工作区的商品。 |

从左下角原用户菜单登录，再从左上角原工作区菜单选择公司。商品页每页读取 8 条，搜索、分类和状态筛选明确作用于当前页；按服务端 `hasMore` 开放下一页，没有把当前页条数当作全库总数。

本轮保存仅包括 `name`、`categoryId` 和 `isActive`。SKU、单位、类型及库存追踪方式来自服务端并只读。未发布的品牌、条码、规格、税率和批次 / 序列号明细没有套用原型值。价格与库存占位字段不展示、不导出、不提交；连接模式的 CSV 仅导出当前页实际读取的基础字段和版本。

创建商品、定义与伙伴维护、完整授权导航、交易前置设置继续归 D3；采购、库存和财务等其他原页面仍明确显示模拟说明。收货许可的完整业务 UI 归 D4。本轮没有勾选这些后续阶段。

## 请求与状态实现

- 按业务域复用 `app/composables/api/` 的类型化客户端，`shared/types/` 使用 Zod 验证 Wire DTO，商品适配位于 `app/utils/catalog/adapter.ts`。普通查询不提交命令，所有写请求保持 `retry: 0`。
- `useCatalogConnection` 通过带响应式键的 `useAsyncData` 执行只读查询。键包括运行模式、主体、工作区、授权版本、资源与分页条件；结果还核对本地范围代次。读取处理器返回确定形状，不修改表单和业务状态。
- `liveSession` 复用 D1 的唯一身份 store，只保存授权工作区及其访问摘要。身份、工作区或授权切换时先改变请求范围，再清除旧查询、选择及表单。旧请求即使迟到也不能写回当前视图；离开 A 再返回 A 也不会复活旧写操作。
- `401` 清除当前身份并显示原登录入口。字段错误回填原表单，`412` 保留输入并提供读取当前版本；幂等键冲突、普通拒绝、资源隐藏、MFA 和服务不可用按各自语义显示，适用时展示 `traceId`。MFA 经原登录入口重新验证，返回后在原抽屉恢复输入，由用户决定再次保存。
- 商品保存前先读取真实记录及 `ETag`，提交原样 `If-Match`。每次新操作生成 UUID，正文与 `Idempotency-Key` 一致；双击只发出一次写请求。
- 发送前将冻结的主体、工作区、资源、原请求、原键和原 ETag 保存到本标签页 `sessionStorage`，不保存令牌。未知结果禁止直接再保存；刷新后只在原主体、原工作区且当前仍有权限时提供恢复入口。
- 恢复先读取本人操作回执及当前资源。查到回执则确认；未查到时仅开放用户明确触发的原请求重放。网络或依赖导致回读失败时继续保留未知状态，不能因此解除保护。相同键不能替换冻结的请求内容。
- 共用轮询客户端保留 `202 Location`、`Retry-After`、总等待预算、取消与范围变更终止规则。真实采购许可的查询验收沿用现有 API 契约场景，未宣称采购原页面已接通。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| ESLint、TypeScript strict | 通过。 |
| Vitest | 32 个文件、135 项通过，包含范围隔离、迟到响应、未知写入、回读、轮询、恢复记录与原型组件回归。 |
| MSW 浏览器 | 原 D1 的 5 项及 D2 的 9 项通过，Edge、中文、单 worker 串行运行。 |
| 真实入口浏览器 | 15 个场景最终通过：完整套件先通过 14 项，建单回读用例修正大小写假设后单独复验通过。 |
| 模拟 / live Node 构建 | 均通过；开发生成目录与生产产物保持独立。 |
| 条件变异检查 | 在受保护运行目录的隔离副本运行请求边界测试：原始代码 3 项通过；移除写操作代次检查后，A → B → A 用例如期失败，另 2 项通过。恢复副本并核对摘要，运行源码未改动。 |

D2 的 MSW 场景覆盖：实际网络拦截、服务端翻页、工作区切换、双击、旧版本输入保留、落库后响应丢失、落库前响应丢失、原键原请求重试、字段错误、只读权限、其他账号隔离、回读失败、MFA 返回恢复与授权变化。D1 场景继续覆盖键盘、语言和 320 / 768 / 1024 / 1440 布局。

真实检查包括：

1. 通过原菜单登录并读取真实目录，其他会话更新后原抽屉收到 `412`；输入保留，读取新版本后明确保存，记录版本只按两次真实修改递增。
2. 真实商品 PUT 已提交后阻断浏览器响应，原页面保持待确认；刷新恢复、读取本人回执后确认，商品版本只增加一次，未自动重发。无法确认时的明确重放必须保留原键和原正文。
3. 真实只读用户能读取原目录，编辑按钮禁用；伪造写请求返回 `403` 且版本不变，访问隔离工作区资源返回 `404`。
4. 共用客户端丢失真实采购建单成功响应后保持未知，回读同一工作区的唯一单据及详情；建单请求只执行一次，前后配额仅增加 1，没有把传输失败视为回滚。
5. D1 的真实登录、会话恢复、MFA、CSRF、ETag / 正文版本冲突、同键重放与冲突、创建配额、`202` 恢复、CSV / PDF 响应头、生产产物配置校验继续回归。

首轮真实 UI 检查曾因测试在抽屉关闭期间等待已移除的按钮而超时。页面快照显示回执已确认、目录已刷新；改成不等待元素出现的状态采样后，针对该场景的复验及随后完整套件中的该项均通过。新增采购回读测试的首轮比较使用了未规范化的单号；核对现有领域规则会转换为大写，调整测试单号并按真实 `detail.order` 响应结构读取后，单独复验通过。业务端点和单号政策没有修改。失败和后续结果均保留在受保护运行目录。

商品用例只在仍为本测试命名的记录上恢复原名称，使用新操作和最新 ETag，不覆盖并发他人的修改。真实建单与审批验收留下独立编号的本地测试单据及其审计，不删除业务事实。

复现命令从仓库根执行：

```powershell
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard test:msw

$d2AppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $d2AppHost --non-interactive
aspire wait gateway --apphost $d2AppHost --timeout 180 --non-interactive
$d2Dashboard = aspire describe dashboard --apphost $d2AppHost --format Json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $d2Dashboard.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e
aspire stop --apphost $d2AppHost --non-interactive

pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
```

`NODE_EXTRA_CA_CERTS` 使用 AppHost 的受信任开发 CA，供测试进程的真实 HTTPS 请求使用；没有关闭 TLS 校验。需要 D0 本地样例、Mailpit 及受保护的开发身份。本轮指定 AppHost 由本次验证启动，结束后使用 `aspire stop --apphost` 正常停止；`aspire ps` 返回 0 个实例，PostgreSQL、Redis、Keycloak 与 RabbitMQ 的 4 个持久卷均仍存在。

[去敏结果清单](../../artifacts/dashboard-d2-original-ui/validation.json) 记录分组结果与范围。完整日志、首次失败、重新运行、开发环境描述和测试凭据仅保存在受保护的 `artifacts/p1/runtime/`；公开清单不包含 Cookie、令牌、OTP 或开发密钥。

开发模式仍出现已有 Nuxt Hints 的文档元信息、布局偏移或调试上报提示；不将这些提示计作性能或可访问性验收。此次结果限于本地构建、测试与完整栈联调，未执行远程 CI 或生产发布。

实现依据：[Nuxt `useAsyncData`](https://nuxt.com/docs/4.x/api/composables/use-async-data) · [MSW 网络错误](https://mswjs.io/docs/http/mocking-responses/network-errors) · [ADR 0010](../adr/0010-nuxt-client.md) · [REST 条件请求](rest-api-normalization.md)。版本以本项目锁文件为准，本轮未增加依赖。

D3 已继续沿用上述原页面，新增授权导航、主数据创建 / 维护及交易前置配置；后续证据见 [D3 验收](dashboard-d3-original-ui.md)。本文保留 D2 当时的验证范围与结果。
