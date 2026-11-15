# P6-03 本地容量与投影延迟基线

> 状态：本地读路径基线与投影延迟探测完成；50 并发未达到约定独立用户口径，写命令与瓶颈结论未完成，**P6-03 未验收、不勾选**。
>
> 日期：2026-11-15。环境：单机本地 Aspire AppHost、单个 PostgreSQL 容器、单 BFF 进程；合成数据直插数据库。本文只记录本地基线，不表述为生产容量验收。

## 1. 结论

- 单用户读路径 P95 全部低于 250 ms（目录列表、商品详情、库存流水、报表投影读取），满足常规列表 / 详情 P95 ≤ 500 ms 的目标。
- 50 并发 × 10 轮共 500 个混合读请求全部 200，错误率 0，吞吐 54.22 req/s；P95 928.78 ms，**高于 500 ms 目标**。
- 投影延迟用 10 次真实新建工作区探测：从创建请求到 Reporting 首次返回 200，P50 120.01 ms、P95 151.03 ms、Max 289.77 ms，本地单节点低于 5 s 目标；未覆盖积压 / 重建场景。
- 本轮并发是同一 BFF 会话的并发请求，不是 50 个独立登录用户；只有单机、单数据库、单服务副本，不能代表生产容量。
- 未测量普通本地命令 P95（本轮只覆盖读路径）；50 并发仍是同一 BFF 会话的近似并发。
- 结论：本地读路径与投影延迟基线可复现，但 P6-03 的独立用户约定负载、命令延迟和瓶颈结论均未完成，保持未勾选。

## 2. 环境与数据

| 项目 | 值 |
| --- | --- |
| 操作系统 / CPU / 内存 | Windows 10.0.26300 / Intel Core i5-12600KF，16 线程 / 16,140 MiB |
| Node / Playwright | Node v24.21.0 / @playwright/test 1.64.1（Edge headless） |
| PostgreSQL | 18.3（容器镜像 digest `sha256:7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db`） |
| 应用 | Aspire AppHost，本地 Debug 进程，单个 gateway / BFF / PostgreSQL 实例 |
| 压测工作区 | `01a1d33c-921f-7122-8441-058b1f955fe2`（名称“目录隔离 1794545324554”） |
| 数据量 | 100,000 个 SKU；1,000,000 行库存流水 |
| 数据体积 | items 约 33.7 MB；stock_movements 约 338.3 MB；catalog 库约 46.0 MB；inventory 库约 351.2 MB |

数据由 `scripts/p6/load-baseline.cjs` 直接写入 `masterdatadb` 与 `inventorydb`：商品 Code 以 `LOAD-` 开头，库存流水使用确定性 UUID 与 `LOAD` 工作区隔离。该方式只用于容量样本，不是正常业务入口写入，也不验证业务不变量。

本地 PostgreSQL 默认 `max_connections=100` 在首次运行时被连接池耗尽（错误 `53300: remaining connection slots are reserved for roles with the SUPERUSER attribute`），本轮把该本地容器临时调到 300 后重跑。此调整只影响本地环境，不是仓库配置。

## 3. 单用户读路径

| 场景 | 样本 | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 目录列表第 1 页 | 30 | 67.69 | 80.45 | 80.94 | 85.29 |
| 目录列表第 100 页 | 30 | 77.49 | 94.96 | 99.37 | 109.56 |
| 目录列表第 1000 页 | 30 | 81.7 | 97.49 | 102.98 | 103.34 |
| 目录列表第 2000 页 | 30 | 86.55 | 106.09 | 109.16 | 128.45 |
| 商品详情 | 40 | 71.43 | 78.63 | 80.35 | 80.64 |
| 库存流水第 1 页 | 20 | 189.22 | 243.47 | 243.47 | 261.54 |
| 库存流水按商品筛选 | 20 | 73.92 | 85.1 | 85.1 | 87.61 |
| 报表投影读取 | 20 | 80.11 | 91.22 | 91.22 | 102.52 |

目录分页到第 2000 页仍保持稳定，说明当前排序与索引在该数据量下没有明显深分页退化；库存流水第 1 页比按商品筛选慢，主要因为按 `OccurredAtUtc DESC, Id DESC` 取最新 50 行需要更大的排序 / 索引扫描，但仍低于 250 ms。

## 4. 50 并发混合读

| 指标 | 结果 |
| --- | --- |
| 并发 / 轮数 / 请求数 | 50 / 10 / 500 |
| 请求构成 | 60% 目录随机页、20% 商品详情、10% 库存流水、10% 报表投影 |
| HTTP 状态 | 全部 200 |
| 错误率 | 0 |
| 吞吐 | 54.22 req/s |
| 墙钟 | 9.22 s |
| P50 / P95 / P99 | 520.25 ms / 928.78 ms / 965.35 ms |
| Max | 1057.09 ms |

