# P1 运行依赖与本地加固验收

日期：2026-11-06。对应计划 P1-03c / 03d / 03e。P1 总体验收仍未完成；本记录覆盖本地底座，未执行远端 CI 或生产部署。

## 实现

`/alive` 只检查进程存活，`/health` 执行依赖检查，响应仅含状态。检查失败不向响应或健康检查日志输出连接异常中的凭据。公共探针取消超时设为四秒，HTTP 探针单次请求，不使用重试或缓存熔断状态。

| 服务 | 就绪检查 |
|---|---|
| Organization | 自己的 EF 数据库连接、以自己账号认证的 AMQP 连接 / 通道、OIDC discovery、Wolverine 启动及 listener 状态 |
| Reporting | 自己的 EF 数据库连接、以自己账号认证的 AMQP 连接 / 通道、OIDC discovery、Organization `/health`、Wolverine 启动及 RabbitMQ listener 状态 |
| BFF | 会话 Redis PING、OIDC discovery、Organization / Reporting `/health`、Nuxt 入口 |

`WolverineFx.HealthChecks` 与全套 Wolverine 同为 6.61.0。框架 listener 检查按其标准语义报告 Healthy / Degraded / Unhealthy；标准 HTTP 映射下 Degraded 为 200，不将背压直接视为进程死亡。当前测试没有声称覆盖全部 listener 锁存或崩溃恢复场景。

Domain / Application / Contracts 未引入健康检查、RabbitMQ 或 Aspire 包。`RabbitMQ.Client` 显式固定为原来已解析的 7.2.2；ServiceDefaults 复用它检查连接 / 通道，不替代 Wolverine 的业务传输和 Inbox / Outbox。

## Broker 账号与路由

| 使用方 | 账号 | 边界 |
|---|---|---|
| Organization | nexora-organization | 配置 / 发布 `nexora.organization.events`；使用自己的 `nexora.organization.deadletters`，不能消费 Reporting 队列 |
| Reporting | nexora-reporting | 配置 / 消费现有 `nexora.reporting.workspaces.v1`、绑定事实交换机，并使用现有 `wolverine-dead-letter-queue`；不能消费 Organization 死信或声明无关队列 |
| Aspire 管理 / 探测 | 既有生成凭据的管理员 | 不作为两个业务服务的连接串 |

两个业务账号均无管理标签。真实连接列表已确认业务连接使用上述独立账号；Aspire 的管理员健康连接仍存在。应用当前使用 `/` vhost，通过精确资源名权限限制操作，未声称已完成生产专用 vhost、TLS / 证书认证或运维机器身份。

原来的直接发送队列改为发布专用事实交换机，并持久绑定至原 Reporting 队列，继续使用同一数据库 Outbox / Inbox。启动定义预建交换机、队列及绑定，以避免发布者先于消费者启动时没有路由；队列名、classic 类型及原 DLX 参数保持兼容。定义导入不清空队列，未删除历史队列或数据卷。

仅使用进程内 InvokeAsync 和异步集成事实，因此禁用未使用的 RabbitMQ 系统请求 / 应答队列。跨服务同步授权仍为受认证的 HTTP 回查。Organization 的伪造用户消息拒绝测试改为检查专属死信队列，继续验证消息被拒绝而业务数据没有变化。

账号密码沿用 AppHost User Secrets 自动生成和持久化。启动定义文件只写密码哈希，位于已忽略的 `artifacts/p1/runtime/rabbitmq/`；哈希和 realm 文件也属于敏感开发数据，不上传。账号轮换必须同步 broker 与本机参数，不通过清空持久卷修复凭据不一致。

## 镜像与指标

`ContainerImageDigests.cs` 固定 PostgreSQL 18.3、RabbitMQ 4.3-management、Redis 8.6、Keycloak 26.8.2 对应的四个仓库 digest。Aspire `WithImageSHA256` 接收不含 `sha256:` 前缀的十六进制值；脚本核对实际容器的 `repo@sha256:...` 与源码一致。更新时须同时审查版本与摘要，固定 digest 不替代安全扫描。

`Nexora.Platform` Meter 接入现有 OpenTelemetry 配置，提供 `nexora.dependency.probes` 计数及 `nexora.dependency.duration` 秒数直方图。标签仅为固定依赖名与 healthy / unhealthy，不含用户、租户或单据 ID。自动测试断言失败 / 成功探测、耗时指标和敏感异常不泄露。本轮没有把 MeterListener 断言表述为生产 OTLP 采集 / 告警验收。

## 验证与复现

