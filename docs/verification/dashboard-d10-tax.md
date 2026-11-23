# Dashboard D10 税务与申报

2026-11-22。本轮验收从独立 `nexora-dashboard` 登录，经过 Nitro BFF、YARP 和 Finance 的真实接口。纳税申报用例使用独立账簿，采购账单快照用例使用 D0 的专用联调工作区。

## 页面入口

| 操作 | Dashboard 入口 |
| --- | --- |
| 新建生效税率、维护税组、绑定商品和伙伴 | 财务 → 税务中心。从定义维护的「税码」也可进入税率版本 |
| 含税或未税的税额评估与历史回读 | 财务 → 税务中心 → 税额评估。可由快照 ID 查询保存结果 |
| 查看采购账单和销售发票的原税项 | 财务 → 采购应付 → 账单匹配明细；销售 → 发票 → 发票明细 |
| 选择月度或季度，查看期间汇总、申报和历史更正 | 财务 → 税务中心 → 申报日历。在账龄与税务页也可进入 |

税率版本、按日期选取的税率、舍入金额和申报总额均来自 Finance。客户发票从单据返回其税项明细，采购账单用匹配行关联的评估 ID 回读原快照。

申报与更正使用确认时的 `If-Match` 版本和汇总指纹。冲突后重新读取并核对期间。响应丢失时，界面先读取当前状态，再允许用户用原幂等键重试原请求。锁账选项根据服务端返回的 `canLock` 展示。首次申报后固定申报周期和确认口径。

## Aspire 本地端到端

| 场景 | 实测结果 |
| --- | --- |
| 税率、税组和评估 | 维护税组版本并拒绝旧版本。伙伴税组优先于商品税组，显式税组优先于两者。生效日后的新评估使用 14%，早期快照保留 13%。含税单价 1,130 元打九折后，未税 900 元、税额 117 元。未税单价 10.075 元按 14% 计算后，未税 10.08 元、税额 1.41 元、合计 11.49 元。 |
| 单据快照 | 已过账销售发票显示原 13% 税项与生效日。采购账单按实际收货和暂估提交，10 元未税加 1.30 元进项税，匹配行回读原评估 ID 和 13% 税率。 |
| 申报周期与口径 | 月度权责发生制将 13 元销项税归入一月。切换季度收付实现制后，已收但未核销时销项为 0，核销 56.50 元后确认 6.50 元，并显示核销凭证及对应发票。 |
| 申报、更正与锁账 | 确认后新增过账使旧指纹返回 `409`。重新核对后登记 v1 快照，销项 26 元；出现差异后填写原因登记 v2，销项 39 元。v1 可按原 ID 查询，跨工作区读取返回 `404`。锁账截止 1 月 31 日，旧期间的待复核发票过账被拒，打开二月后正常过账。 |

D10 两个本地浏览器用例分别通过。附带运行的 D4 全链路用例在「新建采购单」按钮禁用时中止，采购快照结果来自独立的 D10 用例。

## 模拟与构建

| 检查 | 实测结果 |
| --- | --- |
| D10 MSW 浏览器 | 3 项通过。覆盖有效期变化后回读原快照、响应丢失后重放保持一份申报历史，以及只读和锁账权限。 |
| D4 MSW 回归 | 5 项通过。含采购单权限、单价校验、审批、暂估、评估和付款，付款后账单仍未结 530 元。 |
| 静态与单元检查 | Nuxt 类型检查、新增文件 ESLint、169 项 Dashboard 单测和 2 项已有 Release 收付税额单测通过。 |
| Nuxt 构建 | mock 和 live 两种配置的 Nitro Node 构建均通过。 |

## 复现命令

从仓库根目录运行。真实浏览器用例依赖 [D0 联调基线](dashboard-d0-baseline.md) 和本地测试身份。

```powershell
$nexoraD10Host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraD10Host --non-interactive
aspire wait gateway --apphost $nexoraD10Host --timeout 120 --non-interactive
$nexoraD10Resource = aspire describe dashboard --apphost $nexoraD10Host --format json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $nexoraD10Resource.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d10-tax-ui.spec.ts
aspire stop --apphost $nexoraD10Host --non-interactive
```

```powershell
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d10-tax.msw.spec.ts e2e/d4.msw.spec.ts
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard typecheck
dotnet test tests/Nexora.Tests -c Release --no-build --filter 'FullyQualifiedName~CashTaxBalanceTests'
$env:NUXT_PUBLIC_DATA_MODE = 'mock'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
Remove-Item Env:NUXT_PUBLIC_DATA_MODE
```
