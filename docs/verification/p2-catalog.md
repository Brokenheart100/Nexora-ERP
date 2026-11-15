# P2 商品目录首个切片

2026-11-07。本地验收对应 P2-01a。

分类与单位的修改、停用与恢复、商品引用和事务事件已在 P2-01c 补齐。[主数据维护与引用验收](p2-masterdata-references.md)

在 Nuxt 工作台选中工作区后点击「打开商品目录」。页面显示编码、名称、类型、分类、单位和状态，支持分页。Owner 和 Administrator 可以新增分类、计量单位、商品或服务，并编辑项目名称、分类及启用状态。有效 Reader 可以读取目录。每次请求都由 Organization 校验工作区权限，停用成员后的新请求返回 404。

目录编码去除首尾空白并统一大写。项目编码在工作区内唯一，分类和单位分别有自己的编码空间。项目必须引用同一工作区内正确类型的分类和单位，数据库外键也包含租户与工作区。服务项目禁止跟踪库存。首个切片在建档时固定项目编码、类型、库存标识和基础单位。分类和单位的后续维护规则由 P2-01c 接续。

MasterData 的四层工程各司其职。Wolverine.HTTP 分发请求，应用层处理用例和授权，领域层维护规则，基础设施通过 PostgreSQL 保存数据。Wolverine 的 EF 事务同时提交目录变更与审计凭据。相同操作编号和内容返回原结果，复用编号提交不同内容返回 409。编辑按版本检查并发，过期或竞争失败的请求返回 409。[Wolverine EF Core 集成](https://wolverinefx.io/guide/durability/efcore/)

## 本地数据库升级

新开发卷由 PostgreSQL 初始化脚本建立独立的 `masterdatadb` 和 `nexora_masterdatadb`。从 P1 的既有卷首次启动时，启动 AppHost 后执行一次升级脚本，再等待 BFF 就绪。

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
pwsh scripts/p2/Initialize-CatalogDatabase.ps1
aspire wait bff --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 60 --non-interactive
```

脚本核对本项目的容器和开发卷，补建目录账号并设置库所有者。MasterData 在开发环境启动时应用 `InitialCatalog` 迁移。如果服务已在账号创建前启动失败，执行以下命令重新启动该服务并等待 BFF。

```powershell
aspire resource masterdata rebuild --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait bff --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 60 --non-interactive
```

## 验收记录

| 检查 | 结果 |
| --- | --- |
| 依赖与构建 | 锁定恢复、.NET Release 构建、Nuxt 类型检查和生产构建通过，EF 模型与迁移快照一致 |
| 后端回归 | Release 21 项通过 |
| 本地 AppHost | BFF、MasterData 和目录数据库健康，既有开发卷完成增量升级 |
| 浏览器 | 三条流程通过，覆盖商品目录、登录与投影、成员治理 |
| 目录边界 | 跨工作区读与引用拒绝，Reader 写入拒绝，停用成员即时失去读取权限 |
| 目录写入 | 拒绝重复编码、非法类型、服务跟踪库存、缺失库存标志和过期版本，同请求可重放，并发编辑只有一个成功 |
| 数据库核对 | 目录账号与原三库之间的六种跨库组合均无 CONNECT 权限，商品版本和已提交审计条数一致 |

浏览器复现命令为 `pnpm --dir src/Web/nexora-web test:e2e`，报告位于 `artifacts/p1/browser-results.json`，包含现有 P1 流程和新增 P2 流程。

往来单位及联系人排在 P2-01b。可引用快照、对下游发布版本化事实及库存联动排在 P2-01c。P2-01 和 F14 的总验收继续保留。[计划 TODO](../计划.md)
