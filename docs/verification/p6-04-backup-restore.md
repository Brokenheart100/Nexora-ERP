# P6-04 本地备份恢复演练

> 状态：8 个数据库的本地备份恢复演练通过；跨服务一致快照、消息补投、投影重建、服务切换与恢复后对账未演练，**P6-04 未验收、不勾选**。
>
> 日期：2026-11-15。环境：单机本地 PostgreSQL 18.3 容器、单实例；备份与恢复都在同一实例，未接入生产存储。

## 1. 范围与方法

- 数据库：`organizationdb`、`financedb`、`inventorydb`、`reportingdb`、`masterdatadb`、`purchasingdb`、`salesdb`、`identitydb`。
- 每个数据库用 `pg_dump -Fc --no-owner --no-privileges` 备份，恢复到一个临时 `p6_restore_*` 数据库。
- 恢复后逐库比较行数与金额 / 数量合计；通过后删除临时库。应用在演练期间保持运行。
- 脚本：[scripts/p6/backup-restore.cjs](../../scripts/p6/backup-restore.cjs)；产物：[artifacts/p6/backup-restore.json](../../artifacts/p6/backup-restore.json)。

## 2. 结果

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

合计：8 个数据库，备份 27.1 MiB，备份 3,803 ms，恢复 15,617 ms；8 / 8 校验通过。

## 3. 校验项

- 组织：workspaces、workspace_members、workspace_role_grants、billing_subscriptions、billing_invoices（含金额合计）、workspace_audit。
- 财务：journals、journal_lines（含借贷合计）、fiscal_periods、record_changes。
- 库存：stock_movements（含数量 / 成本合计）、warehouses、cost_pools（含数量 / 价值合计）、record_changes。
- 报表：workspace_projection、workspace_authorization_watermarks。
- 主数据：items、definitions、partners。
- 采购：orders、order_lines（含金额合计）、receipt_permits、record_changes。
- 销售：orders、order_lines（含金额合计）、fulfillment_permits、record_changes。
- 身份：Keycloak 的 realm、client、user_entity、credential 计数。
- 每个业务数据库的 Wolverine outgoing / incoming / dead-letter envelope 计数（`identitydb` 无业务消息 schema，不检查）。

## 4. 恢复后一致性

- 每个数据库内部的行数与金额 / 数量合计一致，说明单库 dump / restore 没有丢行或截断。
- 8 个数据库分别在不同事务快照中导出，**不是跨库一致快照**；跨库引用、未提交消息和投影水位不能用本演练证明一致。
- `identitydb` 恢复到临时库后没有重新指向运行中的 Keycloak，登录会话 / 凭据只做了表计数比对，没有做真实登录验证。
- 应用在备份期间未停止；业务表在演练时基本处于只读，但 Outbox / Inbox 计数可能随后台消息变化。本轮计数比对通过不代表生产写入高峰下也能得到一致快照。

## 5. RPO / RTO 与缺口

- 没有 WAL 归档或时间点恢复（PITR）；RPO 取决于最近一次完整 dump，不能证明 ≤ 15 分钟。
- 备份文件位于本机 `artifacts/p6/backup/`，没有异地存储、保留策略、加密或恢复演练自动化；不能把容器卷当备份。
- 恢复耗时不含容器 / 服务启动、应用预热、外部依赖校验和流量切换，不能作为 RTO ≤ 4 小时的结论。
- 未演练消息补投、投影重建、恢复后跨服务对账、服务切换 / 回切和旧镜像回退。
- 未验证恢复后的身份、密钥、附件与外部集成可用性；ADR 0012 要求的“先身份和事实，再补投 / 对账，最后开放写入并重建投影”只完成了单库事实恢复。

## 6. 复现

~~~powershell
node scripts/p6/backup-restore.cjs
~~~

脚本自动从本地 `postgres-frkgfdpc` 容器读取凭据，备份到 `artifacts/p6/backup/`，恢复临时库并校验后删除。输出：

- [artifacts/p6/backup-restore.md](../../artifacts/p6/backup-restore.md)
- [artifacts/p6/backup-restore.json](../../artifacts/p6/backup-restore.json)

**结论：本地单库备份恢复通过；跨服务恢复、补投、投影重建、对账与 RPO / RTO 未验收，P6-04 保持未勾选。**