```powershell
dotnet restore Nexora.slnx --locked-mode
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
pwsh scripts/p1/Test-Platform.ps1 -Faults
pnpm --dir src/Web/nexora-web test:e2e
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

故障脚本只操作该 AppHost 的命名资源；每个故障的 finally 都启动并等待原资源恢复。不带 `-Faults` 仅做基线、实际镜像及账号权限检查。AMQP 探针为独立 .NET 10 文件应用，从本机 AppHost User Secrets 读取密码，不把密码放入参数或报告；其依赖锁定在 `scripts/p1/packages.lock.json`。

| 验证 | 结果与证据 |
|---|---|
| Debug / Release 构建 | 均为 0 警告、0 错误 |
| Debug / Release 后端 | 各 21 项，含新增探针 / 指标断言；TRX 为 `artifacts/p1/test-results/p1-platform-*.trx` |
| AMQP 负向检查 | 4 项拒绝：两账号分别跨服务消费、声明无关队列；`artifacts/p1/broker-permissions.json` |
| 真实依赖故障 | RabbitMQ / PostgreSQL / Redis / Keycloak 中断、存活与恢复共 36 项 HTTP 状态断言，见历史结果索引 `artifacts/p1/platform-validation.json` |
| 实际镜像 | 上述报告内记录四个运行镜像并逐个匹配源码 digest |
| 浏览器 | 2 / 2，真实 OIDC + TOTP、创建 / 投影 / 隔离、邀请 / 角色 / 即时停用与恢复；`artifacts/p1/browser-results.json` |

源码摘要与结果索引位于 `artifacts/p1/platform-validation.json`。浏览器用例会写入新的测试工作区；历史数据迁移时的记录数不是当前不变断言。原数据库和旧卷继续保留。

## 专用连接串引用复测

2026-11-11，七个业务服务通过 `WithReference` 引用各自的 PostgreSQL 与 RabbitMQ 连接串资源。原数据库与 broker 资源通过 `WaitFor` 保留启动依赖。各服务沿用原配置键、账号和权限规则。

按上文命令启动 AppHost 并等待 BFF 就绪，然后运行以下检查。

```powershell
dotnet build Nexora.slnx -c Release --no-restore
pwsh scripts/p1/Test-Platform.ps1
pnpm --dir src/Web/nexora-web test:e2e --grep 'OIDC \+ TOTP|Workspace invitation'
```

- Release 构建通过，0 个警告和错误。平台脚本从运行时资源快照验证七个服务均只收到预期的两个连接串键，且未注入原始数据库或 broker 的额外连接属性。报告只保存键名。
- PostgreSQL 的 `pg_stat_activity` 与 RabbitMQ 的 `rabbitmqctl -q list_connections user` 确认七个服务使用各自的账号。Keycloak 连接 `identitydb` 使用专用账号。
- 四个基础容器镜像摘要、六项健康与存活检查、四项 AMQP 越权拒绝检查均通过。两项 Playwright 用例通过，覆盖登录、注销、工作区投影、邀请和成员权限变更。本次使用基线检查模式，故障演练见历史结果。

## Aspire 13.6.5 安全补丁验证

2026-11-11，AppHost SDK、Hosting 和现有资源集成升级到 `13.6.5` 系列，Keycloak 集成使用 `13.6.5-preview.1.26559.7`。AppHost 锁文件将 `Aspire.Hosting.AppHost` 和 `Aspire.Hosting` 都解析到 `13.6.5`。[微软安全公告 CVE-2026-120006](https://github.com/advisories/GHSA-f7vh-h5g3-7jrh) · [Aspire 13.6.5 发布记录](https://github.com/microsoft/aspire/releases/tag/v13.6.5)

使用默认 NuGet 审计策略验证严格锁定还原。NuGet 在当前源上扫描 AppHost 的直接和传递依赖，结果无已知漏洞包。项目锁文件改动集中在 AppHost。

- Debug 和 Release 均为 0 警告、0 错误，31 项 .NET 测试通过。
- 使用本机 Aspire CLI 13.6.5 启动新版 AppHost。Nuxt 冷启动期间 BFF 的 Web 就绪探测超时，待 Web 就绪后复测，七个服务的连接引用、四个固定镜像、六项 HTTP 健康探测和四项 RabbitMQ 权限检查通过。
- Edge 的 OIDC / TOTP、CSRF、工作区投影和隔离、正常退出及本地会话失效后退出用例 2/2 通过。本次 AppHost 已停止。平台与浏览器报告保存在 `artifacts/p1/runtime/aspire-13.6.5/`。

```powershell
dotnet restore Nexora.slnx --locked-mode --no-cache
dotnet package list --project src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --vulnerable --include-transitive --no-restore
dotnet build Nexora.slnx -c Release --no-restore
dotnet build Nexora.slnx -c Debug --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build

$appHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $appHost --no-build --non-interactive
aspire wait bff --apphost $appHost --timeout 180 --non-interactive
pwsh scripts/p1/Test-Platform.ps1
pnpm --dir src/Web/nexora-web test:e2e --grep 'OIDC \+ TOTP|after the BFF session is gone'
aspire stop --apphost $appHost --non-interactive
```

## 剩余 TODO

P1-03b 继续保留：生产秘密交付、DataProtection 密钥保护与轮换、数据库迁移 / 运行账号分离、生产遥测 / 告警、镜像安全与发布验收。P1-04c 的静态生成、Saga / 延时 / 崩溃恢复，P1-05b 的协调刷新与认证产品，完整业务角色 / 范围、权益及审计查询仍未完成。Google 和真实邮件暂未配置，按用户选择继续推进可本地验证事项。

依据：[ASP.NET Core 健康检查](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)、[Wolverine 健康检查](https://wolverinefx.io/guide/health-checks.html)、[RabbitMQ 权限](https://www.rabbitmq.com/docs/access-control)、[启动定义导入](https://www.rabbitmq.com/docs/definitions)、[定义文件密码哈希](https://www.rabbitmq.com/docs/4.3/passwords)。具体 API 还经本机锁定包元数据及编译验证。
