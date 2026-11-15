# Web 样式分层 Phase 4（表单迁 Nuxt UI UFormField / UInput / USelect / UCheckbox）

日期：2026-11-14。状态：Phase 4 表单迁移已完成并通过静态检查、聚焦与全量 e2e；Phase 5–7 未开始；远端 CI 与生产验收未执行。

决策与四层分工见 [ADR 0020](../adr/0020-frontend-design-system-layering.md)。Phase 0–3 见 [基线记录](web-ui-design-system-baseline.md)、[Phase 1–2 验证记录](web-ui-design-system-phase1-2.md) 与 [Phase 3 验证记录](web-ui-design-system-phase3.md)。

## 范围

本次只把业务表单控件从原生 `<input>` / `<select>` / `<textarea>` / `<label>` 迁到 Nuxt UI `UFormField` + `UInput` / `USelect` / `UTextarea` / `UCheckbox`，不改变 BFF、业务 API、数据模型、可访问名称、label / option / placeholder 文本、`name` / `id` / `data-testid`、面板顺序与打印隔离结构。文件上传（`type="file"`）、品牌颜色（`type="color"`）与财务报表的原生报表类型 `<select>` 按 ADR 取舍保留。

## 实现摘要

共迁移 31 个组件（表单控件），全部保留原有 label / option / placeholder 文本与按钮可访问名称：

| 分组 | 文件 |
| --- | --- |
| 公司设置与初始化 | `WorkspaceCompanySettings.vue`（法定名称 / 品牌名称 / 时区 / 日期格式 / 个人工作区）、`WorkspaceSetup.vue`（向导资料字段） |
| 主数据与财务基础 | `WorkspaceTaxes.vue`（税率、税组、多选税项）、`WorkspaceCatalog.vue`（定义与商品表单、分类 / 单位下拉）、`WorkspacePartners.vue`（档案、联系人、角色多选）、`WorkspaceBankImport.vue`（对账单行、已过账流水、分配金额） |
| 账簿与凭证 | `WorkspaceLedger.vue`（凭证类型、现金流分类、科目行、科目筛选、关联凭证与类型）、`WorkspaceBook.vue`（本位币、起始月）、`FiscalYearPanel.vue`（起始年份、未分配利润科目）、`WorkspaceChart.vue`（科目编码 / 名称 / 类别 / 上级 / 用途、来源格式、导入模式、归档） |
| 采购 / 销售 / 库存 | `WorkspaceTrade.vue`、`WorkspaceSales.vue`、`WorkspacePurchasing.vue`、`PurchaseReceiptPanel.vue`、`SalesFulfillmentPanel.vue`、`WorkspaceInventory.vue`、`WorkspaceReceivables.vue`、`BankReconciliationPanel.vue`、`InvoiceSchedules.vue` |
| 组织与审计 | `WorkspaceGovernance.vue`、`WorkspaceMemberEditor.vue`、`WorkspaceBusinessRolePicker.vue`、`WorkspaceCustomRoleEditor.vue`、`WorkspaceRoleCatalog.vue`、`WorkspaceScopedRoleGrants.vue`、`WorkspaceAudit.vue`、`WorkspaceAging.vue`、`WorkspaceBilling.vue`、`InvoiceCommunication.vue`、`WorkspaceAssistant.vue`、`WorkspaceRecordChanges.vue` |

各组件同时删除了仅用于原生控件的 scoped 规则（`label` / `select` / `textarea` 等）；布局包装类、`fieldset`、`legend`、按钮、`data-testid` 与可见文本保持不变。`UFormField` 渲染 `<label for>` 并注入控件 `id`，因此既有 `getByLabel(...)` 定位继续有效。

## 交互差异（已确认）

