# P6-05 本地期初切账、迁移回退与运维手册演练

> 状态：本地期初切账、7 个服务的迁移 / 最新迁移回退演练和运维手册草稿完成；生产迁移、应用镜像回退与故障切换未验证，**P6-05 未验收、不勾选**。
>
> 日期：2026-11-15。环境：单机本地 Aspire AppHost、PostgreSQL 18.3 容器；无生产部署目标，无应用容器镜像。

## 1. 期初切账

- 现有能力是手工“期初单”：财务账簿以 `kind=opening` 的凭证录入期初余额，制单后由另一位用户复核 / 过账；`TradePosting` 以 `source="opening"` 作为首笔业务门禁，`ReadinessUseCases` / `ReadinessPolicy` 检查期初 `missing / pending / posted`。
- 聚焦 e2e：`pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --grep "Opening, journal approval" --reporter=line` → 1 / 1 通过（36.6 s）。覆盖期初单保存 / 提交、制单人与复核人分离、重复期初 409、非资产 / 负债 / 权益科目与不平衡 409、过账后试算平衡、跨工作区 404、已用科目不可改用途。
- 没有 CSV / 批量期初导入接口；期初库存、未结 AR / AP、银行现金与总账期初的批量导入和批次对账仍需后续实现。当前 P6-05 只能按“手工期初单可演练”记录，不能宣称完整期初切账已验收。

## 2. 发布迁移演练

`scripts/p6/migration-drill.cjs` 对 7 个服务生成 `dotnet ef migrations script --idempotent`，在空 scratch 库上验证：空库升级、重复执行、最新迁移回退、再升级。

| 数据库 | 迁移数 | 回退前 → 回退后 → 再升级 | 结论 |
| --- | ---: | --- | --- |
| organizationdb | 12 | 12 → 11 → 12 | verified |
| masterdatadb | 4 | 4 → 3 → 4 | verified |
| financedb | 13 | 13 → 12 → 13 | verified |
| inventorydb | 6 | 6 → 5 → 6 | verified |
| purchasingdb | 4 | 4 → 3 → 4 | verified |
| salesdb | 4 | 4 → 3 → 4 | verified |
| reportingdb | 2 | 2 → 1 → 2 | verified |

- 7 / 7 通过，总耗时 75,089 ms；最新结果见 [artifacts/p6/migration-drill.md](../../artifacts/p6/migration-drill.md) 与 [artifacts/p6/migration-drill.json](../../artifacts/p6/migration-drill.json)。
- 演练只操作 `p6_migrate_*` 空库，不修改应用库；不证明生产数据量下的迁移窗口、锁等待和回滚时间。
- 修复了 `src/Services/Finance/Nexora.Finance.Infrastructure/Persistence/Migrations/20261108054514_ShipmentInvoiceAmounts.cs` 原始 SQL 缺少分号的问题：该语句被 EF 包进 `DO` 块后导致 `END IF;` 语法错误。只补终止符，不改语义；Finance.Api Release 构建通过。

## 3. 回退能力

- 已验证最新迁移的 Down SQL 可以在 scratch 库执行，并能重新 Up；这只证明“schema 回退脚本可执行”。
- ADR 0012 明确：生产优先回退应用镜像并保留兼容 schema，不把 Down 迁移当作已发生财务事实的回滚手段；本仓库当前没有业务服务 Dockerfile、生产部署清单或蓝绿 / 滚动发布目标，因此应用镜像回退、流量切换和旧版本兼容性未演练。
- 破坏性降级、跨版本回退、迁移期间在线写入和失败恢复仍需在生产目标确定后验证。

## 4. 运维手册

已新增 [运维手册](../运维手册.md) 草稿，包含：本地启动 / 停止、健康检查与故障入口、配置与密钥、逐服务迁移、备份恢复、消息补投与投影重建缺口、发布 / 回退原则、容量基线和常见故障处理。该手册只描述当前本地可执行能力，未覆盖生产入口、证书、密钥托管、监控告警和值班流程。

## 5. 限制与缺口

- 没有生产部署目标、应用镜像、迁移作业、反向代理 / TLS 终止、蓝绿或滚动发布。
- 期初批量导入、批次对账、期初库存 / AR / AP / 银行现金的完整切账未实现。
- 迁移演练没有覆盖大数据量、长事务、锁等待、并发写入和失败中断。
- 没有备份 / 恢复自动化、WAL / PITR、异地存储、监控告警和演练排期。
- 无应用镜像回退、数据库版本兼容矩阵和发布回滚决策记录。

## 6. 复现

~~~powershell
node scripts/p6/migration-drill.cjs
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts --grep "Opening, journal approval" --reporter=line
~~~

迁移演练需要本地 PostgreSQL 容器与 `dotnet ef`；脚本自动读取容器凭据，输出 `artifacts/p6/migration-scripts/` 与 `artifacts/p6/migration-drill.*`。

**结论：本地迁移回退和手工期初切账演练通过；生产迁移、批量期初、镜像回退与故障切换未验收，P6-05 保持未勾选。**
