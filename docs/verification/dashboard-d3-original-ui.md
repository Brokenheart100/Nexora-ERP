# Dashboard D3：原有界面的授权、主数据与交易前置配置

2026-11-20。沿用原有 Nuxt / Carbon 界面，接通 D3 的工作区授权、主数据及交易前置配置。三个 D3 子项已通过本地验收，完整真实套件 20 项通过，TODO 同步更新。

## 本轮范围

1. 原工作区菜单、侧栏及搜索复用当前身份、授权工作区与套餐权益；切换范围清除旧查询和表单。
2. 原商品创建、分类、单位与伙伴表格和抽屉接通类型化接口、ETag、幂等与未知提交恢复。停用和跨工作区引用由后端校验。
3. 原财务「单据流转」的映射卡片接入应收、应付科目配置及交易就绪检查。部门按订单读取范围与日期筛选，仓库元数据和执行能力从真实资源接口读取。

D3 不增加 Vue 页面、布局或组件，D4 的采购交易流继续待完成。以 D2 完成时的 112 个 Vue / CSS 文件为基线，7 个原文件适配数据和操作，其余 105 个文件 SHA-256 相同；原有 14 个文件路由保留。此前删除的 38 个替代 UI 路径均未恢复。[保留证据](../../artifacts/dashboard-d3-original-ui/ui-preservation.json)

## 页面入口与行为

| 原页面 | D3 已接入的行为 |
| --- | --- |
| 工作区菜单、侧栏、全局搜索 | 读取账户、授权工作区、当前工作区、权限与套餐权益；仅展示允许的导航。搜索不混入原型业务记录。切换身份、工作区或授权版本清除旧查询及表单，拒绝迟到响应。 |
| `/catalog` | 在原商品创建抽屉选择当前分类、单位与库存追踪布尔值。原列表、详情及编辑继续使用 D2 类型化请求、服务器分页和实际版本。新建选项过滤停用定义；编辑保留历史定义标识。 |
| `/definitions` | 原表格和抽屉读取、新建、编辑、启停分类与单位；使用真实代码、状态和版本。税码维护留给 D10，删除操作不作为已支持接口。 |
| `/partners` | 原表格、详情和编辑抽屉读取、新建、更新伙伴，保留多角色、联系人标识、完整地址与可空字段。列表不虚构接口未返回的联系人、税号或更新时间。搜索与导出作用于当前服务器页。 |
| `/finance?tab=documents` | 原「单据流转」科目映射卡片核对交易就绪状态，首次配置应付与应收映射。已有映射只读，与后端仅允许初始化一次的契约一致。该页其余业务仍有模拟说明。 |

真实入口为 `https://localhost:7444`；原型预览仍为 `http://localhost:3001`，相同原界面的 MSW 模式使用 `http://localhost:3003`。需要有效 BFF 会话、工作区权益与对应服务权限；账户角色不能代替实际资源授权。

交易检查区分账簿、科目表、业务日期的开放期间、应付映射、应收映射、资金账户与税组 / 生效税率。拒绝访问、缺失及服务不可用分别显示。业务日期默认浏览器当地日期；部门按采购或销售读取权限及日期范围筛选。仓库选择通过详情和引用接口核对，分开显示库存可读与可收货能力。科目候选复用现有类别、用途、归档及银行科目排除规则；缺少合适科目时提示由有权限的人员先完成科目设置。

## 写入、引用与失败恢复

- 商品、定义及伙伴以当前 ETag 和 `If-Match` 更新；`412` 保留原输入，由用户读取当前版本后再次保存。只读入口禁用编辑，真实后端仍负责拒绝伪造请求。
- 新增表单复用范围化提交记录，发送前冻结主体、工作区、操作 ID、路径、方法、版本及正文。写入 `retry: 0`，未知结果与 MFA 草稿存入当前标签页，刷新后仅在原主体及工作区恢复。读取失败不删除待确认记录。
- 主数据未知结果通过本人的变更回执确认。财务当前映射本身不能证明是哪一次操作提交，因此回读后仍要求明确重放原键和原请求；不自动重发，不生成新键掩盖未知结果。
- 当前契约下，停用或不合格引用返回 `409`，命令中无效或跨工作区分类 / 单位返回 `400`，不可见的资源查询返回 `404`。停用和改名不改写已建采购单的名称、单位与版本快照。

主数据契约以 [MasterData 端点](../../src/Services/MasterData/Nexora.MasterData.Api/Endpoints)、[引用查询](../../src/Services/MasterData/Nexora.MasterData.Infrastructure/Persistence/Queries) 为准；交易初始化以 [Finance 端点](../../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade) 和应用用例为准。本轮没有修改后端、身份安全策略、AppHost 或依赖版本。

## 本地验证

