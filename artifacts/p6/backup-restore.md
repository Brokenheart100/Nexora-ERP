# P6-04 本地备份恢复演练

生成时间: 2026-11-15T07:59:36.674Z

## 结果

| 数据库 | 备份大小 | 备份耗时 (ms) | 恢复耗时 (ms) | 校验 |
| --- | ---: | ---: | ---: | --- |
| organizationdb | 0.7 MiB | 264 | 590 | 一致 |
| financedb | 2.9 MiB | 455 | 1202 | 一致 |
| inventorydb | 21.4 MiB | 1997 | 9765 | 一致 |
| reportingdb | 0.1 MiB | 178 | 364 | 一致 |
| masterdatadb | 1.2 MiB | 303 | 940 | 一致 |
| purchasingdb | 0.3 MiB | 197 | 464 | 一致 |
| salesdb | 0.2 MiB | 188 | 437 | 一致 |
| identitydb | 0.3 MiB | 221 | 1855 | 一致 |

合计: 8 个数据库，备份 27.1 MiB，备份耗时 3803 ms，恢复耗时 15617 ms，全部校验: 通过。

## 说明

- Local drill only: pg_dump -Fc per database, restore into a scratch database in the same PostgreSQL instance, compare counts and aggregates. Cross-database consistency is not guaranteed because each database is dumped in its own transaction snapshot.
- The application keeps running during the dump. Business tables are read-only for this local environment at the time of the drill; outbox/inbox counts may change if background messages are processed.
- No WAL archiving or point-in-time recovery is configured, so RPO is tied to the last completed dump and is not the 15-minute production target.
- The scratch database is dropped after verification; this drill does not repoint running services or test traffic cutover.
- Local restore time excludes provisioning, service restart, verification of external integrations and application warm-up; it is not an RTO measurement.

## 校验项

- 组织: workspaces、workspace_members、workspace_role_grants、billing_subscriptions、billing_invoices（含金额合计）、workspace_audit。
- 财务: journals、journal_lines（含借贷合计）、fiscal_periods、record_changes。
- 库存: stock_movements（含数量/成本合计）、warehouses、cost_pools（含数量/价值合计）、record_changes。
- 报表: workspace_projection、workspace_authorization_watermarks。
- 主数据: items、definitions、partners。
- 采购: orders、order_lines（含金额合计）、receipt_permits、record_changes。
- 销售: orders、order_lines（含金额合计）、fulfillment_permits、record_changes。
- 身份: keycloak realm、client、user_entity、credential 计数。
- 每个业务数据库的 Wolverine outgoing/incoming/dead-letter envelope 计数。

## 限制与缺口

- 没有 WAL 归档/时间点恢复；无法证明 RPO ≤ 15 分钟。
- 没有异地备份或备份保留策略；备份文件位于本机 artifacts/p6/backup。
- 未演练服务切换、消息补投、投影重建和对账；这些需要独立脚本与可切换的测试环境。
- 恢复耗时不含容器/服务启动、应用预热和外部依赖校验，不能作为 RTO 结论。
