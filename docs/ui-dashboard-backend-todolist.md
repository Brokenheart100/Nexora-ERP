# Nexora Dashboard 后端能力对照的前端 UI TODO（纯 UI 阶段）

日期：2026-11-17。状态：**纯 UI 阶段，数据全部来自 `app/mocks/`，不接后端**。本文档把后端已具备的能力映射为界面、流程与状态清单，作为下一轮 UI 扩展依据；真实后端接入另行规划，不在本阶段执行。

范围：只改 `src/Web/nexora-dashboard/` 的 Nuxt UI 原型。所有列表、详情、表单、审批、导出都用模拟数据与本地状态实现；不新增 BFF、不调用 API、不改 AppHost、不修改 `nexora-web`。

参考：[根 todolist](../todolist.md) · [首轮 UI todo](ui-dashboard-todolist.md) · [原型验收记录](verification/web-ui-dashboard-prototype.md) · [计划](计划.md) · [架构](架构.md) · [C1–C23 业务待办](#c1-采购到付款) · [C9 起新增待办](#c9-定期开票) · [API 覆盖索引](#41-api-覆盖索引)

## 0. 口径

- **纯 UI**：页面不发起网络请求。列表、详情、搜索、筛选、分页、审批、保存都在浏览器内完成；刷新后恢复初始样例，并在界面上明确标注「本地原型 · 模拟数据」。
- **后端仅作参考**：后端端点、字段、状态机、权限与错误码用于确定 UI 的信息架构和状态覆盖，不调用、不联调；字段名以能表达业务含义为准。
- **桌面优先**：1440 宽度基准，不做移动端专项；继续使用 Nuxt UI 4、Carbon 图标、现有 Carbon 主题与 150–250ms 动效。
- **完成定义**（每项）：页面可点击走通；列表/详情/空态/加载态/错误态/无权限态有明确呈现；typecheck、lint、build 通过；桌面 light/dark 截图；控制台无错误；相关文档更新。
- **不纳入**：真实登录与 BFF、CSRF、令牌、服务端会话、AppHost、后端接口、数据库、外部供应商联调、移动端专项。国际化分阶段推进：首轮覆盖应用壳层与工作台（2026-11-19 已完成，见[原型验收记录](verification/web-ui-dashboard-prototype.md)），其余业务页保留中文，后续逐页迁移。
- **模拟数据分层**：`app/mocks/` 是唯一数据源；新增 `useMockAsync` 模拟延迟与失败，页面禁止出现 `$fetch`/`useFetch`。

## 1. 前置决策

| 编号 | 决策 | 推荐 | 理由 |
| --- | --- | --- | --- |
| D0 | UI 载体 | 继续在 `nexora-dashboard` 内演进，不迁移、不修改 `nexora-web` | 原型独立，改造成本最低；后端能力只作为设计依据。 |
| D1 | 路由与工作区 | 保留 `/`、`/catalog`、`/purchase-orders`；新增模块用一级路由（`/sales`、`/inventory`、`/finance`、`/settings`）；工作区切换继续用 Pinia store | 不引入路径参数与登录中间件，保持纯前端可点击。 |
| D2 | 数据层 | 扩展 `app/mocks/` 为按域拆分的 TypeScript 数据，用 `@faker-js/faker`（固定 seed）+ 类型工厂生成批量数据；新增 `useMockAsync` 统一 loading/error；写操作只改本地状态 | 不造网络层，避免让模拟数据看起来像真实接口；核心样例固定，填充数据可生成。 |
| D3 | 首批范围 | B1 壳层对齐 → B2 工作台增强 → B3 商品/伙伴 → B4 采购；之后 B5 销售、B6 库存、B7 财务、B8 组织 | 先把现有三页做深，再扩展新模块，减少空壳页面。 |
| D4 | KPI 与金额口径 | 工作台 KPI 用固定演示口径并在卡片脚注说明；金额统一用两位小数人民币字符串 | 纯 UI 阶段重点是信息层级与可读性，不追求真实聚合。 |
| D5 | 状态层 | 引入 `@pinia/nuxt` + Pinia store 管理跨页状态（工作区、演示用户/权限、通知已读、侧栏与主题偏好）；页面局部交互仍用 `ref` | 与 `nexora-web` 的 Pinia 基线一致，避免共享状态散落在 `useState` 和 props；刷新后重置为 mock 初始值。 |
| D6 | 校验与组合式工具 | `zod` 负责表单/筛选参数/`?state=` 的 schema 校验，`@vueuse/nuxt` 负责防抖、断点、可见性观察等组合式工具；不引入 vee-validate 或动画运行时 | 与 Nuxt UI `UForm` 原生 Standard Schema 对齐，减少手写样板；动画仍以 CSS 为主。 |

## 2. 后端能力参考（只读，不调用）

> 下表只用于对齐页面形状、字段和状态，不代表本阶段会调用这些端点。

| 域 | 后端已有能力 | 目标 UI | 模拟数据要点 |
| --- | --- | --- | --- |
| 身份 / 会话 | 当前用户、会话列表、MFA、账户安全 | 账户菜单、安全提示与模拟会话操作，见 C22 | 演示用户、多个会话、MFA 与登录渠道状态 |
| 组织 / 工作区 | 工作区、权限集合、公告、公司设置、审计 | 工作区切换、公司设置、公告、审计 | 3 个工作区、权限集合、3 条公告、8 条审计 |
| 成员 / 治理 | 成员、角色、自定义角色、部门、邀请 | 成员列表、角色矩阵、部门树、邀请 | 12 名成员、4 个角色、5 个部门、3 条邀请 |
| 计费 | 套餐、权益、用量、订阅 | 订阅与权益页、模块显隐演示 | 3 个套餐、权益键、月度单据用量 |
| 主数据 | 商品、分类/单位等定义、往来单位、变更记录 | 商品目录/详情/编辑、伙伴档案、定义维护、变更记录 | 18 个商品（已有）、10 个伙伴、6 个定义、10 条变更 |
| 采购 | 采购单、审批、收货许可、审计 | 采购列表/详情/新建/审批/收货/审计 | 现有 8 单，补 1 张 12 行长单与 2 个审批中状态 |
| 销售 | 报价、销售单、转单、审批、履约许可 | 销售列表/详情/新建/转单/审批/履约 | 10 单，覆盖报价到关闭 5 种状态 |
| 库存 | 仓库、库存位置、流水、收发货、盘点调拨、退货 | 仓库总览、库存表、流水、收货/出库/调拨流程 | 3 个仓库、30 个库存位置、20 条流水 |
| 财务 | 账簿、科目、凭证、期间、报表、应收、税务、银行 | 财务工作台、科目树、凭证、报表、账龄、税务、银行对账 | 30 个科目、12 张凭证、4 类报表、账龄与税期样例 |
| 报表 / 审计 / 搜索 | 工作区投影、审计、变更记录 | 工作台“数据就绪”态、最近动态、命令面板搜索 | 演示状态开关与 10 条最近记录 |
| AI 助手 | 运行、会话、工具审批、能力查询 | 工作区内的助手面板，见 C23 | 本地消息、执行记录与待审批工具调用 |

## 3. 分波次 UI 清单

### B0 模拟数据与全局底座

> 状态：已完成（2026-11-17）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 扩展 `app/mocks/`：按域拆成 `workspaces.ts`、`catalog.ts`、`partners.ts`、`purchasing.ts`、`sales.ts`、`inventory.ts`、`finance.ts`、`organization.ts`，统一从 `index.ts` 导出。
- [x] 引入 `@faker-js/faker`（按需放 `dependencies` 或 `devDependencies`）并固定 seed（`faker.seed(20261117)`）；编写 `makeProduct`、`makePartner`、`makePurchaseOrder`、`makeSalesOrder`、`makeInventoryPosition`、`makeJournalEntry` 等类型工厂，核心业务样例保持固定，批量填充数据用 Faker 生成。
- [x] 明确模拟数据边界：不引入 MSW、json-server 或 Service Worker；所有数据由 `app/mocks/` 在本地生成，页面不出现 API 地址或请求代码。
- [x] 补齐跨域类型：成员、角色、部门、邀请、报价、销售单、仓库、库存位置、科目、凭证、报表行、审计条目；金额用 `string`，日期用 `YYYY-MM-DD` 或 ISO。
- [x] 新增 `app/composables/useMockAsync.ts`：模拟 300–600ms 延迟，支持 `loading`、`error`（由 `?state=error` 触发）与取消；页面统一使用骨架屏。
- [x] 新增 `app/composables/useMockPermissions.ts`：演示用户权限集合与 `can(permission)`；导航、按钮、空态共用同一套假权限。
- [x] 引入 `@pinia/nuxt` `1.0.3` 与 `pinia` `4.1.0`（与仓库基线一致），在 `nuxt.config.ts` 注册模块；建立 `app/stores/`：`useWorkspaceStore`（当前工作区、切换、按工作区过滤）、`useSessionStore`（演示用户与权限）、`useUiStore`（侧栏折叠、主题偏好、通知已读）。把现有 `useState` 和页面内共享 `ref` 迁移到 store；store 只持有跨页 UI 状态，初始数据仍来自 `app/mocks/`，刷新后重置。
- [x] 引入 `zod` `4.6.7`（与仓库基线一致）：为新增/编辑表单、列表筛选参数和 `?state=` 定义 schema；`UForm` 的 `schema` 直接使用 Zod，不引入 vee-validate；mock 工厂的 `overrides` 用 `Partial<z.infer<...>>` 约束。
- [x] 引入 `@vueuse/nuxt` `15.0.0`：搜索用 `useDebounceFn`，断点用 `useMediaQuery`，图表/时间线进入动画用 `useIntersectionObserver`，复制用 `useClipboard`；仅侧栏、主题等 UI 偏好可用 `useLocalStorage`，业务数据仍刷新重置。
- [x] 建立新模块空壳路由与侧栏入口：`/sales`、`/inventory`、`/finance`、`/settings`，先放页面标题、说明与骨架，再逐页填充。
- [x] 全局状态演示：`?state=loading|empty|error|forbidden` 可在任意列表页切换，便于截图与验收。
- [x] 统一状态映射：采购/销售/库存/财务状态标签继续用文字+颜色，不新增只靠颜色表达的状态。
- [x] 把「本地原型 · 模拟数据」提示扩展到所有新增页面；写操作 toast 明确「仅本次预览，刷新后恢复」。

### B1 壳层、身份与全局框架（模拟）

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 引入 `@nuxt/fonts` `1.2.0`，自托管 IBM Plex Sans（400/500/600/700）并 preload；验证字体加载无闪动、无布局偏移，更新 `--font-sans` 与验收记录中的回退说明。开发服务器不输出字体 `preload` 标签，生产构建已验证 `<link rel="preload" as="font">` 与自托管 `.woff2`。
- [x] 账户菜单补会话列表、MFA 状态与「安全设置」入口（只读演示）；用户信息统一来自 mock。
- [x] 工作区切换后所有新页面重新取 mock 数据；侧栏徽标按当前工作区变化。
- [x] 通知中心补公告、待审批、库存预警三类来源；支持全部已读与单条已读。
- [x] 命令面板扩展到商品、伙伴、采购单、销售单、发票与页面；结果全部来自 mock，并标注来源。
- [x] 面包屑与页面标题覆盖新模块；保留「工作台 / 模块 / 详情」三级。
- [x] 全局错误页补齐 403、404、500 三种演示入口；403 提供「切换工作区」演示动作。

### B2 工作台增强

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] KPI 卡片脚注统一为演示口径；补「应收/应付」「库存预警」两张卡，点击进入对应模块空壳。
- [x] 月度趋势支持「采购额 / 销售额 / 应收」三指标切换，图表数据全部来自 mock。
- [x] 待办补分组（审批 / 草稿 / 逾期）与「全部完成」空态；完成后保留可撤销提示。
- [x] 最近单据补销售单与发票类型，状态标签与列表页复用同一映射。
- [x] 最近动态接入审计 mock，支持按类型筛选与「查看全部」跳转。
- [x] 工作台首屏增加「数据更新时间」与手动刷新；刷新使用 `useMockAsync` 并展示骨架。
- [x] 工作台空态：无待办、无单据、无动态三种组合各有一张截图。