| 检查 | 结果与范围 |
| --- | --- |
| Vitest | 36 个文件、149 项通过；包括导航、冻结提交、前置规则、MSW 状态与工作区隔离。 |
| MSW 浏览器 | 21 项全部通过：D1 的 5 项、D2 的 9 项、D3 的 7 项；包含键盘操作、320 / 768 / 1024 / 1440 布局和语言切换。 |
| 真实浏览器 | 完整 20 项在同一次运行全部通过（7.6 分钟），无跳过或失败；包含 D3 的 5 项及原 D1 / D2 / BFF / 产物回归。 |
| 静态及构建 | ESLint、strict typecheck 及 mock / live 构建通过；单测结果见上行。 |
| 变异检查 | 隔离副本的冻结提交测试基线 3 项通过；反转冻结字段比较后 1 项如预期失败、2 项通过，随后还原副本。生产源码未修改。 |
| UI 保留 | 112 个原 Vue / CSS 文件全部存在，7 个适配、105 个摘要一致；新增和删除均为 0。 |

真实 D3 用例在原页面验证主数据创建和历史快照、伙伴冲突、定义响应丢失恢复、只读导航及越权深链接，以及独立工作区的财务映射初始化。财务场景经本机 Mailpit 捕获邮件创建隔离样例，由 Alice / Bob 使用真实 TOTP 分别申请及独立批准业务角色，再通过已有公开接口建账并准备所需控制科目；没有绕过 MFA 或审批。丢失真实配置响应后，刷新、回读并明确重放原键，映射最终各初始化一次且转为只读。

采购草稿仅作为历史快照的接口测试夹具；本轮不计作 D4 采购 UI 验收。新增样例保留审计和历史事实；仅将本轮专属且已失效的 `000-D3-I-*` 样例商品按新版本停用，避免污染后续测试的选项，未删除业务历史。

初次联调暴露了原定义行按钮缺少只读禁用绑定，已修复；定义接口 `403` 的浏览器测试先失败，再补齐查询错误状态并通过。其他首次失败来自测试准备或断言：库存引用所需追踪标记、停用引用 `409`、财务权限所需独立批准、初始科目表缺少控制科目，以及异步提交未等待响应。均按实际契约修正并复验，未降低后端门禁。原始失败日志保留在忽略的运行目录中。

开发环境仍有 Nuxt Hints 关于页面标题、语言属性和布局偏移的提示；本轮没有将功能测试作为性能或无障碍全量验收。最后复核将伙伴页的结果数改为当前页条数，避免把当前页数量当作总数；该文案修正后复跑完整 MSW、静态检查及两种构建。真实 20 项回归和截图记录于该文案修正前，服务交互与业务逻辑未再变化。没有运行远程 CI、部署或生产验收。

## 复现命令

从仓库根目录运行。真实流程需要既有 D0 样例、受保护的本地凭据、Mailpit、Linux Docker 引擎与受信任开发证书。浏览器套件串行运行，Node 请求显式加载 AppHost 开发 CA。

```powershell
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
pnpm --dir src/Web/nexora-dashboard lint
pnpm --dir src/Web/nexora-dashboard typecheck
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard test:msw
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
try { pnpm --dir src/Web/nexora-dashboard build }
finally { Remove-Item Env:NUXT_PUBLIC_DATA_MODE }
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 180 --non-interactive
$d3Dashboard = aspire describe dashboard --apphost $nexoraAppHost --format Json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $d3Dashboard.resources[0].environment.NODE_EXTRA_CA_CERTS
try { pnpm --dir src/Web/nexora-dashboard test:e2e }
finally { aspire stop --apphost $nexoraAppHost --non-interactive }
```

启动前 AppHost 列表为空；本次启动了指定 AppHost 并等待 gateway 健康，真实验证结束后正常停止，`aspire ps` 确认剩余实例为 0。PostgreSQL、Redis、Keycloak 和 RabbitMQ 四个既有持久卷经 `docker volume inspect` 确认仍在。运行环境、凭据及原始日志保留于忽略的 `artifacts/p1/runtime/`，不进入公开验收产物。

公开证据：[去敏验证摘要](../../artifacts/dashboard-d3-original-ui/validation.json) · [UI 文件保留](../../artifacts/dashboard-d3-original-ui/ui-preservation.json) · [原商品页](../../artifacts/dashboard-d3-original-ui/live-catalog.png) · [原定义页](../../artifacts/dashboard-d3-original-ui/live-definitions.png) · [原伙伴页](../../artifacts/dashboard-d3-original-ui/live-partner.png) · [原财务映射卡片](../../artifacts/dashboard-d3-original-ui/live-finance-mappings.png)。

相关记录：[原 UI 的 D1](dashboard-d1-original-ui.md) · [D2](dashboard-d2-original-ui.md) · [接入 TODO](../ui-dashboard-api-integration-todolist.md)。D4 及后续阶段保持待完成。
