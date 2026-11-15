# P2-03 科目管理本地验收

2026-11-07 在 Aspire 本地栈验证。Finance 对现有 PostgreSQL 卷应用增量迁移。Playwright 用真实 OIDC 和 TOTP 登录后，完成科目管理场景。

- 工作区所有者维护科目层级。上级须为同类别分组科目。循环和活动子科目挂在归档上级下均会被拒绝。
- 模板和可移植结构使用版本化 JSON。快照另含账簿范围、科目 ID 与版本。
- 导入预览保存文件摘要、解析结果、操作者和账簿科目版本，有效期为 20 分钟。文件中出现余额字段、重复编码或上级关系无效时，预览报告错误。提交拒绝过期或过时的预览。
- Append 新增科目。Upsert 保留既有科目 ID 和类别。空账 Replace 保留历史引用所需的 ID，并归档文件省略的科目。
- 测试覆盖 Nexora JSON、Xero CSV 和 QuickBooks Online CSV 样例，包含前导零、带逗号名称和重复提交。来源格式只映射支持的列与类别。[Xero 导入说明](https://central.xero.com/0/article/Import-a-chart-of-accounts?userregion=true) · [QuickBooks Online 导入说明](https://quickbooks.intuit.com/learn-support/en-uk/help-article/import-export-files/import-chart-accounts-quickbooks-online/L9Res1eb1_GB_en_UK)
