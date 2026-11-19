# P6-03 本地混合读写基线

2026-11-17 在单机 Aspire、Nitro、YARP 与 PostgreSQL 环境，两个独立身份通过 OIDC 和 TOTP 登录同一个测试工作区。两份浏览器会话发起一批 50 个并发请求，读取商品目录 25 次、创建不同商品分类 25 次。所有请求成功，查询确认 25 条分类均写入。请求耗时由浏览器测量，包含网络和入口。

| 操作 | 成功 | P95 | 最大耗时 |
| --- | ---: | ---: | ---: |
| 商品目录读取 | 25 / 25 | 1,060.20 ms | 1,113.50 ms |
| 创建商品分类 | 25 / 25 | 435.00 ms | 435.30 ms |

常规读取 P95 超过计划的 500 ms 目标。当前样例没有达到 50 个独立用户，也未合并十万 SKU、百万库存流水负荷。瓶颈定位和目标规模复测继续保留。先前大数据量只读结果见 [容量基线](p6-03-capacity.md)。

```powershell
$env:NEXORA_TEST_P6_WRITE_LOAD = '1'
pnpm --dir src/Web/nexora-web test:e2e --grep 'Local capacity drill' --reporter=list
```

本地 JSON 结果写入 `artifacts/p1/runtime/p6-mixed-read-write.json`。