### B3 商品、伙伴与定义

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 商品目录补「新建商品」抽屉，保存后加入本地列表；校验名称/SKU/单价/库存。
- [x] 商品详情抽屉补引用信息（采购/销售/库存引用数）与变更记录；归档/恢复用本地状态演示。
- [x] 商品列表补批量选择与批量归档/恢复（只改本地），并显示已选数量。
- [x] 伙伴档案页：列表、搜索、类型筛选、详情抽屉、编辑保存；覆盖客户/供应商/捐赠人三类。
- [x] 定义维护页：分类、单位、税码三个页签；新增/编辑用抽屉，删除前显示引用提示。
- [x] 变更记录页：商品/伙伴/采购单共用时间线组件，支持分页与操作者筛选。
- [x] 导入导出：商品 CSV 导入仍为演示，导出使用当前筛选结果；伙伴导出同样处理。
- [x] B3 空态：搜索无结果、筛选无结果、无变更记录三种。

### B4 采购

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 采购列表补状态/供应商/日期筛选（本地筛选），保留分页与「当前页筛选」提示。
- [x] 采购详情补审批轨迹、关联收货与审计记录；长单据支持表格内部滚动。
- [x] 新建/编辑采购单：抽屉表单含供应商、预计到货、明细行增删改；保存为草稿或提交审批（本地）。
- [x] 审批动作：批准/驳回更新本地状态并写入审批轨迹；按钮按假权限显示。
- [x] 收货流程：从已批准单据发起收货，填写收货数量并推进到「部分收货/已收货」；许可处理中用模拟 loading。
- [x] 采购审计页：按单据筛选、分页、导出 CSV（本地生成）。
- [x] 采购单打印预览：使用打印样式展示单据摘要与明细，不接 PDF 服务。
- [x] B4 空态与错误态：无采购单、审批被驳回、收货超量提示。

