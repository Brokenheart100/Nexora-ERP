# P2 公司设置与账簿初始化

2026-11-07。本地验收覆盖 P2-02 和 P2-03a。

企业工作区的「公司设置」维护法定名称、品牌名称、颜色、时区、日期格式和 PNG 标志，页面实时预览保存的偏好。标志限制为 128 KiB 和 512×512，服务校验格式标记与尺寸。现有工作区首次打开使用原名称及默认偏好。仅 Owner 可保存，每次修改需要当前版本并写入审计。

每个账号可建立一个独立租户下的个人工作区，成员范围为本人。建立企业导航关联需要同一调用者同时拥有两侧的管理权限。关联只保存当前账号的快捷入口。解除关联后个人工作区和账簿仍可从自己的列表访问。

选中企业或个人工作区后打开「账簿设置」。Owner 可选 CNY、USD、EUR、JPY，填写核算起点及会计年度起始月。Finance 按权威工作区类型建立独立账簿及商贸或个人起始科目，两者在同一数据库事务提交。首版初始化后固定本位币和起始配置。币种精度由账簿返回，个人 JPY 样例验证零小数位，企业 CNY 样例验证两位小数。配置受控变更和过账期间门禁继续放在 P2-05。

「导出起始科目」下载 `nexora.chart-structure.v1` JSON，包含模板、科目编码、名称与类别。完整科目结构、快照和导入见 [P2-03 本地验收](p2-chart.md)。

## 既有本地卷升级

Finance 使用同一开发实例中的独立 `financedb` 和 `nexora_financedb` 账号。从既有卷首次升级时执行以下命令。

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
pwsh scripts/p2/Initialize-DevelopmentDatabase.ps1 -Database financedb
aspire wait bff --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 60 --non-interactive
```

如果 Finance 在补建账号前启动失败，通过 `aspire resource finance rebuild` 重建该资源，再等待 BFF。新卷会随 PostgreSQL 初始化建立所需账号。

## 验收记录

| 检查 | 结果 |
| --- | --- |
| 工作区隐私 | 独立租户、每账号一个个人工作区、个人邀请拒绝、非成员访问和关联拒绝 |
| 公司偏好 | 实际浏览器上传 PNG、保存并读取品牌和日期格式、旧版本拒绝、SVG 拒绝 |
| 账簿初始化 | 企业 CNY 和个人 JPY 分别初始化，科目 ID 与模板独立，重复同一请求返回原结果，不同请求的再次初始化拒绝 |
| 导出与导航 | 下载并核对起始科目 JSON，验证快捷入口及解除关联后的独立访问 |
| 数据库 | Finance 独立账号拥有该库。Finance 与其余四个应用库之间的八种跨库组合均无 CONNECT 权限，账簿科目数量核对无差异 |
| 回归 | 锁定恢复及 Release 构建通过，后端 22 项和真实浏览器 5 项通过。Nuxt 类型检查与构建通过，Organization、MasterData、Finance 的模型和迁移快照一致 |

完整状态和剩余任务见 [计划 TODO](../计划.md)。
