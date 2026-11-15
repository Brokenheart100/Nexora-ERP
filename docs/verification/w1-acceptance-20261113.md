# 2026-11-13 W1 已实现待验收项（首批 13 项）

范围：AccountGo 固定基线 F 项中“代码已具备、缺正常入口验收证据”的 W1 批次。本记录只覆盖本地环境、既有浏览器套件与既有阶段验收文档的交叉核对；不含远端 CI、生产部署或外部渠道验收。

## 环境与复现

- 代码基线：Nexora ERP 工作区（2026-11-13），`docs/计划.md` 第 2.2 节 F01–F42 固定基线 535c1cd。
- 启动：`aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive`，`aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 120 --non-interactive` 65.2s 就绪。
- 健康检查：`https://localhost:7443/health` 200、`http://localhost:3000/health` 200、`http://localhost:8025/livez` 200（Mailpit）。
- 浏览器套件：`cd src/Web/nexora-web && pnpm exec playwright test workspace.spec.ts --reporter=list`。
- 结果：`workspace.spec.ts` **14 passed (7.7m)**，2026-11-13；配置 `playwright.config.ts`（baseURL https://localhost:7443、Edge headless、workers 1、120s），JSON 报告 `artifacts/p1/browser-results.json`。
- 说明：`e2e/manual-*.audit.spec.ts` 为历史探针，入口文案已变（首页现为 `/bff/email-login`、`/bff/register`，见 `src/Web/nexora-web/app/pages/index.vue:123-131`），本批不以这些过期用例作证据。

## 逐项验收

| F 项 | 2.2 最低验收结果 | 本轮浏览器证据 | 阶段证据 | 结论 |
| --- | --- | --- | --- | --- |
| F06 成员邀请、加入、停用、管理角色 | 过期 / 重复邀请拒绝，成员范围与最后管理员约束生效 | `workspace.spec.ts:300` 邀请、角色分配、立即停用与恢复 | `p1-membership-authorization.md`（邀请绑定 / 到期 / 单次使用 / 最后 Owner 并发）、`p1-team-role-assignment.md` | 通过 |
| F08 公司偏好、Logo / 品牌、日期与本位币格式 | 不同公司独立配置币种与年度；修改不重写历史金额 | `workspace.spec.ts:480` 公司展示与工作区隔离 | `p2-books.md`（CNY / JPY 独立配置、历史金额保留） | 通过 |
| F11 个人账本创建及与企业工作区链接 / 解除 | 独立账簿与权限，链接只改变访问关系，不串账、不自动合并 | `workspace.spec.ts:480`（个人链接隔离）、`:567-607`（解除与跨租户 404） | `p2-books.md` | 通过 |
| F13 客户 / 供应商 / 捐赠人、联系人与业务资料 | 列表、详情、编辑、停用与引用校验；同一主体可有多个身份 | `workspace.spec.ts:383` 多身份、联系人、引用校验 | `p2-partners.md` | 通过 |
| F14 商品 / 服务、分类、计量单位与库存标记 | 服务项目不误增库存，商品基础属性和单位引用可验证 | `workspace.spec.ts:8`（目录范围 / 版本 / 幂等；:49-53 服务项目库存 400） | `p2-catalog.md`、`p2-masterdata-references.md` | 通过 |
| F15 税项、税率、商品税组、往来税组及单据税额 | 含税 / 未税、折扣、舍入与科目映射有样例，历史税率快照保持 | `workspace.spec.ts:704` 13% / 5% / 含税 113、改率后快照 | `p2-tax.md`、`p4-sales-to-ledger.md` | 通过 |
| F16 科目层级、类别、归档 / 恢复与使用限制 | 层级及科目用途正确，已用科目不可随意删除 | `workspace.spec.ts:610` 层级、归档 / 恢复门禁、导入 | `p2-chart.md` | 通过 |
| F17 科目模板、结构 / 快照导出、导入预览与提交 | Append / Upsert、空账 Replace 与来源格式适配用固定样例验证；不改余额 | `workspace.spec.ts:610` 预览不改 revision、提交幂等、过期 409、Xero / QBO | `p2-chart.md` | 通过 |
| F18 手工 / 自动凭证、过账、总账与科目明细 | 借贷平衡、来源幂等、钻取及关联冲销可核对 | `workspace.spec.ts:782` 过账、冲销原值不变、报表取数 | `p2-ledger.md`、`p4-sales-to-ledger.md`、`p5-finance-operations.md` | 通过 |
| F28 采购订单、收货与供应商履约 | 部分收货、许可额度、库存计价及退货可对账 | `workspace.spec.ts:1099` 部分收货 1.125、同 operation 重放、取消余量、收齐、关单后 409 | `p3-purchase-orders.md`、`p3-purchase-to-ledger.md` | 通过 |
| F31 银行 / 现金账户、默认账户、流水与交易作废 | 账户科目映射、余额、默认设置及更正历史正确 | `workspace.spec.ts:1099`（:1306-1308 默认账户互斥）；`:1583`（:1415-1416、:1430-1436 作废保留原值，:1887-1896 余额与总账一致） | `p3-purchase-to-ledger.md`、`p5-finance-operations.md` | 通过 |
| F32 银行对账单导入、映射、预览及待审核行 | 重复导入不重复记账，原始行和批次可追溯 | `workspace.spec.ts:1583`（:1376-1390 异常行 previewId null、同 operation 重放、重复预览 duplicate、commit 0） | `p3-purchase-to-ledger.md`、`p5-finance-operations.md` | 通过 |
| F34 对账单行匹配、收付核销、费用 / 其他收入和排除 | 同一行不被重复分配，取消匹配和重投不重复生成凭证 | `workspace.spec.ts:1583`（:1393-1402 费用 / 收入挂接，:1409-1413 部分匹配 1+1、0.01 超额 409、release 再匹配，:1857-1909 对账衔接） | `p5-finance-operations.md` | 通过 |