### B5 销售与应收

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 销售列表：报价/销售订单两种类型，状态、客户、日期筛选与分页。
- [x] 销售详情：明细、金额、审批轨迹、关联履约；报价与订单使用不同状态条。
- [x] 新建销售单/报价：客户、明细、价格、有效期；保存草稿与提交审批（本地）。
- [x] 报价转销售单：确认对话框展示转换后单号，转换后跳新单详情。
- [x] 审批与履约：批准/驳回、发起履约、部分履约/完成（本地状态机）。
- [x] 应收工作台：应收总额、逾期账龄、待开票单据；图表与列表均为 mock。
- [x] 发票列表/详情：状态、金额、客户、开票日期；PDF 预览用占位面板并标注「演示」。
- [x] 发票分享与寄送：复制分享链接、发送记录、失败重试（全部本地模拟）。
- [x] 定期开票：计划列表、暂停/恢复、下次执行时间；不实现真实调度。

### B6 库存

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 仓库总览：3 个仓库卡片，展示地址、负责人、库存种类与预警数；点击进入仓库详情。
- [x] 库存位置表：商品、数量、可用量、批次；支持仓库切换、搜索与分页。
- [x] 库存流水：按商品/类型/时间筛选；单据号可跳转到采购或销售详情（mock 跳转）。
- [x] 收货流程：从采购单带入商品与数量，确认后更新库存位置与流水（本地）。
- [x] 出库流程：从销售履约单带入，确认后扣减库存并生成流水。
- [x] 盘点/调拨：创建盘点单、录入实盘数、差异高亮；调拨选择源/目标仓库并更新两边库存。
- [x] 低库存视图：跨仓库汇总零库存/低于演示阈值的商品，阈值在页面标注。

### B7 财务

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md)。

- [x] 财务工作台：建账状态、期间状态、待办（凭证/应收/税务）与快捷入口；未建账时显示引导。
- [x] 科目表：树形展示、搜索、新增/编辑科目（本地）；显示科目类型与余额方向。
- [x] 凭证列表/详情：期间、状态、借贷金额；借贷平衡校验在本地完成。
- [x] 新建凭证：分录行增删、科目选择、借贷自动合计；保存草稿与提交审批（本地）。
- [x] 期间与年结：月份开关、关账检查清单、年结预览；状态变化只影响本地演示数据。
- [x] 财务报表：试算平衡/利润表/资产负债表/现金流量表四个页签，使用 mock 行数据与图表；支持期间切换。
- [x] 账龄与伙伴账：应收/应付账龄表、伙伴明细账；金额右对齐并可钻取到 mock 单据。
- [x] 税务：税期日历、申报状态、税率/税组列表；申报动作只更新本地状态。
- [x] 银行与对账：账户卡片、流水导入预览、匹配/排除/对账完成（本地演示）。

### B8 组织、治理与计费

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md#b8-组织治理与-b9-全局体验2026-11-18)。

- [x] 公司设置：名称、国家、本位币、时区、开票信息；保存只更新本地状态。
- [x] 成员列表：角色/部门调整、停用/恢复、批量邀请；按假权限显示操作。
- [x] 邀请管理：创建邀请、复制链接、撤销、过期/已兑换状态。
- [x] 角色与权限矩阵：角色列表 + 权限分组勾选；自定义角色仅前端演示。
- [x] 部门树：增删改与成员归属；拖拽排序可后置。
- [x] 订阅与计费：套餐对比、当前权益、用量进度、升级/取消入口（本地对话框）。
- [x] 审计：分页、操作者/类型/时间筛选、CSV 导出（本地）。

### B9 全局体验与质量

