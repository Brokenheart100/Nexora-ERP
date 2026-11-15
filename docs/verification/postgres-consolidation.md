# 本地 PostgreSQL 布局整理

本记录描述 P1 的三库迁移。P2 在同一实例上增加 `masterdatadb` 与 `financedb`，P3 增加 `purchasingdb` 与 `inventorydb`。当前 AppHost 的新卷恢复会校验全部七份数据库备份。原三库备份对应 P1 的资源模型。[P2 升级说明](p2-books.md) · [P3 升级说明](p3-purchase-to-ledger.md)

日期：2026-11-06。范围：开发 AppHost；不代表生产部署验收，也不改变服务数据所有权。

## 当前布局

按统一实例、逐行声明数据库的格式整理 `AppHost.cs`：

```csharp
var postgres = builder
    .AddPostgres("postgres")
    .WithHostPort(6543)
    .WithDataVolume("nexora-postgres-data");

var orgDatabase = postgres.AddDatabase("organizationdb");
var reportingDatabase = postgres.AddDatabase("reportingdb");
var identityDatabase = postgres.AddDatabase("identitydb");
var databaseAccess = builder.ConfigurePostgresAccess(postgres, orgDatabase, reportingDatabase, identityDatabase);
```

公共配置集中声明。账号与初始化细节位于 `PostgresAccessExtensions.cs` 和 `deploy/postgres/10-application-databases.sh`，未引入额外 NuGet 依赖。

| 使用方 | 数据库 | 登录账号 |
|---|---|---|
| Organization | organizationdb | nexora_organizationdb |
| Reporting | reportingdb | nexora_reportingdb |
| Keycloak | identitydb | nexora_identitydb |

三个账号均无超级用户、创建数据库、创建角色和绕过 RLS 的权限；撤销各应用数据库的 PUBLIC 权限，各账号只拥有自己的数据库。业务连接串使用独立密码；Keycloak 的 `KC_DB_*` 同步指向共享实例及自己的账号。Aspire 的资源管理 / 健康探测使用实例管理员凭据。

这是开发环境的资源合并：内存、故障与维护窗口由三个数据库共同承担。生产是否拆实例、迁移账号与运行账号进一步分离、备份与恢复演练，仍在计划中。

## 数据保留

1. 通过 Aspire 停止 BFF、两个业务服务和 Keycloak，暂停应用写入。
2. 对原三个数据库执行 custom-format `pg_dump`，再正常停止旧 AppHost。
3. 使用新卷 `nexora-postgres-data`，显式设置一次性的 `Postgres__RestoreDirectory`。初始化脚本创建数据库和独立账号，以对应账号恢复无原所有者 / ACL 的备份；初始化完成后服务才连接。
4. 核对下列 10 张表的行数与完整行内容摘要，均与迁移前一致；随后正常停止并在不配置恢复目录的情况下重启。

| 数据库 | 核对表 | 迁移时行数 |
|---|---|---|
| organizationdb | workspaces / user_accounts / workspace_members / workspace_invitations / workspace_audit | 11 / 2 / 16 / 7 / 39 |
| reportingdb | workspace_projection / workspace_authorization_watermarks | 11 / 5 |
| identitydb | realm / user_entity / credential | 2 / 3 / 5 |

上述核对发生在浏览器用例写入新测试数据之前，不是持续不变的记录数。备份覆盖完整数据库；内容摘要抽查覆盖上述表。

旧卷 `nexora.apphost-99ce89c660-organization-postgres-data`、`nexora.apphost-99ce89c660-reporting-postgres-data`、`nexora.apphost-99ce89c660-identity-postgres-data` 均保留，未清理。备份和详细摘要在受保护且已忽略的 `artifacts/p1/runtime/postgres-consolidation/`；其中包含身份敏感数据，不提交或上传。旧卷是迁移时快照，直接切回会丢失迁移后产生的业务变化。

## 本地验证结果

- AppHost 构建：0 警告、0 错误。
- 首次恢复启动与无恢复配置的普通重启均成功，BFF 和依赖健康；普通启动不再挂载备份目录。
- 实际数据库会话确认三个服务均使用自己的账号；三账号对其他两库的六种 CONNECT 组合全部拒绝。
- 普通重启后的现有 Playwright 用例：2 / 2 通过，覆盖真实 OIDC / TOTP、CSRF、创建工作区、Reporting 投影、跨工作区拒绝、注销、成员邀请、角色修改与即时停用 / 恢复。
- PostgreSQL 实际镜像为 `18.3`，当前由已锁定的 Aspire Hosting 版本提供默认值。

本次未新增业务逻辑，未重跑先前 20 项后端测试；其历史结果仍见成员授权验收记录。当前浏览器结果位于 `artifacts/p1/browser-results.json`。

## 后续本地维护

新卷首次启动时自动执行初始化脚本；已有卷不会自动重跑 Docker 初始化。新增数据库或更换独立账号密码时，先备份并停止应用写入，在确认目标是本项目 `postgres` 容器且没有配置恢复目录后，显式执行 `bash /docker-entrypoint-initdb.d/10-application-databases.sh`，再恢复服务。该脚本可重复创建缺少的角色 / 数据库，并同步账号密码与权限，不会自动执行业务 schema 迁移。

`Postgres__RestoreDirectory` 只用于受控的新卷恢复，要求目录包含全部三个同名 `.dump` 文件。不要把它作为日常配置；已有卷需要单独制定恢复操作，不能靠重启覆盖。AppHost 的 UserSecretsId 和已生成的参数保持不变；重置密码参数前须同步数据库中的密码。