## 5. 投影延迟探测

`scripts/p6/projection-latency.cjs` 以 demo bob 账号通过真实 BFF 新建 10 个工作区，创建成功后每 50 ms 轮询 `GET /bff/api/reports/workspaces/{id}`，记录从创建请求开始到首次返回 200 的时间；期间 202 表示 `pending`。10 次全部在第一次轮询即返回 200（0 次 pending）。

| 指标 | 创建 HTTP | 投影可见 |
| --- | ---: | ---: |
| 样本 | 10 | 10 |
| P50 (ms) | 39.41 | 120.01 |
| P95 (ms) | 67.13 | 151.03 |
| Max (ms) | 148.39 | 289.77 |

该结果覆盖 Organization outbox → RabbitMQ → Reporting `WorkspaceCreatedHandler` 的本地稳态路径，低于投影延迟 P95 ≤ 5 s 的目标；但只验证“新建工作区”一种投影事件，未覆盖消息积压、补投、全量重建或故障恢复后的投影追赶。产物：[artifacts/p6/projection-latency.json](../../artifacts/p6/projection-latency.json)、[artifacts/p6/projection-latency.md](../../artifacts/p6/projection-latency.md)。

## 6. 目标对照

| 目标（docs/计划.md 第 7 节） | 本轮结果 | 结论 |
| --- | --- | --- |
| 50 个活跃并发用户、10 万 SKU、单法人年度 100 万库存流水 | 数据量达到；并发是单会话请求，不是 50 个独立用户 | 部分覆盖 |
| 常规列表 / 详情 P95 ≤ 500 ms | 单用户读路径 P95 ≤ 243.47 ms；50 并发混合读 P95 928.78 ms | 单用户通过；约定并发未通过 |
| 普通本地命令 P95 ≤ 1 s | 未测写命令 | 未覆盖 |
| 正常投影延迟 P95 ≤ 5 s | 10 次本地新建工作区投影可见 P95 151.03 ms | 本地通过；积压 / 重建 / 生产未验证 |
| 瓶颈有结论 | 仅观察到并发下读放大；未采集数据库 CPU / IO / 锁等待 | 未完成 |

## 7. 限制与后续

- 单机、单 PostgreSQL、单服务副本；没有生产网络、反向代理、TLS 终止或多租户噪声。
- 并发请求共用一个 BFF 会话和同一个用户身份，绕过了 50 个用户各自的登录、会话查询与权限缓存差异。
- 只覆盖读路径，没有覆盖制单、审批、过账、库存扣减等写命令和事务争用。
- 没有采集 PostgreSQL `pg_stat_statements`、连接池等待、CPU / IO、GC 和网关队列指标，无法形成瓶颈定位结论。
- 投影延迟只测了新建工作区事件；Reporting 当前只有 `WorkspaceCreatedHandler` 消费该事件，没有全量重建入口，未验证消息积压、补投、重建或故障恢复后的追赶，也未在生产网络 / 多副本下采样。
- 合成数据由 SQL 直插，未经过应用命令；不能据此判断业务正确性、超卖、重复入账或租户隔离。
- 未执行持续压测、故障注入或远端 CI；不能作为 RPO / RTO 或生产发布证据。

## 8. 复现

~~~powershell
PGPASSWORD="$(docker exec postgres-frkgfdpc printenv POSTGRES_PASSWORD)" `
  NODE_PATH="D:/Code/CSharp/Nexora ERP/src/Web/nexora-web/node_modules" `
  node scripts/p6/load-baseline.cjs --items=100000 --movements=1000000 --concurrency=50 --rounds=10
~~~

投影探测使用另一脚本（会真实创建 10 个工作区，本地不提供删除接口）：

~~~powershell
NODE_PATH="D:/Code/CSharp/Nexora ERP/src/Web/nexora-web/node_modules" `
  node scripts/p6/projection-latency.cjs --samples=10
~~~

脚本要求本地 gateway 健康、测试账号可登录；默认复用已有 `LOAD-` 工作区，找不到时才选择空工作区。输出：

- [artifacts/p6/load-baseline.json](../../artifacts/p6/load-baseline.json)
- [artifacts/p6/load-baseline.md](../../artifacts/p6/load-baseline.md)
- [artifacts/p6/projection-latency.json](../../artifacts/p6/projection-latency.json)
- [artifacts/p6/projection-latency.md](../../artifacts/p6/projection-latency.md)

**结论：本地读路径与投影延迟基线完成；P6-03 未验收。**