> 状态：已完成（2026-11-18）。验收命令、结果与截图见 [原型验收记录](verification/web-ui-dashboard-prototype.md#b8-组织治理与-b9-全局体验2026-11-18)。

- [x] 命令面板：完整键盘导航、分组、最近访问与空结果态；⌘K 提示保持一致。
- [x] 通知与待办：未读计数、单条已读、全部已读、空态；刷新后仍保留本地已读状态（sessionStorage）。
- [x] 全局搜索演示：页面 + 商品 + 采购单 + 销售单，结果标注来源；无跨域搜索时明确「演示范围」。
- [x] 表格密度：紧凑/标准两档切换（至少商品与采购列表），并记住选择。
- [x] 表格列宽：全部列表与详情表支持拖拽列宽，Carbon 风格分隔条、实时跟手、横向滚动自适应；拖拽前按当前视觉宽度初始化，刷新页面恢复默认。
- [x] 测试工具链：引入 `@nuxt/test-utils` `4.4.0`、`vitest` `5.1.0`、`@vue/test-utils` `2.6.0` 与 `happy-dom` `21.0.4`（全部为 `devDependencies`）；`vitest.config.ts` 使用 Nuxt 测试环境，`ResizableTable` 冒烟测试通过；不引入 MSW、json-server 或 Service Worker。
- [x] 键盘与焦点：所有抽屉/对话框焦点陷阱、Esc 关闭、Tab 顺序；表格行可键盘打开。
- [x] 动效：新增页面卡片悬停、表格行、抽屉与 Toast 过渡；`prefers-reduced-motion` 下全部关闭。
- [x] 打印：采购单/销售单/报表的打印样式，隐藏侧栏与操作列，保留单据头与金额。

### B10 验收

> 状态：已完成（2026-11-18）。最终构建、浏览器验收与文档收口见 [原型验收记录](verification/web-ui-dashboard-prototype.md#b8-组织治理与-b9-全局体验2026-11-18)。

- [x] 每个波次后跑 `install --frozen-lockfile`、`typecheck`、`lint`、`build`，结果写入验收记录。
- [x] 用临时 Playwright 脚本走通新增主路径（不提交脚本），断言无 console error；桌面 1440×1000。
- [x] 每波次至少 4 张截图（列表 light、详情 light、dark、空态/错误态），存入 `artifacts/ui-dashboard-*/`。
- [x] 更新 [原型验收记录](verification/web-ui-dashboard-prototype.md) 与 [根 todolist](../todolist.md) 的完成状态。
- [x] 全量回归现有三页：工作台、商品目录、采购订单的操作与截图不退化。

### C1 采购到付款

> 状态：已完成（2026-11-18） · [验收记录](verification/web-ui-dashboard-prototype.md#c1-采购到付款2026-11-18)

在采购单与收货详情补供应商账务入口，沿原单、收货行和账单查回来源。[采购到付款](架构.md#112-采购到付款) · [供应商账务 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs) · [旧版供应商账务](../src/Web/nexora-web/app/components/finance/banking/WorkspaceTrade.vue)

- [x] 展示收货的计价、暂估和账单匹配状态。用分批收货样例显示各行已匹配和可匹配的数量，提供价差待审核的反馈。
- [x] 增加供应商账单录入和复核。选择还可匹配的收货行，核对数量、税额和总额，过账后显示应付余额和关联单据。
- [x] 增加供应商付款。选择未结账单和资金账户，登记部分或全额付款，回看付款记录、已付及剩余金额。对超额付款或重复提交给出反馈，余额保持正确。
- [x] 用已确认退货的样例演示供应商贷项和退款，详情能查到原收货行、原账单及贷项。
- [x] 用固定算例验收。账单金额为 1,130.00 元，支付 600.00 元后，账单详情与应付账龄均显示未结 530.00 元。登记余款后显示已结清。[C03 采购到付款](domain/p0-policies.md#c03--采购到付款)

### C2 销售到收款

> 状态：已完成（2026-11-18） · [验收记录](verification/web-ui-dashboard-prototype.md#c2-销售到收款2026-11-18)

在销售与应收中延伸已有报价、订单、履约和发票页面。应收界面展示发票、收款与核销各自的单据和余额。[销售到收款](架构.md#111-销售到收款) · [客户应收 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Receivables/ReceivableEndpoints.cs) · [旧版客户应收](../src/Web/nexora-web/app/components/finance/receivables/WorkspaceReceivables.vue)

- [x] 从已发货明细录入或编辑发票草稿，显示可开票数量和来源，演示发票生效及更正入口。
- [x] 将「标记已收款」改为登记客户收款。选择客户、资金账户和收款日期，保存为独立收款单并显示可核销余额。
- [x] 增加核销抽屉。选择同一客户的收款单和未结发票，输入部分或全额核销金额，展示发票未结和款项剩余可用金额。超额时提示可用上限。
- [x] 用已确认销售退货的样例演示关联贷项、核销与客户退款，保留发票、退货和款项关联。
- [x] 用固定算例验收。发票金额为 1,130.00 元，先登记 500.00 元收款，核销前显示这笔款项可用。核销后，发票详情与应收账龄均显示未结 630.00 元。[C04 销售到收款](domain/p0-policies.md#c04--销售到收款)

### C3 库存收发货、退货与商品表单

> 状态：已完成（2026-11-18） · [验收记录](verification/web-ui-dashboard-prototype.md#c3-库存收发货退货与商品表单2026-11-18)

- [x] 从采购和销售详情查看收发货许可，补待执行许可的取消及单据剩余额度的关闭入口。仓库按许可确认收发货，页面同步显示执行记录。[采购收货许可](../src/Services/Purchasing/Nexora.Purchasing.Api/Endpoints/PurchaseReceiptEndpoints.cs) · [销售发货许可](../src/Services/Sales/Nexora.Sales.Api/Endpoints/SalesFulfillmentEndpoints.cs)
- [x] 从原收货或发货记录发起采购或销售退货，展示可退、已退及待确认数量。模拟确认与取消，对超出可退量的输入给出反馈。已确认退货可打开对应贷项流程。[采购退货 API](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/InventoryEndpoints.cs) · [销售退货 API](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/SalesStockEndpoints.cs)
- [x] 按商品新增与更新的请求模型调整表单。商品页展示库存余量，数量修改从库存操作进入，单价在单据行录入。[商品请求契约](../src/Services/MasterData/Nexora.MasterData.Api/Contracts/Requests/Catalog/CatalogRequests.cs)

### C4 工作区初始化与业务授权

> 状态：已完成（2026-11-18） · [验收记录](verification/web-ui-dashboard-prototype.md#c4-工作区初始化与业务授权2026-11-18)

- [x] 补创建企业工作区后的初始化向导，依次演示公司资料、会计年度与开账、科目模板、可选税制，以及稍后继续。[旧版工作区初始化](../src/Web/nexora-web/app/components/workspace/WorkspaceSetup.vue)
- [x] 在角色设置中补按部门、仓库和财务期间的授权范围，以及申请、独立审批和拒绝状态。用两种模拟身份验证制单人与审批人的可用按钮。[角色授权 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/CustomRoleEndpoints.cs) · [业务权限验收](verification/f07-resource-scope-approvals.md)

### C5 财务期初与报表导出

> 状态：已完成（2026-11-18） · [验收记录](verification/web-ui-dashboard-prototype.md#c5-财务期初与报表导出2026-11-18)

- [x] 补总账期初导入和库存、未结应收应付、银行现金子账的批次预览。展示校验差异、独立复核、库存入账处理中及过账结果，能由批次查回来源。[总账期初 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/OpeningBalanceEndpoints.cs) · [期初子账 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/OpeningSubledgerEndpoints.cs)
- [x] 在财务报表补导出记录，演示按已选期间生成、查看状态、下载文件和按原快照重建。[报表导出 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Reporting/ReportExportEndpoints.cs)

### C6 退货与库存、流水联动

> 状态：已完成（2026-11-18） · [验收记录](verification/web-ui-dashboard-prototype.md#c6-退货与库存流水联动2026-11-18)

优先从现有采购和销售详情进入退货确认。退货确认后，相关页面读取同一个工作区的模拟库存和流水。[退货规则](架构.md#111-销售到收款) · [C3 验收缺口](verification/web-ui-dashboard-prototype.md#c3-库存收发货退货与商品表单2026-11-18)

- [x] 确认采购退货时减少原收货仓的库存，确认销售退货时增加收回仓的库存。按退货明细生成库存流水，能由流水打开退货单及原收货或发货记录。
- [x] 按原始明细的开票状态更新账务。未开票部分减少可匹配或可开票数量，已开票部分沿原账单或发票进入贷项流程。
- [x] 用两组初始库存均为 100 件的样例验收。分别退回 5 件后，采购退货样例显示 95 件，销售退货样例显示 105 件。退货详情、库存位置和流水数量一致，重复确认、取消待确认退货和超量输入均保持库存及流水正确。

### C7 付款作废与银行对账更正

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c7-付款作废与银行对账更正2026-11-19)

- [x] 从已过账的供应商付款发起作废更正，显示原付款、关联账单、冲销记录和更正后的银行流水。沿用 C1 算例，作废 600.00 元付款后，账单详情和应付账龄的未结金额均由 530.00 元恢复为 1,130.00 元。[付款作废规则](../src/Services/Finance/Nexora.Finance.Application/UseCases/Trade/TradeUseCases.Posting.cs)
- [x] 补对账单流水的解除匹配入口。解除后回到待匹配，验收可重新选择资金流水完成匹配。[流水匹配 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs)
- [x] 补撤销同一账户最近一次已完成对账的入口，填写原因后显示撤销状态及说明，并能重新对账。用两次已完成对账验证撤销顺序。[对账撤销规则](../src/Services/Finance/Nexora.Finance.Application/UseCases/Banking/BankReconciliations.cs)

### C8 期初来源与入账结果追溯

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c8-期初来源与入账结果追溯2026-11-19)

- [x] 由期初批次生成关联的模拟凭证、库存流水、应收应付单据与银行流水，用这些记录汇总过账结果中的编号和数量。[期初过账逻辑](../src/Services/Finance/Nexora.Finance.Application/UseCases/Accounting/Ledger/OpeningSubledgers.Posting.cs)
- [x] 将来源与过账结果链接到具体模拟记录。打开对应详情后能回到原批次，核对来源行、单据编号和金额。[C5 验收缺口](verification/web-ui-dashboard-prototype.md#c5-财务期初与报表导出2026-11-18)
- [x] 保留一条可重复运行的浏览器验收用例，从预览、独立复核和过账走到结果明细及回跳。核对每笔结果都能定位到对应批次和来源行，结果数量与生成的模拟记录一致。

### C9 定期开票

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c9-定期开票2026-11-19)

- [x] 扩展销售页已有的定期开票页签。补新建、编辑与计划详情，选择客户和服务项目，录入数量、单价、首期日期、结束日期、按月间隔和付款账期，展示未来执行日期。暂停、恢复与编辑后同步刷新下次执行日。[定期开票 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Invoicing/RecurringEndpoints.cs) · [计划字段](../src/Services/Finance/Nexora.Finance.Application/DTOs/Receivables/RecurringInvoiceDtos.cs)
- [x] 模拟手动执行及跳过到期日。执行历史显示日期、模板版本、生成的发票及跳过记录，由历史进入现有发票详情继续复核。验收同一计划同一天重复执行仅生成一张待复核发票，遇到期间阻断时保留待处理原因及下次执行日。[执行与跳过规则](../src/Services/Finance/Nexora.Finance.Application/UseCases/Receivables/RecurringInvoices.cs)

### C10 外部凭证

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c10-外部凭证2026-11-19)

- [x] 在总账补外部凭证录入，按外部来源与凭证编号登记，复用现有分录表单核对业务日期、摘要、科目及借贷。凭证列表和详情保留来源与外部编号。重复导入同一来源编号、借贷不平或期间关闭时，保留修改入口和具体提示。[凭证 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/LedgerEndpoints.cs) · [外部凭证规则](../src/Services/Finance/Nexora.Finance.Application/UseCases/Accounting/Ledger/ImportedJournals.cs)
- [x] 补外部凭证多选，支持批量提交复核、取消及独立过账。验收同一批次最多选 50 张外部凭证，混入非外部凭证、状态不符或版本冲突时提示具体记录，保留整批原状态。成功后在总账查到凭证及其来源。[旧版批量凭证](../src/Web/nexora-web/app/components/finance/accounting/ImportedJournalBatch.vue)

### C11 捐赠收据

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c11-捐赠收据2026-11-19)

- [x] 在财务补捐赠录入、独立复核和过账后查看收据的路径。选用捐赠人档案，登记现金、支票、卡或转账及适用的资金账户，沿捐赠单追溯资金流水与凭证。普通捐赠收据用本地样张预览或打印，作废后能查看原单和冲销记录。[交易 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs) · [捐赠收据 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Donations/DonationReceiptEndpoints.cs)
- [x] 展示已开具财政票据的关联记录，录入票据代码、号码和开具日期。当前能力样例显示法定票据不可签发，普通收据和已关联的外部票据分别标明类型。[捐赠票据关联与寄送 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Donations/DonationReceiptRecordsEndpoints.cs) · [财务能力查询](../src/Services/Finance/Nexora.Finance.Api/Endpoints/FinanceCapabilityEndpoints.cs)
- [x] 模拟收据邮件的收件人校验、发送记录详情、失败或结果未知后的处理，以及按状态重试、重寄或放弃。验收重试与重寄有清晰的记录关联，渠道停用时显示原因。[捐赠邮件规则](../src/Services/Finance/Nexora.Finance.Application/UseCases/Donations/DonationReceiptMail.cs)

### C12 采购、销售单据操作与往来档案

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c12-采购销售单据操作与往来档案2026-11-19)

- [x] 补采购和销售订单已提交撤回、草稿取消和销售报价正式发出。区分制单、审批与退回修改，按工作区、业务角色和单据状态控制入口。验收销售报价发出后转单，采购单撤回后可重新提交，审批人无法通过自己提交的单据。[采购单 API](../src/Services/Purchasing/Nexora.Purchasing.Api/Endpoints/PurchaseEndpoints.cs) · [销售单 API](../src/Services/Sales/Nexora.Sales.Api/Endpoints/SalesEndpoints.cs)
- [x] 补客户、供应商、捐赠人档案的新建和多角色选择。支持一个主体同时具有多个角色，维护地址、税号与多个联系人，编辑时将档案编号作为只读字段。验收停用后该主体退出新单据的适用选择项，既有单据仍能查看原信息。[伙伴 API](../src/Services/MasterData/Nexora.MasterData.Api/Endpoints/Partners/PartnerEndpoints.cs) · [档案字段](../src/Services/MasterData/Nexora.MasterData.Api/Contracts/Requests/Partners/PartnerRequests.cs)
- [x] 收口商品、分类和单位的可编辑字段，详情展示商品或服务、是否跟踪库存。将商品表单中的单价录入移到交易行、库存调整移到仓库流程。定义维护用启用、停用和引用提示，税组移到 C16。验收新单据只选择启用的引用项，历史单据仍可查看原信息。[目录 API](../src/Services/MasterData/Nexora.MasterData.Api/Endpoints/Catalog/CatalogEndpoints.cs) · [目录字段](../src/Services/MasterData/Nexora.MasterData.Api/Contracts/Requests/Catalog/CatalogRequests.cs)
- [x] 在 C1、C2 的应付与应收入口补采购暂估状态及适用的处理动作、应付与应收科目映射状态。对供应商账单、客户收款、核销等适用单据分开显示提交、独立复核过账及过账前取消，核对库存暂估或已过账金额只在相应业务处理完成后更新。[采购账务 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs) · [客户应收 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Receivables/ReceivableEndpoints.cs)

### C13 仓库管理、盘点与在途调拨

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c13-仓库管理盘点与在途调拨2026-11-19)

- [x] 补新建仓库和指定收货人入口。仓库详情显示有权接收许可或调拨的人员，模拟更换收货人后相关操作权限随之变化。[仓库 API](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/InventoryEndpoints.cs)
- [x] 盘点调整展示账面数量、实盘数量、差异、原因和确认或取消记录。调拨从来源仓发起，按权限独立确认出库、展示在途数量及成本，再由目标仓指定收货人确认入库。验收到货前目标仓可用量保持原值，收货后两端流水可由同一调拨单追溯，重复确认不重复增减库存。[库存操作 API](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints/StockOperationEndpoints.cs) · [库存状态与权限](../src/Services/Inventory/Nexora.Inventory.Application/UseCases/Stock/StockOperations.cs)

### C14 资金账户、银行流水与对账

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c14-资金账户银行流水与对账2026-11-19)

- [x] 补创建银行或现金账户、选择会计科目、设置默认账户、查看余额和资金流水。加上其他收入、费用、资金划转及业主投入和提款的录入与复核，关联凭证及适用的作废记录。验收划转后两账户金额方向相反，按同一单据追溯。[资金与交易 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs)
- [x] 把对账单导入串成选择账户、CSV 列映射、预览问题行、提交与查阅批次。对账单行可匹配已有资金流水，也可带入适用的收入、费用或供应商付款等交易。显示已匹配与剩余金额、分次匹配、排除和恢复原因，沿用 C7 的解除匹配。验收重复导入和超额匹配均有明确反馈。[银行流水导入和匹配 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Trade/TradeEndpoints.cs) · [旧版导入](../src/Web/nexora-web/app/components/finance/banking/WorkspaceBankImport.vue)
- [x] 补银行对账预览、确认前的对账记录、取消待完成对账与对账报告预览。按截止日期和银行期末余额显示账面余额、未达项与差异，满足条件后开放独立确认。沿用 C7 的最近一次对账撤销规则。[银行对账 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Banking/BankReconciliationEndpoints.cs)

### C15 总账、科目与关账年结

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c15-总账科目与关账年结2026-11-19)

- [x] 手工凭证补草稿编辑、待复核、取消、独立过账，以及按过账日期和原因发起冲销。凭证详情能查看原凭证、冲销和业务来源。补已过账凭证之间的关联、移除关联和异常扫描，演示重复关联或来源失效的反馈。[总账 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/LedgerEndpoints.cs) · [凭证关联规则](../src/Services/Finance/Nexora.Finance.Application/UseCases/Accounting/Ledger/LedgerUseCases.Links.cs)
- [x] 科目树补科目用途、归档与恢复限制。补模板、结构和快照导出，以及科目文件的导入预览、逐行错误和提交结果，演示新增、合并及空账簿允许替换的规则。验收已用科目的限制和导入后期初余额保持正确。[科目表 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/ChartEndpoints.cs) · [旧版科目导入](../src/Web/nexora-web/app/components/finance/accounting/WorkspaceChart.vue)
- [x] 财务工作台补就绪检查。显示账簿、期初状态、已过账但缺凭证的单据和待入账库存成本。模拟按截止日补记库存成本并展示成功与阻断记录，能打开相关来源。[财务就绪与成本补记 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/ReadinessEndpoints.cs)
- [x] 补月度期间详情、关账检查与状态历史，演示开启期间、开始关账、待处理事项清零后关闭、填写原因重开。补年结预览、申请、独立确认或取消、重开和结转或冲销凭证回链。验收已年结的年度需要先重开才能重开其中的月份。[期间 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/LedgerEndpoints.cs) · [年结 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/FiscalYearEndpoints.cs)
- [x] 补按会计年度设置合伙人份额、资本和提款科目，联动 C14 的资金流水与 C18 的权益变动表。在年结预览中核对合伙份额分摊、科目和金额，并展示配置无效时的提示。[合伙权益 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Accounting/PartnershipEndpoints.cs)

### C16 税率、税组与申报更正

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c16-税率税组与申报更正2026-11-19)

- [x] 补带生效日期的税率版本、税组维护、商品和往来单位税组绑定。按适用税组展示含税或未税、折扣、拆税、舍入和计算快照。验收新税率只影响适用日期内的新计算，已生效单据保留原税率和金额。[税务设置与计算 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Tax/TaxEndpoints.cs)
- [x] 补按月或季度、权责发生制或收付实现制的税历，首笔申报记录后展示设置锁定状态。税期详情展示分税项汇总、申报编号、记录历史、差异及有权限时的账簿锁定选项。核对税额变化后重新预览、填写更正原因、提交新记录并追溯原记录。[税期与申报 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Tax/TaxFilingEndpoints.cs)

### C17 发票编号、PDF 与交付

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c17-发票编号pdf-与交付2026-11-19)

- [x] 补发票编号格式、起始号和指定日期的下一个编号预览。开票复核时展示候选编号，并在版本或编号变动时提示重新确认。验收过账后锁定正式编号，既有发票保留原编号。[应收与编号 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Receivables/ReceivableEndpoints.cs)
- [x] 用本地样张展示草稿预览、正式发票和公司抬头。补分享记录、有效期、复制及撤销，分享预览页演示有效、过期、已撤销和不可用状态。验收分享状态变化可从发票详情和分享预览互相核对。[发票 PDF 与分享 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Invoicing/InvoicePdfEndpoints.cs)
- [x] 在现有寄送记录中补收件人录入、投递详情、失败或结果未知后的处置及符合状态的重试、重寄、放弃；与 C11 复用发送记录呈现。展示平台寄送渠道的能力状态以及当前工作区发件人配置的可用性。[发票寄送 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Invoicing/InvoiceMailEndpoints.cs) · [财务能力查询](../src/Services/Finance/Nexora.Finance.Api/Endpoints/FinanceCapabilityEndpoints.cs)

### C18 财务报表、账龄与工作台投影

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c18-财务报表账龄与工作台投影2026-11-19)

- [x] 在既有四张财务报表补受支持的日期区间、上期对比、损益表核算口径和报表行到凭证的钻取。补权益变动表和单年度合伙权益明细，沿用 C5 的导出记录，并用同一报表期间和水位生成预览与报告。验收更换报表口径后已过账凭证保持原值。[财务报表 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Reporting/FinancialReportEndpoints.cs) · [权益变动查询](../src/Services/Finance/Nexora.Finance.Application/Handlers/Queries/Reporting/EquityChanges.cs)
- [x] 账龄补截止日及账龄快照，客户和供应商明细账补日期区间、期初和期末余额、关联的增加与减少及单据回跳。用 C1、C2 的固定算例验收回跳前后使用同一期间与余额口径。[账龄与往来明细 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Reporting/OpenItemEndpoints.cs)
- [x] 在工作台呈现财务概览的日期区间与明细入口，区分财务数据的过账水位与工作区投影的版本和更新时间。用样例演示投影待生成、已就绪和暂不可用，切换工作区后按当前工作区展示有效数据。[财务概览 API](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Reporting/OpenItemEndpoints.cs) · [工作区投影 API](../src/Services/Reporting/Nexora.Reporting.Api/Endpoints/ProjectionEndpoints.cs)

### C19 工作区、邀请与权限治理

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c19-工作区邀请与权限治理2026-11-19)

- [x] 从工作区切换器补企业和个人工作区创建入口，企业流程复用 C4 的初始化。补个人账本与公司链接和解除，验收切换后数据和权限按工作区隔离。公司设置补公司标识、品牌、日期格式、时区、会话空闲期限及授权审批人数。[工作区 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Workspaces/WorkspaceEndpoints.cs) · [个人账本链接](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Workspaces/WorkspaceLinkEndpoints.cs) · [公司设置 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Companies/CompanySettingsEndpoints.cs)
- [x] 补邀请详情、需要独立批准的业务角色邀请及受邀者接受页面。演示邀请有效、待批准、已撤回、已兑换、过期及账户不匹配，接受后可切换到对应工作区。成员详情分开处理组织角色与采购、销售、财务业务角色，展示最后管理员操作受阻的反馈。[邀请与成员治理 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/GovernanceEndpoints.cs) · [旧版接受邀请](../src/Web/nexora-web/app/pages/join.vue)
- [x] 延伸 C4 的授权范围，展示自定义角色修订、授权有效期、一人或两人审批进度和撤销授权。按服务返回的范围和动作呈现授权及部门维护。验收待审批、到期和已撤销的授权对相应单据的操作权限正确。[自定义角色 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance/CustomRoleEndpoints.cs)
- [x] 通知中心按模拟工作区、可见权限和有效期查询公告，展示标题、正文及到期时间。切换身份或工作区后重新确认可见范围，保留 B1 的本地已读交互。[工作区公告 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Workspaces/WorkspaceAnnouncementEndpoints.cs)

### C20 审计与业务变更追溯

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c20-审计与业务变更追溯2026-11-19)

