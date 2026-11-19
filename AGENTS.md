# Nexora ERP 开发协作约定

本文件适用于整个仓库。实施前查阅 [架构](docs/架构.md)、[计划与 TODO](docs/计划.md)、[依赖基线](docs/依赖.md) 和相关 [ADR](docs/adr/README.md)。运行环境见 [README](README.md)，领域政策及固定样例见 [P0 业务政策](docs/domain/p0-policies.md)。

## 架构与开发边界

- 后端使用 ASP.NET Core、.NET Aspire、Wolverine、微服务、Clean Architecture、DDD 和 CQRS。前端使用 Nuxt 4、Vue 3 和 TypeScript strict。依赖版本以仓库配置与锁文件为准。
- 按限界上下文组织服务。每个服务拥有自己的数据库、凭据和迁移。本地可共用 PostgreSQL 实例。跨服务通过发布的 API 或版本化消息协作，禁止直连其他服务数据库、引用其内部层或共享领域实体。
- `Domain` 使用纯 C#，由聚合行为维护业务不变量。`Application` 定义命令、查询、用例和端口。`Infrastructure` 实现持久化及消息适配。`Api` 负责请求映射和组合根。端点与消费者通过用例执行写入，查询按需投影 DTO。
- 项目内按[后端标准目录结构](#后端标准目录结构)归档源码，各职责目录内再按业务能力分组。
- **依赖倒置原则（DIP）**。用例依赖内层定义的端口，外层适配器实现端口。项目引用方向为 `Application → Domain`、`Infrastructure → Application / Domain`、`Api → Application`。`Api → Infrastructure` 仅限组合根注册实现。禁止内层引用基础设施实现，端点通过用例访问业务数据。
- 使用 Wolverine.HTTP 和 Wolverine 分发命令。在事务处理器中显式绑定本服务的 EF Core DbContext，使业务写入、审计、幂等回执与适用的 Outbox 同事务提交。跨服务流程使用持久化消息、Inbox 与 Saga，按场景验证重复投递、乱序及失败恢复。
- Keycloak 负责身份认证。BFF 持有服务端会话与令牌，浏览器使用会话 Cookie 及写请求 CSRF 令牌。Organization 是业务授权权威。服务端按当前身份、租户、工作区及资源校验权限，审批绑定单据版本并校验职责分离。
- 金额与数量使用 `decimal`，跨 HTTP 和消息契约使用十进制字符串，按币种和业务政策舍入。业务日期独立保存，事件与审计使用 UTC。已生效的业务事实通过关联冲销或更正处理，历史快照保留原值。
- 复用现有实现并控制变更范围。涉及新服务时同步核对解决方案、AppHost、BFF、独立数据库和迁移。保留工作区已有改动，开发凭据、令牌及 MFA 种子留在本地受保护的运行目录。

## 仓库目录结构

```text
Nexora ERP/
├── Nexora.slnx                      # .NET 解决方案
├── global.json                     # .NET SDK 版本
├── Directory.Build.props           # .NET 项目公共构建设置
├── Directory.Packages.props        # NuGet 集中包版本
├── NuGet.Config                     # NuGet 源配置
├── dotnet-tools.json                # 仓库 .NET 工具清单
├── aspire.config.json               # Aspire CLI 配置
├── .agents/skills/                  # 仓库开发技能
├── .github/workflows/               # GitHub Actions
├── src/
│   ├── BuildingBlocks/
│   │   ├── Nexora.BuildingBlocks.Application/ # ActorContext、授权端口和通用应用异常
│   │   └── Nexora.BuildingBlocks.Grpc/        # gRPC 通道、调用上下文和错误映射
│   ├── Hosting/
│   │   ├── Nexora.AppHost/                   # Aspire 资源、服务引用、环境与启动配置
│   │   └── Nexora.ServiceDefaults/           # 遥测、健康检查、服务发现与认证共用配置
│   ├── Gateway/
│   │   └── Nexora.ApiGateway/
│   │       ├── Program.cs
│   │       └── Infrastructure/Proxy/         # YARP 入口路由与转发
│   ├── Services/
│   │   ├── Organization/                    # 公司、部门、成员、邀请、角色与授权
│   │   ├── MasterData/                      # 商品、分类、计量单位和往来单位
│   │   ├── Purchasing/                      # 采购订单、审批和收货许可
│   │   ├── Sales/                           # 报价、销售订单、审批和履约许可
│   │   ├── Inventory/                       # 仓库、收发货、预留、盘点、调拨和成本
│   │   ├── Finance/                         # 科目、总账、应收应付、税务、银行、开票和报表
│   │   └── Reporting/                       # 经营查询投影和消费水位
│   └── Web/nexora-web/                      # Nuxt 4 应用
├── tests/Nexora.Tests/                       # .NET 领域、架构边界与集成测试
├── deploy/postgres/                          # PostgreSQL 应用库初始化
├── scripts/
│   ├── p0/                                  # 依赖基线、Keycloak 扩展与 PDF 验证
│   ├── p1/                                  # 平台、消息代理与邮箱开通脚本
│   ├── p2/                                  # 本地业务数据库初始化脚本
│   └── p4/                                  # 发票字体准备
├── docs/
│   ├── 架构.md
│   ├── 计划.md
│   ├── 依赖.md
│   ├── adr/                                 # 架构决策
│   ├── domain/                              # 领域政策、契约与固定样例
│   └── verification/                        # 验收范围、命令和结果
└── artifacts/                               # 本地运行与验证产物
```

### 后端标准目录结构

业务服务位于 `src/Services/<Service>/`，项目按 `Nexora.<Service>.Domain`、`Nexora.<Service>.Application`、`Nexora.<Service>.Infrastructure` 和 `Nexora.<Service>.Api` 组织。`Api` 对应 Presentation 层。各层先按下表归档职责，目录内再按业务能力分组，例如 `Aggregates/Orders/` 和 `Handlers/Commands/Orders/`。目录随实际职责建立。Reporting 的查询投影使用 `Api`、`Application` 和 `Infrastructure`。

#### Domain

| 目录                | 职责                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `Aggregates/`     | 聚合根及其内部实体，由聚合行为保护业务不变量。                                   |
| `Entities/`       | 独立建模的领域实体。聚合内部实体随聚合归档。                                     |
| `ValueObjects/`   | 金额、数量、地址等不可变业务值。                                                 |
| `Enums/`          | 多个领域对象共用的业务枚举。                                                     |
| `Events/`         | 领域内已经发生的业务事实。                                                       |
| `Services/`       | 需要多个领域对象参与的规则和计算。                                               |
| `Specifications/` | 可复用的业务判定条件。                                                           |
| `Repositories/`   | 领域层自身需要的聚合仓储接口。用例需要的存储端口归 `Application/Interfaces/`。 |
| `Exceptions/`     | 业务不变量或领域规则被违反时的错误。                                             |
| `Abstractions/`   | 领域对象共用的纯 C# 抽象。                                                       |

#### Application

| 目录或文件                       | 职责                                          | 对应技术           |
| -------------------------------- | --------------------------------------------- | ------------------ |
| `Commands/`                    | 定义写操作的输入。                            | CQRS               |
| `Queries/`                     | 定义需要独立建模的查询输入。                  | CQRS               |
| `Handlers/Commands/`           | 执行写用例并协调领域聚合。                    | Wolverine          |
| `Handlers/Queries/`            | 执行读用例并投影结果。                        | Wolverine          |
| `Handlers/Events/Domain/`      | 处理本服务的领域事件。                        | Wolverine          |
| `Handlers/Events/Integration/` | 执行其他服务的集成消息触发的应用用例。        | Wolverine          |
| `Validators/`                  | 验证应用命令与查询的输入。                    | FluentValidation   |
| `DTOs/`                        | 定义应用用例的输入输出与查询投影。            | C# record 或 class |
| `Interfaces/`                  | 定义用例所需的仓储、查询和外部能力端口。      | 依赖倒置           |
| `Authorization/`               | 按操作者、业务权限与资源范围检查操作权限。    | 应用授权           |
| `Mappings/`                    | 在领域对象、应用 DTO 与用例结果之间转换。     | C#                 |
| `Exceptions/`                  | 定义应用用例错误。                            | C#                 |
| `DependencyInjection.cs`       | 有独立注册需求时，集中注册 Application 组件。 | Microsoft DI       |

多个入口共用的应用编排可放在 `UseCases/<业务>/`。绑定 EF Core 事务或消息传输的 Wolverine 适配器放在 `Infrastructure/Messaging/Handlers/`，由适配器调用 Application 用例。

#### Infrastructure

| 目录                            | 职责                                           |
| ------------------------------- | ---------------------------------------------- |
| `Persistence/Contexts/`       | 本服务的 EF Core DbContext。                   |
| `Persistence/Configurations/` | 实体和值对象映射、索引与约束。                 |
| `Persistence/Repositories/`   | 实现聚合持久化端口。                           |
| `Persistence/Queries/`        | 实现 CQRS 读取端口，按需投影 DTO。             |
| `Persistence/Interceptors/`   | EF Core 持久化拦截器。                         |
| `Persistence/Migrations/`     | 本服务的数据库迁移和模型快照。                 |
| `Persistence/DesignTime/`     | EF Core 设计时工厂。                           |
| `Messaging/Configuration/`    | Wolverine、RabbitMQ、Inbox 与 Outbox 配置。    |
| `Messaging/Contracts/`        | 基础设施内部使用的传输类型。                   |
| `Messaging/Mappings/`         | 领域事件到集成事件的映射。                     |
| `Messaging/Handlers/`         | 消息收发及事务适配，显式绑定本服务 DbContext。 |
| `Messaging/Sagas/`            | 持久化跨服务流程及其消息协调。                 |
| `Integrations/`               | 其他微服务和第三方系统的 HTTP 或 gRPC 客户端。 |
| `Caching/`                    | Redis 缓存或会话存储适配。                     |
| `Storage/`                    | S3 等文件存储端口的实现。                      |
| `Identity/`                   | 当前用户、租户等身份上下文端口的实现。         |
| `Configuration/`              | 基础设施 Options 与配置验证。                  |

对外发布的版本化集成消息和 gRPC 契约归发布方的独立 `Nexora.<Service>.Contracts` 项目。gRPC 契约放在 `Contracts/Grpc/`，服务端映射放在 `Api/Grpc/`。

#### Presentation（Api）

| 目录或文件               | 职责                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `Controllers/`         | MVC Controller 接收 HTTP 请求并调用应用用例。                        |
| `Endpoints/`           | Nexora 业务 API 使用的 Wolverine.HTTP 端点，负责请求映射和用例分发。 |
| `Contracts/Requests/`  | HTTP 请求模型。                                                      |
| `Contracts/Responses/` | HTTP 响应模型。                                                      |
| `Authentication/`      | JWT Bearer 等 HTTP 入口认证配置。                                    |
| `Authorization/`       | HTTP 入口授权策略与策略适配器。                                      |
| `Filters/`             | MVC Action、Exception 等过滤器。                                     |
| `Middleware/`          | HTTP 请求管线扩展与异常响应。                                        |
| `OpenApi/`             | OpenAPI 文档定制。                                                   |
| `Extensions/`          | API 服务和中间件注册扩展。                                           |
| `Properties/`          | 本地开发启动配置。                                                   |
| `Program.cs`           | 应用入口与依赖注入组合根。                                           |

Nexora 的 HTTP 输入校验与序列化适配可分别放在 `Api/Validators/` 和 `Api/Serialization/`。

新增、修改或审查业务 HTTP 契约时，使用 [nexora-rest-api](.agents/skills/nexora-rest-api/SKILL.md) 核对路由、状态码、幂等、并发、错误和 OpenAPI。ASP.NET Core 通用能力可查阅 [dotnet-webapi](.agents/skills/dotnet-webapi/SKILL.md)，业务端点沿用本仓库的 Wolverine.HTTP 和 FluentValidation 约定。

### Nuxt 前端

Nuxt 项目根目录是 `src/Web/nexora-web/`。采用 Nuxt 4 的默认布局，`app/` 是 Vue 应用的 `srcDir`，`server/`、`shared/` 和 `public/` 与 `nuxt.config.ts` 同级。下方标注「按需」的目录和文件随对应功能建立。 [Nuxt 4 官方目录结构](https://nuxt.com/docs/4.x/directory-structure)

```text
src/Web/nexora-web/
├── app/                                    # Vue 应用
│   ├── app.vue                             # 根组件，挂载布局和页面
│   ├── app.config.ts                       # 公开的应用配置，如主题
│   ├── error.vue                           # 自定义全局错误页面（按需）
│   ├── spa-loading-template.html           # SPA 初始加载界面（按需）
│   ├── assets/
│   │   └── css/main.css                    # 由构建工具处理的全局样式
│   ├── pages/                              # 文件路由与页面级编排
│   │   ├── index.vue                       # / 工作区入口与业务工作台
│   │   ├── join.vue                        # /join 邮件邀请接受页
│   │   ├── invoice-share.vue               # /invoice-share 发票分享页
│   │   └── companies/[workspaceId]/
│   │       ├── setup.vue                   # 公司初始化
│   │       ├── members.vue                 # 团队与成员
│   │       ├── roles.vue                   # 角色与权限
│   │       └── billing.vue                 # 订阅与计费
│   ├── layouts/default.vue                 # 侧栏、页头和页面容器
│   ├── components/                         # 业务面板、表单、表格等 Vue 组件
│   ├── composables/                        # 页面与组件复用的 useXxx 逻辑
│   ├── stores/                             # @pinia/nuxt 管理的应用共享状态
│   ├── middleware/                         # 页面导航前的检查和跳转
│   ├── plugins/                            # Vue 应用初始化和插件注入（按需）
│   ├── utils/                              # 应用侧格式化、校验和转换工具
│   └── types/                              # 仅 Vue 应用使用的类型（按需）
├── server/                                 # Nitro 服务端
│   ├── api/                                # 自动加 /api 前缀的 Nitro 接口（按需）
│   ├── routes/                             # 完整 URL 按文件路径注册
│   │   ├── bff/
│   │   │   ├── login.get.ts                # GET /bff/login
│   │   │   ├── logout.post.ts              # POST /bff/logout
│   │   │   └── api/[...path].ts            # /bff/api/* 转发到 API Gateway
│   │   ├── signin-oidc.get.ts               # Keycloak 登录回调
│   │   ├── signout-callback-oidc.get.ts     # Keycloak 退出回调
│   │   ├── health.get.ts                    # 就绪检查
│   │   └── alive.get.ts                     # 存活检查
│   ├── middleware/                         # HTTP 请求进入 Nitro 路由前的处理
│   ├── plugins/                            # Nitro 生命周期，如 Redis 连接管理
│   ├── utils/                              # OIDC、服务端会话与 CSRF
│   └── types/                              # 仅 Nitro 使用的类型（按需）
├── shared/                                 # Vue 和 Nitro 真正共用的代码（按需）
│   ├── types/                              # 两端共用的类型（按需）
│   └── utils/                              # 两端均可运行的纯函数（按需）
├── public/                                 # 原路径公开的图标、manifest 等静态文件
├── modules/                                # 本地 Nuxt 模块（按需）
├── layers/                                 # 可复用的 Nuxt 配置与功能（按需）
├── content/                                # 接入 Nuxt Content 后的内容（按需）
├── i18n/locales/                            # Nexora 的简体中文与英文文案
├── test/                                   # Nexora 的 Vitest 测试
├── e2e/                                    # Nexora 的 Playwright 业务流程测试
├── nuxt.config.ts                          # Nuxt 模块、运行时配置与构建设置
├── playwright.config.ts                    # Playwright 的 e2e/ 入口与测试配置
├── tsconfig.json                           # TypeScript 项目配置
├── package.json                            # 依赖、脚本和包管理器版本
└── pnpm-lock.yaml                          # 锁定依赖解析
```

- **Vue 应用 `app/`**。页面编排布局和业务组件。组件、composable 和工具按职责目录内的业务能力归档，例如 `components/sales/`、`composables/inventory/` 与 `utils/organization/`。Nuxt 按组件文件名自动导入，文件名在 `components/` 内保持唯一。composable 和工具的业务子目录也参与自动导入。组件和页面通过同源 `/bff/api/*` 请求业务数据。页面导航逻辑归 `app/middleware/`，应用状态通过 `app/stores/` 中的 Pinia store 复用。 [Nuxt 组件命名](https://nuxt.com/docs/4.x/directory-structure/app/components#component-names) · [Nuxt 页面路由](https://nuxt.com/docs/4.x/directory-structure/app/pages) · [Pinia 的 Nuxt 集成](https://pinia.vuejs.org/ssr/nuxt.html#auto-imports)
- **Nitro 服务端 `server/`**。Nexora 的 BFF 使用 `server/routes/bff/` 保留 `/bff/*`，OIDC 回调也放在 `server/routes/`。Nitro 管理浏览器会话，校验写请求的 CSRF 令牌，并使用服务端会话令牌请求 API Gateway。OIDC 客户端密钥放在服务端私有运行时配置中，`runtimeConfig.public` 只放可公开给浏览器的值。`server/middleware/` 处理进入 Nitro 的 HTTP 请求。 [Nitro 服务端目录](https://nuxt.com/docs/4.x/directory-structure/server) · [Nuxt 运行时配置](https://nuxt.com/docs/4.x/guide/going-further/runtime-config)
- **两端共用 `shared/`**。只放 Vue 与 Nitro 都需要的类型和纯 TypeScript 函数，例如共用的 API 响应类型。`app/` 和 `server/` 可以导入 `shared/`，彼此保持独立，`shared/` 也独立于 Vue 和 Nitro。Nuxt 默认扫描 `shared/types/` 和 `shared/utils/` 的直属文件，更深的文件可用 `#shared` 显式导入。 [Nuxt 共享目录](https://nuxt.com/docs/4.x/directory-structure/shared)

默认别名 `~` 和 `@` 指向 `app/`，`~~` 和 `@@` 指向 Nuxt 项目根目录，`#server` 供 Nitro 服务端代码使用。`.nuxt/` 和 `.output/` 是生成目录。 [Nuxt 默认别名](https://nuxt.com/docs/4.x/api/nuxt-config#alias) · [Nitro 服务端别名](https://nuxt.com/docs/4.x/directory-structure/server#server-alias)

## 本地开发与验证

命令从仓库根目录运行。依照 README 准备锁定的 .NET SDK、Aspire CLI、Node、pnpm、Linux Docker 引擎和受信任的 ASP.NET 开发证书。

```powershell
dotnet tool restore
dotnet restore Nexora.slnx --locked-mode
pnpm --dir src/Web/nexora-web install --frozen-lockfile
dotnet build Nexora.slnx -c Release --no-restore
dotnet test tests/Nexora.Tests -c Release --no-build
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web build
```

需要验证登录、页面或跨服务流程时，启动指定 AppHost 并等待 `gateway` 健康。使用既有卷首次启用新库时，在启动后按 README 执行对应的数据库初始化脚本，再等待网关。由本次验证启动的 AppHost 在结束后正常停止，保留持久卷。

```powershell
$nexoraAppHost = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
aspire start --apphost $nexoraAppHost --non-interactive
aspire wait gateway --apphost $nexoraAppHost --timeout 120 --non-interactive
pnpm --dir src/Web/nexora-web test:e2e
aspire stop --apphost $nexoraAppHost --non-interactive
```

- Playwright 使用本地 BFF、Edge 和开发身份。可用 `--grep` 聚焦变更场景，保持浏览器套件串行运行。
- 修改 EF 模型时，为所属服务生成增量迁移，使用该服务的项目、启动项目和 DbContext 执行 `dotnet ef migrations has-pending-model-changes`，并验证相关数据库的实际升级。
- 平台就绪及 RabbitMQ 权限使用 `pwsh scripts/p1/Test-Platform.ps1` 验证。仅在相应的故障恢复验收中使用 `-Faults`，该选项会短暂停止并恢复本地依赖。

## 按计划推进与更新 TODO

1. 开始实施前，按 [计划](docs/计划.md) 定位当前阶段、首个符合依赖顺序的未完成条目和验收条件。优先完成一个可从正常入口验证的子项。
2. 实现后按影响面验证。交易流程重点检查权限、跨工作区隔离、版本、幂等、失败后状态和并发门禁。文档变更检查路径、命令及引用与实际仓库一致。
3. 对应验收通过后，在同一次交付中更新 `docs/计划.md` 的具体 TODO。分批交付时只勾选已完成且通过验收的子项。父项与 F01–F42 总清单须满足全部适用条件。
4. 将复现命令、结果和验证范围记录在 `docs/verification/`，并从对应 TODO 链接过去。区分构建、测试、本地集成、远程 CI 与生产验收。失败、跳过或依赖未就绪的条目保持待完成，并记录缺口。
