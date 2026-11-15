# P6-05 本地迁移与回退演练

日期：2026-11-15。状态：本地演练完成，生产迁移与镜像回退未验证。

## 环境

- Entity Framework Core .NET Command-line Tools 10.0.14
- PostgreSQL 18.3 (Debian 18.3-1.pgdg13+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
- 容器：postgres-frkgfdpc；脚本：scripts/p6/migration-drill.cjs。

## 结果

| 数据库 | 迁移数 | 升级脚本 | 空库升级 | 重复执行 | 回退最新迁移 | 再升级 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| organizationdb | 12 | 26312 B | 233 ms | 157 ms | 139 ms | 137 ms | verified |
| masterdatadb | 4 | 9789 B | 170 ms | 145 ms | 134 ms | 138 ms | verified |
| financedb | 13 | 49763 B | 267 ms | 151 ms | 142 ms | 136 ms | verified |
| inventorydb | 6 | 13752 B | 171 ms | 150 ms | 155 ms | 130 ms | verified |
| purchasingdb | 4 | 11100 B | 186 ms | 197 ms | 156 ms | 137 ms | verified |
| salesdb | 4 | 11300 B | 168 ms | 127 ms | 138 ms | 137 ms | verified |
| reportingdb | 2 | 2600 B | 141 ms | 133 ms | 143 ms | 131 ms | verified |

总耗时：75089 ms；通过 7 / 7。

## 说明

- Scratch databases are created empty and dropped after the drill; no application database is modified.
- The idempotent up script is applied twice to prove rerun safety.
- The latest migration per service is rolled back with its generated down SQL and then re-applied, proving schema rollback is executable on a scratch database.
- Down migrations are not a production data rollback strategy: ADR 0012 prefers rolling back the application image and keeping a compatible schema.
- Application image rollback and blue/green cutover were not exercised because the repository has no application container images or production deployment target.

机器可读结果：artifacts/p6/migration-drill.json；生成脚本：artifacts/p6/migration-scripts/。
