# P6-04 恢复后对账与工作区投影补投

## 恢复后对账

2026-11-17 使用本地 Aspire PostgreSQL 完成八库备份及恢复。演练对恢复后的销售验收工作区逐项核对余额。每次运行创建独立临时库，证据与备份写入本地忽略目录 `artifacts/p1/runtime/restore-*/`。

| 校验项 | 总账或权威记录 | 子账或投影 | 结果 |
| --- | ---: | ---: | --- |
| 库存价值 | 120 | 120 | 一致 |
| 供应商应付 | 67.8 | 67.8 | 一致 |
| 应收供应商退款 | 0 | 0 | 一致 |
| 客户应收 | 33.9 | 33.9 | 一致 |
| 客户预收及贷项 | 1 | 1 | 一致 |
| 试算借贷差额 | 0 | 0 | 平衡 |
| 工作区组织信息 | 组织恢复库 | Reporting 恢复库 | 一致 |

八库备份耗时合计 3,674 ms，恢复耗时合计 9,310 ms。耗时记录只包含本地脚本的备份和恢复步骤。跨库一致切点、服务切换、WAL 与生产 RPO / RTO 仍待验收。

```powershell
node scripts/p6/backup-restore.cjs --container=<postgres-container> --reconcile=<completed-sales-workspace-uuid>
```

## 工作区投影补投

在独立 Testcontainers PostgreSQL / RabbitMQ 环境中移除单个测试工作区的 Reporting 投影，按相同业务事件标识通过 RabbitMQ 补投两次。验收断言投影恢复为一条，租户、事件标识和版本与原始事实一致。该流程使用现有消息处理器，覆盖工作区创建投影。财务独立投影及正式重放入口仍待验收。

```powershell
dotnet test tests/Nexora.Tests -c Release --no-build --filter 'FullyQualifiedName~WorkspaceSliceTests'
```

四项测试通过，含离线 Outbox、恢复投递与事务回滚。
