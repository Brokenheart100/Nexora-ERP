# 2026-11-13 F27 周期开票停机跨越到期时间恢复演练

范围：AccountGo 固定基线 F27（周期性开票计划、执行记录、日期预览和手动运行）中“实际停机跨越到期时间后恢复补跑”的验收项。本记录只覆盖本地 Aspire 环境，不含远端 CI、生产部署或跨节点场景。

## 演练目标与判定标准

- 场景：周期开票计划到期时 AppHost 已停止；到期后恢复启动，由 Wolverine 持久化消息补跑，恰好生成 1 条 occurrence 与 1 张发票。
- 判定：补跑不重复（60 秒内重复投递仍只有 1 条 / 1 张）、不遗漏（到期日业务记录存在）、执行记录可审计（occurrence 字段完整且可查询）。

## 环境与复现

- 代码基线：Nexora ERP 工作区（2026-11-13），F 项对齐固定基线 `535c1cd`。
- 启动：`aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive`；`aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 300 --non-interactive`。
- 停止：`aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive`（保留持久卷）。
- 演练脚本：`src/Web/nexora-web/e2e/f27-drill.mjs`（模式 `prep` / `stop` / `wait` / `start` / `verify`），状态 `artifacts/w1/f27-plan.json`，日志 `artifacts/w1/f27-drill.log`。

```powershell
cd src/Web/nexora-web
node e2e/f27-drill.mjs prep    # 选工作区与时区、改公司时区、建单期计划
node e2e/f27-drill.mjs stop    # 到期前停止 AppHost 并确认网关下线
node e2e/f27-drill.mjs wait    # 阻塞到到期 + 90 秒
node e2e/f27-drill.mjs start   # 启动 AppHost 并等待网关健康
node e2e/f27-drill.mjs verify  # 重新登录并断言补跑结果
```

本轮实际执行 `prep → stop → wait → start → verify`。首次后台链在等待期间因会话重启中断（AppHost 保持停止、状态文件 `phase=stopped`），重新执行 `wait → start → verify` 完成演练。

## 演练设计

- 时区选择：`InvoiceSchedule.DueAt` 固定使用当地 09:00，脚本在 37 个 IANA 时区中选取“当地 09:00 落在 12–40 分钟内”的时区，使到期时刻可预期并留出停机窗口；本轮为 `Asia/Kolkata`（当地 08:35）。
- 计划参数：工作区「销售闭环验收 1794537798029」，客户「华东客户」，服务项目，数量 1、单价 50，`nextOn=2026-11-13`、`endsOn=2026-11-13`（单期），`intervalMonths=1`、`dueDays=15`。
- 到期时刻：`dueUtc=2026-11-13T03:30:34.673Z`（北京 11:30:34）。
- 停机：2026-11-13T03:06:29.624Z 执行 `aspire stop`，03:06:31 网关健康探测返回 000 确认下线；停机前 occurrence 数 0，计划 `version=1`、`paused=false`、`preview=["2026-11-13"]`。
- 恢复：到期 + 90 秒（03:32:04Z）后执行 `aspire start` + `aspire wait gateway`；重新登录（Redis 会话随重启丢失）后通过 BFF 查询 `/bff/api/finance/workspaces/{workspaceId}/receivables/schedules/{scheduleId}/occurrences` 与 `/documents`。

## 断言结果

| 断言 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- |
| 停机覆盖到期时刻 | 到期时 AppHost 处于停止状态 | 03:06:29Z 执行 `aspire stop`，03:06:31Z 网关探测 000；03:32:04Z 到期时 AppHost 仍未启动 | 通过 |
| 恢复后补跑 occurrence | 恰好 1 条，业务日期 2026-11-13 | 1 条，`on=2026-11-13`、`templateVersion=1`、`scheduleId=01a1d2de-20df-7d7f-995c-4ff4dff9c13a` | 通过 |
| 补跑发票 | 恰好 1 张 `R-<scheduleId:N>-20261113` | 1 张，号码 `R-01a1d2de20df7d7f995c4ff4dff9c13a-20261113`，`state=submitted`、`total=56.5`（净额 50 + 税 6.5）、`dueOn=2026-11-28` | 通过 |
| 补跑发生在恢复之后 | `occurrence.createdAtUtc > stopAt` | 创建于 03:33:22.201Z，晚于 `stopAt=03:06:29.624Z`；启动 03:32:05Z、网关健康 03:34:06Z | 通过 |
| 重复投递不重复 | 60 秒后 occurrence 与发票仍各 1 | 03:38:15Z 复核：occurrence=1、发票=1 | 通过 |
| 执行记录可审计 | occurrence 含租户 / 工作区 / 计划 / 业务日期 / 模板版本 / 单据 ID / 创建时间 | 7 个字段齐全（见上方 occurrence 内容），可通过计划执行记录接口查询 | 通过 |

## 结论

通过。AppHost 停机跨越到期时间后恢复，积压计划由持久化消息补跑：恰好生成 1 条执行记录与 1 张发票，号码、状态、金额与到期日符合计划模板；60 秒内重复投递未产生重复单据；执行记录字段完整可审计。恢复后 occurrence 创建于 03:33:22Z，早于网关健康探测完成（03:34:06Z），说明服务启动后即处理积压，无需人工干预。

补充说明：

- 演练脚本 `e2e/f27-drill.mjs` 的 verify 首次按 `d.number` 读取发票号导致误判（实际字段为 `d.terms.number`），修正后通过，不属于产品缺陷；修正同时改为按 `occurrence.documentId` 定位发票并校验号码、状态与金额。
- 重启后 Redis 中的 BFF 会话失效，verify 重新登录后查询，符合服务端会话设计。
- 证据文件：`artifacts/w1/f27-drill.log`（完整时间线）、`artifacts/w1/f27-plan.json`（`phase=verified`，含 `verify` 快照）。