1. `USelect` 是 Reka UI 的按钮触发器，不再渲染原生 `<select>`；Playwright 的 `selectOption()` 改为 `click()` + `getByRole('option', { name })`。选项列表 portal 到 `body`，需从 `page` 取 `role=option`。
2. 原 `value=""` 的空选项改为 `USelect` placeholder；模型值仍为 `''` 时触发器显示空白（与既有已迁移组件一致）。两处显式动作（撤销收货权限、盘点当前仓库）使用 `__none__` 哨兵，`__auto__` / `__all__` 用于现金流分类与科目筛选；哨兵只存在于组件状态，API payload 不变。
3. 迁移后的 `USelect` 不再触发浏览器原生 `required` 校验；保存按钮的 `:disabled` 守卫与后端校验保持不变。
4. `WorkspaceRoleCatalog.vue` 的原生 `optgroup` 改为单个 `USelect`，选项顺序与文本保持（工作区角色在前、业务角色在后），「工作区角色 / 业务角色」分组标题不再渲染。
5. `FiscalYearPanel.vue` 的未分配利润科目原空选项变为 placeholder，选择后不能通过 UI 再置空（无 e2e 依赖）。
6. `WorkspacePartners.vue` 的角色多选改为 `UCheckbox` 的 `includes` + `toggleRole` 绑定（Reka Checkbox 的 `modelValue` 只接受 boolean，数组绑定会被当成 truthy 导致 payload 变成 `roles: true` 并 400）。
7. Reka Select 禁止空字符串 item value（运行时报 `A <SelectItem /> must have a value prop that is not an empty string`）。审计来源、记录变更来源 / 操作、自定义角色选择、销售 / 采购未指定部门共 5 处筛选与角色下拉改用 `__all__` / `__new__` / `__none__` 哨兵并在提交前映射回空串，API payload 不变。

## e2e 交互改写

- `src/Web/nexora-web/e2e/workspace.spec.ts`：8 处 `selectOption` 改为 click + option（成员角色、科目用途、凭证类型、科目 1 / 科目 2、采购供应商、库存商品 1、库存仓库、查看银行流水和对账单、关联来源 / 目标凭证、关联类型、记录变更来源）；仅剩财务报表类型 1 处 `selectOption`（该控件按 ADR 保留原生 `select`）。
- `src/Web/nexora-web/e2e/email-onboarding.spec.ts`：新增 `pickOption` / `pickCombobox` 辅助函数，改写邀请角色、权限预设、选择角色、选择自定义角色、授权成员 / 授权角色 / 数据范围 / 范围对象；授权角色按 `${role.name} · v${role.revision}` 文本匹配，授权成员按邮箱匹配，范围对象按部门 / 仓库名称匹配。
- 创建工作区后 `src/Web/nexora-web/app/pages/index.vue:108` 会自动跳转 `/companies/{id}/setup`；三个 email 用例改为等待该跳转后用工作区 id 直接 `goto` 成员页，避免点击工作区卡片与自动跳转竞态。仓库范围授权的范围对象改用字面名称映射（接口响应对象不保证包含 `name`）。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir src/Web/nexora-web typecheck` | 通过（exit 0） |
| `pnpm --dir src/Web/nexora-web lint` | 0 error；62 条 `vue/first-attribute-linebreak` warning（既有 + Phase 4 迁移新增，Phase 7 清理） |
| `pnpm --dir src/Web/nexora-web test:unit` | 10 个文件 53 项通过 |
| `pnpm --dir src/Web/nexora-web build` | 通过（20.6s） |
| 聚焦 e2e（Catalog UI / Partner profiles / Effective tax rates / P4 sales） | 4 passed（3.1m） |
| 全量 `workspace.spec.ts` + `email-onboarding.spec.ts` | 30 passed（15.0m；workspace 26 + email-onboarding 4） |

## 复现

```powershell
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --non-interactive
aspire wait gateway --apphost $appHost --timeout 180 --non-interactive

pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts e2e/email-onboarding.spec.ts --reporter=line
aspire stop --apphost $appHost --non-interactive
```

## 验收断言

- 31 个组件的文本 / 数字 / 日期 / 多行输入、下拉、复选与文件上传均渲染为 Nuxt UI 控件（文件、颜色与财务报表类型除外），label / option / placeholder / 按钮文本与迁移前一致。
- 公司设置、初始化向导、税务、商品目录、往来单位表单可正常保存，保存 payload 与错误文案不变。
- 凭证（期初 / 手工）、科目编辑与导入、关联分录、采购 / 销售 / 交易 / 库存 / 应收 / 银行导入 / 发票周期计划表单可正常提交（e2e 覆盖）。
- 组织治理：邀请角色、业务角色预设、自定义角色、范围授权（公司 / 部门 / 仓库）与审批流程可正常操作（email-onboarding e2e 覆盖）。
- `getByLabel`、`getByRole('checkbox')`、按钮可访问名称与 `data-testid` 全部保持；BFF、业务 API 与数据模型零改动。

## 边界与后续

- 财务报表类型保留原生 `select`（ADR 0020 取舍）；文件上传与品牌颜色保留原生控件。
- `USelect` 不再触发浏览器原生 `required` 校验，依赖保存按钮守卫与服务端校验。
- Phase 5（页签 UTabs）、Phase 6（壳层 / 加载态）、Phase 7（删死 CSS 与全量验证）继续推进。
- 远端 CI 与生产验收未执行；本地验证依赖 Aspire 与 Keycloak 开发身份。