- [x] 在现有审计和变更记录入口完善组织、财务、采购、销售的专项审计，以及含主数据和库存的业务变更记录。按时间、对象、操作与操作者查看记录，展示可用的单据版本、变更字段与来源回跳。用换角色、调拨、过账和冲销等样例核对展示与权限。
- [x] 按各服务实际支持的筛选条件模拟分页及 CSV 下载。验收同一筛选的展示和下载范围一致，能从工作台最近动态、单据详情或设置进入对应记录。[组织审计与变更](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Governance) · [财务审计与变更](../src/Services/Finance/Nexora.Finance.Api/Endpoints/Audit) · [销售审计与变更](../src/Services/Sales/Nexora.Sales.Api/Endpoints/Audit) · [旧版变更记录](../src/Web/nexora-web/app/components/audit/WorkspaceRecordChanges.vue)

### C21 套餐报价、订阅账单与权益

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c21-套餐报价订阅账单与权益2026-11-19)

- [x] 从计费页补套餐变更报价、剩余周期、按比例费用及抵扣、应付金额、订阅账单历史。补手工登记付款参考号和模拟结账，演示可用的测试卡选项、未完成与成功状态。验收报价变动时需要重新确认，完成付款后账单和订阅状态一致。[订阅和账单 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Billing/BillingEndpoints.cs) · [本地结账 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Billing/LocalCheckoutEndpoints.cs)
- [x] 显示套餐实际生效时间、到期后生效的套餐、模块权益、限额与用量告警。验收同一模块的套餐限制与成员权限分别显示，切换工作区后展示该工作区的套餐及用量。[旧版计费状态](../src/Web/nexora-web/app/components/billing/WorkspaceBilling.vue)

