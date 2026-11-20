# Dashboard D3：工作区授权、主数据与交易前置

> 2026-11-20 状态更新：替代 UI 已按用户要求删除。本记录为当时版本的历史验证；当前保留 BFF / 客户端 / MSW 基础，原界面接入状态见 [删除记录](dashboard-replacement-ui-removal.md)。

2026-11-19 至 2026-11-20，本地验收完成。范围以 [D3 清单](../ui-dashboard-api-integration-todolist.md#d3-工作区授权主数据与交易前置配置) 为准，承接 [D1/D2](dashboard-d1-d2.md)。

## 实施与验收顺序

1. 授权导航：读取账号、工作区详情、授权快照和套餐权益；公司权限与部门/仓库范围分别处理。验证深链接、只读身份、切换及迟到响应。
2. 主数据：商品、分类、单位和往来单位的新增、读取及版本化修改；使用引用接口核对可用性，保留冲突输入。验证跨工作区、停用及历史快照。
3. 交易前置：部门与仓库范围、账簿、科目、期间、税务和资金账户状态；应付/应收映射通过各自拥有方契约提交。验证缺失提示、权限和实际回读。

采用新版项目自己的类型化客户端、Nuxt UI 表格/表单/抽屉和串行 Playwright；未知写入保留 D2 的回读与人工恢复机制。模拟预览保持既有原型。

## 实现与契约

- 新版入口读取 `/api/me`、工作区列表和详情、授权快照及权益。导航同时检查模块权益与业务权限；深链接携带 `workspace`，未授权工作区直接拒绝。切换后清理缓存并使旧请求失效，操作页面按授权版本重新建立。
- 公司权限与部门、仓库、业务日期范围分别核对。部门选项使用对应的采购或销售制单权限；有读取权限不会自动获得制单权限。仓库列表、详情及引用接口返回的 `canReadStock`、`canReceive` 分别展示；领取收货职责也不会被当作公司级库存权限。
- 商品目录分页；分类、单位、商品及往来单位有新增、详情和修改表单。往来身份包括客户、供应商、捐赠人，联系人最多 20 项。编码、类型及不可变引用按后端规则固定，商品分类、名称、启用状态及往来档案按当前 ETag 修改。412 后保留输入，明确读取当前版本后再提交。
- 商品及往来引用使用拥有方的引用端点。未知主数据写入先读取当前数据，再用同一操作者、操作 ID、动作和资源的事务回执确认；无法取得回执时仍保留未知状态，由用户明确重试冻结的原请求。
- 交易前置页读取账簿、科目、总账期间、应付、应收、资金账户和税务配置。各项区分已就绪、待准备、权限不足和暂不可用；按业务日期核对开放月份和账簿起点，展示资金默认账户、税组及实际科目映射。
- 应付、应收映射表单仅在拥有方允许配置且尚未配置时出现。候选科目来自当前账簿，按类型、用途、启用状态筛选，排除银行控制科目，映射各用途不得重复。提交分别使用 `POST trade/setup` 和 `POST receivables/setup`，两者成功码均为 **200**。
- 财务设置读取模型没有公开的本次操作回执。即使回读发现映射一致，也不能证明这次请求已提交；界面继续保留未知状态，再通过同一操作 ID 和请求体的显式重试取得后端幂等回执。不同操作 ID 再次设置返回 409。

主要实现位于 [实时布局](../../src/Web/nexora-dashboard/app/components/LiveDashboardLayout.vue)、[主数据组件](../../src/Web/nexora-dashboard/app/components/catalog)、[往来组件](../../src/Web/nexora-dashboard/app/components/partners)、[前置配置](../../src/Web/nexora-dashboard/app/components/finance/LivePrerequisitesPanel.vue) 和 [API 客户端](../../src/Web/nexora-dashboard/app/composables/api)。模拟预览继续保留原有界面。

## 本地验证

从仓库根目录运行：

```powershell
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
$nexoraDashboard = 'src/Web/nexora-dashboard'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 150 --non-interactive
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir $nexoraDashboard build
Remove-Item Env:NUXT_PUBLIC_DATA_MODE
pnpm --dir $nexoraDashboard test:e2e
aspire stop --apphost $nexoraAppHost --non-interactive
```

| 检查 | 结果 |
| --- | --- |
| 前端单元测试 | 85/85 通过；包含范围权限、科目候选与重复用途、未知表单写入及回读失败保留状态 |
| ESLint / strict TypeScript | 通过；修正自动格式化产生的错误类型导入后重新验证 |
| 模拟 / 真实构建 | 均通过；Aspire 重启新版前端后，两份生产入口 SHA-256 均保持一致 |
| Edge 串行浏览器 | 最终完整运行 13/13 通过，0 跳过、0 flaky；包含 5 项 D3 和 8 项既有回归 |
| 五轴审查及条件反转检查 | 完成；反转归档科目过滤条件时 1 项预期失败，逐字节恢复后 2/2 通过 |
| AppHost 结束与卷保留 | 正常停止返回 0，`aspire ps` 为空；PostgreSQL、Redis、Keycloak、RabbitMQ 的 4 个声明数据卷全部保留 |

五轴审查范围限定为本次 D3 改动：

| 轴 | 核对结论 |
| --- | --- |
| 正确性 | 公司与资源范围分别判断；未知写入保留原操作；科目类型、用途、不同用途去重及版本冲突已覆盖 |
| 可读性 | 主数据与科目映射分别拆为表单，写入恢复集中在 `useLiveMutation`；写操作有显式类型契约 |
| 架构 | 新版独立 Nitro BFF 与 API 客户端沿用原边界；没有引用原版前端、跨服务数据库或后端内部层 |
| 安全 | 界面过滤辅助展示，服务端继续授权；跨区、只读、CSRF、MFA 和原操作重放走真实链路；诊断留在忽略目录 |
| 性能 | 商品及往来按 20 条分页；财务前置读取并行；引用核对由用户显式触发，未增加逐行自动请求 |

条件反转检查在停止 AppHost 后进行：将 `mappingCandidates` 的 `!account.isArchived` 暂时反转，科目候选测试检测到错误地选择归档科目；随后恢复原文件字节，校验 SHA-256 相同并重跑该文件。没有将反转后的源文件留在工作区。

浏览器覆盖以下行为：

1. 工作区身份、权限及套餐导航；越权工作区和财务深链接拒绝；只读用户无商品、往来新增操作。
2. 仓库只读与指定收货身份的可见行为，以及详情、引用回读。
3. 分类、单位、商品与往来完整维护；版本冲突保留输入；跨工作区引用拒绝；停用后新引用失败，已有销售草稿保存原始客户、商品、单位名称与版本。
4. 独立公司从缺失期间、税务配置到实际就绪；科目映射通过界面保存，读取实际配置。跨工作区科目 404，只读设置 403。
5. 应付设置已在服务端完成但响应丢失时，界面保留待确认状态；读取后仍需明确重试，重试使用同一请求体及操作 ID，最终配置版本为 1，资金余额没有变化。
6. 自定义销售部门授权经独立复核后，仅显示获准制单部门；未授权部门创建 403，获准部门创建成功并回读相同部门。
7. D1/D2 的登录、会话、CSRF、配额、异步写入恢复及独立生产产物等既有回归继续保留。

## 调试记录与范围

主数据验收曾因测试将后端统一大写的定义编码当作小写定位而失败，已按实际编码修正。跨工作区直接引用读取为 404；新增商品提交外区分类或单位时，拥有方明确返回 **400**（无效的当前工作区定义），验收按该实际契约检查，未修改后端语义。

财务故障注入首次因 Playwright 的 Node 请求不信任本地开发证书而中断；只在本地故障注入的 `route.fetch` 使用 `ignoreHTTPSErrors`，正常浏览器和产品网络策略保持受信任证书。另一次测试期望文本与已有“结果待确认”提示不符，已修正断言。自动格式化将同一模块的值与类型导入错误合并后，strict TypeScript 检出问题，修正并重跑相关检查。

首次完整浏览器运行在 5 项 D3 用例通过后被会话中断，未计作整套通过。恢复时重新启动 AppHost，等待真实网关健康。模拟预览遗留的 `.nuxt/nuxt.lock` 中旧 PID 已被 `conhost.exe` 复用且 3001 没有监听；核对进程身份、端口和绝对文件路径后，仅备份并移除这个过期锁文件，未杀进程、绕过锁保护或清空生成目录。随后重新执行完整回归。

恢复后的完整回归曾为 12/13：独立 Node 产物缺失。构建日志证明产物已生成，但重启开发 AppHost 后 `.output-live/server/index.mjs` 消失；安装的 Nitro 2.13.6 `prepare()` 会清理 `output.dir`。原配置仅隔离 Nuxt `buildDir`，开发和生产仍共用 Nitro 输出。现将开发输出改为 `.output-dev/`、`.output-live-dev/`，生产继续使用 `.output/`、`.output-live/`。回归在两个开发入口运行后检查两份生产入口仍存在；生产启动增加明确的构建前置检查，子进程诊断只留在受保护运行目录。修复后重新构建并复验。

本阶段没有修改 .NET 业务服务、数据库模型或迁移，未将 D1/D2 的 .NET Release 结果记作本次重跑。D0 的 Finance OpenAPI 同名 `SetupRequest` 缺口仍在；本次按应付、应收拥有方的请求 DTO 和真实响应分别核对。

测试只使用本地捕获邮件及专用样例。财务与部门权限使用新建 D3 公司，D0 的只读账号仅在该新公司增加部门授权；未降低 Alice/Bob 的套餐、修改原公司授权或执行财务过账。主数据历史验证仅创建销售草稿。详细日志、浏览器报告及认证状态位于忽略的 `artifacts/p1/runtime/`；[公开结果与源码指纹](../../artifacts/dashboard-d3/results.json) 不包含认证状态和运行凭据。停止后的卷核对仅针对 AppHost 声明的 4 个持久数据卷，匿名运行卷不计入该范围。

D3 不替代 D4 起的采购、收发货和财务闭环；账簿、科目、期间、资金及税务的完整维护界面仍按后续所属阶段推进。本次仅本地构建、单元和真实集成验收，未运行远程 CI 或生产部署。
