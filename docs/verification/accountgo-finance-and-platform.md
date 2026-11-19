# AccountGo 增量对齐 · 财务与平台验收

对齐基线为 [AccountGo 主分支 fda4bd7](https://github.com/AccountGo/accountgo/blob/fda4bd7f44288c5939daf630623f15b0b8e7538e/docs/CHANGELOG.md)。

## 变更范围

- AG-04 在银行流水与应付工作台登记业主出资、提款，经独立审批过账。未关账的关联对账行可在作废更正时释放。权益变动表按同一过账水位核对资产、负债和期末权益，可对比上期。
- AG-05 在总账按财年设置合伙人资本科目、提款科目和分润比例。权益变动表按选定财年显示合伙人数据，年结预览绑定分润比例和余额。独立审核后自动结转损益与提款，重开年度冲销相关分录。
- AG-06 财务报表可直接下载 PDF，下载使用页面当前日期、口径和过账水位。周期计划可从列表执行、暂停、恢复或跳过下期。跳过写入执行记录。
- AG-07 保留自定义 CSV 列配置，自动识别 Wise 活动 CSV，只导入已完成且属于账簿币种的有向活动，内部换汇及其他跳过行显示原因。对账使用显式选择的截止日与结单余额。与当前操作者关联的个人账本才显示个人出资、提款入口及工作区跳转，企业侧凭证与个人账簿分别记账。
- AG-08 本地测试结账经计费管理员确认金额后创建，恢复时复用待付款账单。测试回调校验签名及工作区，重放不重复结账。测试卡仅保存账单账户内的测试标志，开发环境提供页面与接口。
- AG-09 新增银行、客户、供应商、已过账发票和账单五个只读 MCP 工具，分页前由发布服务筛选并授权。审计日志带调用者、工作区、工具、结果和追踪 ID。
- AG-10 保留账号多工作区的最短闲置期限。单一浏览器会话可由多个标签页共享，当前工作区政策若按最后切换标签确定，会使短超时工作区被另一标签放宽。Redis 以租约协调刷新，并在同一原子更新中确认租约、会话键和撤销标记。记录变更快照的默认保留期限为 730 天，由各服务按周期清理。业务审计的查询窗口见 [既有审计验收](w2-f38-audit.md)。

## 复现

从仓库根目录执行，开发依赖准备见 [README](../../README.md)。

~~~powershell
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
$accountGoAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $accountGoAppHost --non-interactive
aspire wait gateway --apphost $accountGoAppHost --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e --grep 'Opening, journal approval|P4 sales, inventory.*\(accrual\)|Finance MCP lists|Local checkout resumes|Effective session policy|warns with the shortest|logs out when the shortest' --reporter=list --output=../../../artifacts/p1/runtime/accountgo-ag04-10
aspire stop --apphost $accountGoAppHost --non-interactive
~~~

## 验证结果

2026-11-16，以本地 Aspire、PostgreSQL、Redis、Keycloak 和 Edge 验收。

- Release 构建零警告、零错误，62 项 .NET 测试通过。Nuxt 类型检查、生产构建及 89 项 Vitest 测试通过，重点改动文件的 ESLint 退出码为 0。
- Finance 和 Organization 均通过 EF Core 模型一致性检查。端到端使用既有 PostgreSQL 卷验证 `20261116064602_PartnershipAndScheduleSkip` 与 `20261116070023_LocalBillingCheckout` 引入的数据读写。
- 7 条 Playwright 用例通过。权益变动验证银行对账行登记出资 50 CNY、提款 10 CNY、撤销后返回待审核以及报表平衡差为零。合伙人净利润 40 CNY 按 60/40 分入资本科目，财年重开冲销两张结转凭证。
- 四类财务报表实际下载并检查 PDF 签名。周期计划跳过记录保留、没有生成发票，下次日期继续按月末规则计算。Wise 样例导入正常收支两行，跳过内部换汇、其他币种及未完成行。个人账本取消关联后移除对应操作入口。
- 本地结账验证报价变更拒绝、付款前恢复、回调签名拒绝、支付结果重放、保存测试卡与确认后付款。MCP 验证九个工具的目录、分页、客户和供应商角色过滤、已过账发票与账单、工作区隔离及令牌受众要求。
- 实际 Redis 8.6 验证刷新租约互斥、持有正确租约的更新、失效租约拒绝、SID 撤销拒绝及会话删除后禁止写回。浏览器验证最短闲置策略的提示、续期和登出。
- 另有 3 条 Playwright 回归通过，覆盖既有采购与供应商退款、收付税务、线下付款登记和订阅降级。复现时将筛选参数改为 `Purchase orders require|P4 sales, inventory.*\(cash\)|Billing plans enforce quotas`。
- 单独复跑 MCP 用例后，通过 `aspire logs gateway --apphost $accountGoAppHost --format Json --tail 3000` 确认 10 条工具调用审计均带追踪 ID，覆盖成功和拒绝。