### C22 账户安全与设备授权

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c22-账户安全与设备授权2026-11-19)

- [x] 在现有账户菜单补模拟账户与登录渠道状态、会话过期提示、设备的登录与最近活动时间、单个或批量撤销其他设备。展示当前有效的空闲策略及来源、MFA 能力与敏感操作要求附加验证的状态，以及账户管理和账号删除预检中的阻断详情。验收切换模拟身份后会话、安全能力和预检状态同步更新。[会话路由](../src/Web/nexora-web/server/routes/bff/sessions.get.ts) · [安全能力路由](../src/Web/nexora-web/server/routes/bff/security/capabilities.get.ts) · [删除预检 API](../src/Services/Organization/Nexora.Organization.Api/Endpoints/Workspaces/WorkspaceEndpoints.cs)
- [x] 用样例展示 CLI 和 MCP 设备授权核验、授予的范围、同意、拒绝、过期及撤销后的状态，复用一个授权界面。验收设备授权根据用途展示正确的只读范围与反馈。[CLI 授权入口](../src/Web/nexora-web/app/pages/cli/authorize.vue) · [MCP 授权路由](../src/Web/nexora-web/server/routes/bff/auth/mcp)

### C23 助手会话与工具审批

> 状态：已完成（2026-11-19） · [验收记录](verification/web-ui-dashboard-prototype.md#c23-助手会话与工具审批2026-11-19)

- [x] 补工作区内的助手入口与能力状态。用固定消息样例演示本地流式输出、会话列表和历史、取消和恢复，以及角色或套餐受限时的提示。[助手 API](../src/Gateway/Nexora.ApiGateway/Infrastructure/Assistant/AssistantEndpoints.cs) · [旧版助手面板](../src/Web/nexora-web/app/components/assistant/WorkspaceAssistant.vue)
- [x] 模拟工具调用待审批卡片，显示用途、参数摘要与执行范围。验收允许或拒绝后的会话状态，并从示例结果跳回现有的科目、总账或报表入口。[助手工具 API](../src/Gateway/Nexora.ApiGateway/Infrastructure/Mcp/McpFinanceTools.cs)

每条流程完成后，用独立前端预览核对跨页余额、工作区切换和刷新恢复样例。按第 7 节执行静态检查、单测和构建，将可复现的浏览器操作与结果写入 [原型验收记录](verification/web-ui-dashboard-prototype.md)，再勾选对应条目。

## 4. 顺序与里程碑

C1 和 C2 用已建账的示例工作区与模拟资金账户演示，从现有采购或销售入口开始。待办按下列顺序推进。

| 顺序 | 待办 | 业务验收重点 |
| --- | --- | --- |
| 1 | C6–C8 | 退货库存与流水联动，付款和对账更正，期初结果可追溯 |
| 2 | C9–C11 | 定期开票执行可追溯，外部凭证可独立过账，捐赠收据可查看和模拟寄送 |
| 3 | C12–C15 | 采购、销售和仓库日常操作，资金账户、对账和总账关账 |
| 4 | C16–C18 | 税务与发票出具交付，财务报表和工作台的查询口径 |
| 5 | C19–C23 | 组织治理、审计、计费、账户安全及助手 |

本轮在 `nexora-dashboard` 使用本地模拟数据。列表、表单、详情抽屉、确认与状态反馈优先复用 Nuxt UI 的 `UTable`、`UForm`、`USlideover`、`UModal` 和 `UAlert`，沿用现有 Carbon 主题。API 与旧版界面用于核对字段和操作状态。你确认界面满意后，再开始接入后端。

| 里程碑 | 内容 | 依赖 | 出口 |
| --- | --- | --- | --- |
| M0 | B0 模拟数据与底座 | 无 | 新模块路由、mock 类型、loading/error/空态演示可用 |
| M1 | B1 + B2 | M0 | 壳层与工作台增强完成，三指标图表、通知与搜索可演示 |
| M2 | B3 + B4 | M1 | 商品/伙伴可编辑；采购新建/审批/收货主路径走通 |
| M3 | B5 + B6 | M2 | 销售/应收与库存收发货、调拨主路径走通 |
| M4 | B7 + B8 | M2 | 财务四大报表与组织/计费页面可演示 |
| M5 | B9 + B10 | M2–M4 | 全局体验收口、回归与文档完成 |

### 4.1 API 覆盖索引

按当前仓库的服务端点、Gateway 路由、旧版调用入口及新版原型核对。下表同时列出已有页面和待补的操作，方便逐项验收。

| API 归属 | 面向用户的能力 | 对应待办 |
| --- | --- | --- |
| [Organization](../src/Services/Organization/Nexora.Organization.Api/Endpoints) | 工作区、个人账本链接、公司设置、公告、邀请、成员、角色和部门、订阅与账单、审计、账号删除预检 | B1、B8、C4、C19–C22 |
| [MasterData](../src/Services/MasterData/Nexora.MasterData.Api/Endpoints) | 商品或服务、分类和单位、伙伴及其引用资料、变更记录 | B3、C3、C12、C20 |
| [Purchasing](../src/Services/Purchasing/Nexora.Purchasing.Api/Endpoints) | 订单、审批、收货许可及剩余额度关闭、采购审计与变更 | B4、C1、C3、C6、C12、C20 |
| [Sales](../src/Services/Sales/Nexora.Sales.Api/Endpoints) | 报价发出、转单、销售订单与审批、履约许可及关闭、销售审计与变更 | B5、C2、C3、C6、C12、C20 |
| [Inventory](../src/Services/Inventory/Nexora.Inventory.Api/Endpoints) | 仓库和收货人、库存位置和流水、收货与发货、退货、盘点、调拨及变更 | B6、C3、C6、C13、C20 |
| [Finance](../src/Services/Finance/Nexora.Finance.Api/Endpoints) | 账簿、科目、期初和就绪检查、凭证及关联、合伙权益、期间及年结、交易和银行、应收应付、开票与寄送、捐赠、税务、报表导出及审计 | B5、B7、C1–C2、C4–C12、C14–C18、C20 |
| [Reporting](../src/Services/Reporting/Nexora.Reporting.Api/Endpoints) | 工作区数据投影和就绪状态 | B2、C18 |
| [Gateway](../src/Gateway/Nexora.ApiGateway/Infrastructure) 与 [Nitro](../src/Web/nexora-web/server/routes/bff) | 公共分享、用户可见的身份与会话状态、设备授权、助手会话及审批 | B1、C17、C19、C22、C23 |

引用查询由既有选择器承载，权限与权益查询由导航和操作状态承载。BFF 转发、身份回调、CSRF、令牌交换、CLI 机器查询、MCP JSON-RPC、服务间 gRPC 和健康检查属于后续接入的协议或运维能力。

## 5. 模拟数据与交互契约

| 主题 | 约定 |
| --- | --- |
| 数据来源 | 只读 `app/mocks/`；页面不出现 `$fetch`/`useFetch`/BFF 地址 |
| 数据生成 | `@faker-js/faker` 固定 seed；核心业务样例保持固定，只有批量填充数据允许随机；截图与 e2e 依赖的字段必须稳定 |
| 写入 | 更新前端内存中的模拟状态，关联页面在本次预览中读取同一份数据。Toast 说明「仅本次预览，刷新后恢复」 |
| 异步 | `useMockAsync` 统一 loading；`?state=error` 演示失败；列表默认 300ms 延迟 |
| 金额 | 两位小数人民币字符串；表格右对齐；汇总在前端用整数分或字符串处理 |
| 日期 | 业务日期 `YYYY-MM-DD`；时间 ISO 字符串；不引入时区换算 |
| 权限 | `useMockPermissions().can()` 控制导航与按钮；403 页可切换演示角色 |
| 写入反馈 | 模拟重复提交、版本冲突、审批或期间阻断。失败后保留表单与上次有效状态，按原因提示如何继续 |
| 空态 | 每个列表/详情都有空态；用 `UEmpty`，不一味留白 |

## 6. 边界与后续

1. **本阶段不做真实接入**：BFF、登录、CSRF、会话、AppHost、API 调用全部后置；本清单完成不等于可上线。
2. 界面确认后按 [后端接入 TODO](ui-dashboard-api-integration-todolist.md) 逐阶段推进，字段名与分页参数以实际 OpenAPI 和业务契约为准。
3. **演示口径**。C18 以财务概览与工作区投影 API 核对有来源的工作台指标。统一审批收件箱、跨域搜索和低库存阈值继续使用现有模拟口径。
4. **数据标注**：所有新增页面保留「本地原型 · 模拟数据」标识，避免被误认为真实数据。

## 7. 验收命令

在仓库根目录执行：

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard test:unit
pnpm --dir $nexoraDashboard build
```

截图可沿用临时 Playwright 脚本（当前借用 `nexora-web` 已安装依赖，不修改其代码），验收后删除脚本。

## 8. 待确认

1. 每个列表的 mock 数据量按 8–20 条是否足够，还是需要更大数据量验证分页与长表？
2. 新增模块的侧栏顺序按「采购 → 销售 → 库存 → 财务」还是按业务使用频率调整？