## 已记录的边界与后续增强（不影响 2.2 最低验收）

- F06：邀请与成员变更审计已在同事务写入；**审计查询 API / UI 属 F38**，未纳入本项。邮件链路仍依赖 Mailpit（F01 未验收）。
- F07：未通过——P1-07e 仍含“完整业务角色 / 敏感政策与细分范围、审计查询、跨节点缓存”等剩余项；本轮不勾选。
- F08：Logo 以数据库 data URL 保存（`OrganizationModelConfiguration.cs:75`），未接对象存储；列表 / 详情 / CSV 的日期与金额格式尚未统一（PDF 已用偏好）；报表与外壳品牌联动未做。以上列为 S 级增强。
- F13：停用仅使新引用 409，不阻止“已被单据引用”的停用；历史单据保留名称快照。硬门禁需跨服务引用检查，列为 M 级增强。
- F14：仅基础单位，无换算因子与分类树（`docs/架构.md:52`、ADR-0007 明示延后）；2.2 不要求换算。
- F16：无 DELETE 端点；已用科目可归档（不可删除），与 `docs/架构.md:574`“归档优先”一致；TODO 中“有分录禁止归档”按文档口径不执行。
- F18：盘点 CNT 自动凭证仅有 p5 文档与 e2e 间接覆盖，缺独立断言；列 S。
- F28：缺按供应商汇总的履约视图（仅订单级“已收 x/y”），列 M 级增强。
- F31：无独立手工流水录入表单，流水由制单 / 期初生成；2.2 账户映射与余额核对已满足。
- F32：映射模板不可持久化复用；异常行导致整份预览拒绝，口径已记录。
- F34：无自动匹配建议（仅手工匹配 + 创建式挂接）；排除行缺独立 e2e 断言；2.2 已满足。

## 结论

- 本轮勾选 13 项：F06、F08、F11、F13、F14、F15、F16、F17、F18、F28、F31、F32、F34。
- F 项累计验收 24/42（57%），其中 W1 批次 13/17 通过；F01、F26 受阻于外部 SMTP，F07 待 P1-07e，F27 待“停机跨越到期时间”恢复演练。
- 未执行远端 CI 与生产验收；本地结论仅覆盖上述命令与套件。
- 2026-11-15 复核：F07 已完成最小验收（[记录](f07-resource-scope-approvals.md)），F27 已完成停机恢复演练（[记录](w1-f27-downtime.md)）；本轮历史计数 24/42 保留，当前累计 37/42，剩余 F01、F26、F36、F42。
