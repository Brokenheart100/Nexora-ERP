# P1 自定义角色与数据范围

2026-11-12 在本地 Aspire 环境通过 Edge、API Gateway、BFF、Keycloak 和 Mailpit 验证。Organization 持久化授权，采购、销售和库存对各自资源执行范围检查。

| 场景 | 本地验收结果 |
| --- | --- |
| 创建和编辑角色 | 从「角色与权限」逐项勾选权限。直接提交治理角色分配权限返回 400。修改角色后，已批准的权限快照仍生效，携带旧角色版本的申请返回 409。 |
| 成员分配和独立审批 | 「团队与成员」可选成员、角色和范围。审批前业务访问被拒绝，发起人自批返回 403。另一位所有者批准后生效。 |
| 部门订单 | 员工只能列出自己有权读的采购单。其他部门和未指定部门的订单详情返回 404。员工可以在获准部门制单和提交，向未授权部门提交返回 404。 |
| 多角色组合 | 同一员工有华东部门销售制单和华南部门销售只读。能读华南销售单，尝试在华南制单返回 403。 |
| 仓库 | 仓库列表只包含已授权仓库，其库存查询返回 200，其他仓库返回 404。跨公司仓库授权返回 404，给仓库角色选择部门范围返回 400。库存读取角色尝试创建仓库返回 403。 |
| 即时撤销 | 撤销仓库授权后，下一次库存查询返回 404，同一员工的采购授权仍有效。 |
| 数据库升级 | Organization 应用 `20261112092922_CustomRoleScopes`，采购应用 `20261112092927_OrderDepartment`，销售应用 `20261112092932_OrderDepartment`。三个 EF 模型与迁移快照一致。 |

部门范围用于采购、销售订单。历史订单的部门为空，由公司级权限访问。仓库范围用于仓库目录、库存余额、流水及相关收发查询。仓库写入继续依照现有岗位和复核规则。自定义角色在员工加入公司后分配。其余业务模块的权限可在权限目录声明的公司范围内分配。

## 复现

按 [README](../../README.md) 启动 AppHost。待网关健康后运行以下命令。

```powershell
dotnet restore Nexora.slnx --locked-mode
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web test:e2e --grep 'Custom roles keep department|Team and roles pages|Workspace invitation, role assignment|Purchase orders require current scoped references|P4 sales, inventory, invoicing'
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
```

Release 构建 0 警告、0 错误，31 项后端测试通过。5 项浏览器端到端用例通过，包含自定义范围授权，以及内置角色、成员停用和恢复、采购审批和销售履约回归。前端类型检查、生产构建和变更文件的 ESLint 通过。类型检查仍输出 Volar 插件路径提示，退出码为 0。
