# P0 F01–F42 用例规格

> 2026-11-06，P0-01 设计基线；页面与 API 为 Nexora 目标契约，尚未实现。功能证据固定到 AccountGo `535c1cd`，S 编号见 [计划.md](../计划.md) 第 2.3 节。

## 1. 通用约定

- 工作区使用 CompanyId 标识，前端 `/w/{id}` 与 API 请求上下文都要验证成员关系；公开登录流程不套用业务成员校验。
- 每个写用例明确业务操作 ID / 幂等范围、输入 / 资源版本、成功结果、失败原因与审计。`Unknown` 与 `NeedsAttention` 不是成功。
- 列表、详情、下载、导出和消息共享范围语义；跨服务不复用可变领域实体。
- 参考项目暴露入口不代表 Nexora 已实现，也不证明参考入口运行验收通过。每项完成仍以测试、联调及用户验收证据为准。
- 下列“最低验收”沿用功能矩阵；P1 生成 OpenAPI 与实际请求 / 响应样例，路由调整须同步此表。

## 2. 用例目录

| 用例 | 能力 | 归属 / 阶段 |
| --- | --- | --- |
| [UC-F01](#uc-f01) | 自助注册 / 邀请登录、邮箱六位 OTP | Keycloak / BFF、Organization / P1 |
| [UC-F02](#uc-f02) | Google 登录 | Keycloak / BFF / P1 |
| [UC-F03](#uc-f03) | MFA 能力查询、挑战 / 注册和敏感操作附加验证 | Keycloak / BFF、各服务 / P1 |
| [UC-F04](#uc-f04) | 账号资料、凭据管理、会话 / 设备、注销 / 撤销及账号删除预检 | Keycloak / BFF、Organization / P1–P5 |
| [UC-F05](#uc-f05) | 企业工作区创建、切换与初始化向导 | Organization / P1–P2 |
| [UC-F06](#uc-f06) | 成员邀请、加入、停用、管理角色 | Organization / P1 |
| [UC-F07](#uc-f07) | 业务角色、权限、数据范围、职责分离与审批政策 | Organization、各服务 / P1–P2 |
| [UC-F08](#uc-f08) | 公司偏好、Logo / 品牌、日期与本位币格式 | Organization、Finance / P2 |
| [UC-F09](#uc-f09) | 计划、订阅、模块开关、配额和权益查询 | Organization / P1–P5 |
| [UC-F10](#uc-f10) | 计费状态与客户门户 | Organization / P5 |
| [UC-F11](#uc-f11) | 个人账本创建及与企业工作区链接 / 解除 | Organization、Finance / P2 |
| [UC-F12](#uc-f12) | 公告及按工作区能力展示 | Organization、Web / P1–P5 |
| [UC-F13](#uc-f13) | 客户 / 供应商 / 捐赠人、联系人与业务资料 | MasterData / P2 |
| [UC-F14](#uc-f14) | 商品 / 服务、分类、计量单位与库存标记 | MasterData、Inventory / P2–P3 |
| [UC-F15](#uc-f15) | 税项、税率、商品税组、往来税组及单据税额 | Finance Tax、MasterData / P2–P4 |
| [UC-F16](#uc-f16) | 科目层级、类别、归档 / 恢复与使用限制 | Finance GL / P2 |
| [UC-F17](#uc-f17) | 科目模板、结构 / 快照导出、导入预览与提交 | Finance GL / P2 |
| [UC-F18](#uc-f18) | 手工 / 自动凭证、过账、总账与科目明细 | Finance GL / P2–P4 |
| [UC-F19](#uc-f19) | 会计年度、年结预览、关闭与重开 | Finance / P2、P5 |
| [UC-F20](#uc-f20) | 试算平衡、利润表、资产负债表、现金流量表 | Finance、Reporting / P5 |
| [UC-F21](#uc-f21) | 财务 / 经营仪表盘、收入支出与现金概览 | Finance、Reporting / P5 |
| [UC-F22](#uc-f22) | 销售报价、订单及履约依据 | Sales / P4 |
| [UC-F23](#uc-f23) | 客户发票列表 / 编辑 / 详情 / 生效与更正 | Finance AR、Sales / P4 |
| [UC-F24](#uc-f24) | 客户收款、部分核销、未结金额及客户账龄 | Finance AR / P4–P5 |
| [UC-F25](#uc-f25) | 发票 PDF、品牌模板 / 预览和受控分享链接 | Finance AR、Organization / P4 |
| [UC-F26](#uc-f26) | 发票邮件、投递状态、重新发送 / 放弃 | Finance AR Worker / P4 |
| [UC-F27](#uc-f27) | 周期性开票计划、执行记录、日期预览和手动运行 | Finance AR、Wolverine / P4 |
| [UC-F28](#uc-f28) | 采购订单、收货与供应商履约 | Purchasing、Inventory / P3 |
| [UC-F29](#uc-f29) | 供应商账单、付款、部分核销和供应商账龄 | Finance AP、Purchasing / P3–P5 |
| [UC-F30](#uc-f30) | 库存查询、变动台账与调整 | Inventory / P3–P5 |
| [UC-F31](#uc-f31) | 银行 / 现金账户、默认账户、流水与交易作废 | Finance Treasury / P2–P3 |
| [UC-F32](#uc-f32) | 银行对账单导入、映射、预览及待审核行 | Finance Treasury / P3–P5 |
| [UC-F33](#uc-f33) | 银行对账、调整、完成、撤销与 PDF 报告 | Finance Treasury / P5 |
| [UC-F34](#uc-f34) | 对账单行匹配、收付核销、费用 / 其他收入和排除 | Finance Treasury、AR / AP / P3–P5 |
| [UC-F35](#uc-f35) | 捐赠人、捐赠单与捐赠科目 | MasterData、Finance Donations / P3–P5 |
| [UC-F36](#uc-f36) | 捐赠税务收据、现金 / 支票 / 卡 / 转账登记 | Finance Donations / P5 |
| [UC-F37](#uc-f37) | 科目 / 经营 / 财务数据导出与打印 | 所属服务、Reporting / P5 |
| [UC-F38](#uc-f38) | 业务与安全审计查询 | 各服务、Organization / P1–P5 |
| [UC-F39](#uc-f39) | CLI 登录授权、同意 / 拒绝与令牌撤销 | Keycloak / BFF、业务 API / P5 |
| [UC-F40](#uc-f40) | AI 助手流式会话、历史、取消 / 恢复与工具审批 | Gateway 支持模块、Organization / P5 |
| [UC-F41](#uc-f41) | 财务 MCP 查询与调用者权限 / 权益传递 | Gateway 工具适配、Finance / P5 |
| [UC-F42](#uc-f42) | 邮件 / 安全 / 集成能力发现及外部渠道配置 | Organization、BFF、所属服务 / P1–P5 |

## 3. 用例明细

<a id="uc-f01"></a>
### UC-F01 — 自助注册 / 邀请登录、邮箱六位 OTP

- **归属 / 来源**：Keycloak / BFF、Organization / P1；S01 声明、S02 源码。
- **页面**：`/login、/signup、/invite`。
- **API / 入口**：`GET /auth/login；IdP 注册 / OTP 流`。
- **前置与授权**：匿名用户；受控注册或有效邀请。
- **主流程**：提交邮箱 → 生成限时挑战 → 本地邮件 provider 交付 → 验证并单次消费 → OIDC 回调 → ERP 身份 / 成员绑定。
- **异常 / 竞态**：重放 / 到期 / 限流、邮件结果未知、并发提交；统一提示不得泄露账号存在性。
- **最低验收**：发送、验证、到期、单次使用、失败限流和邀请绑定可用。

<a id="uc-f02"></a>
### UC-F02 — Google 登录

- **归属 / 来源**：Keycloak / BFF / P1；S02 源码。
- **页面**：`/login`。
- **API / 入口**：`GET /auth/login?provider=google；OIDC 回调`。
- **前置与授权**：匿名用户；允许的 Google broker 配置。
- **主流程**：选择 Google → 重定向并校验 state / nonce → 验证上游身份 → 按 issuer / subject 关联 → 建立 BFF 会话。
- **异常 / 竞态**：伪造回调、未验证邮箱、同邮箱不同身份；不自动合并或开放任意 provider。
- **最低验收**：配置 OAuth client 后完成登录，未验证身份不得自动合并账号。

<a id="uc-f03"></a>
### UC-F03 — MFA 能力查询、挑战 / 注册和敏感操作附加验证

- **归属 / 来源**：Keycloak / BFF、各服务 / P1；S03 扩展入口；社区默认关闭。
- **页面**：`/profile/security、/auth/challenge`。
- **API / 入口**：`GET /api/v1/me/security；GET /auth/step-up`。
- **前置与授权**：当前用户或仅限指定挑战的 Pending 身份。
- **主流程**：查询能力 → 注册验证器 → 完成挑战 → 服务端记录认证上下文 → 敏感操作检查时效。
- **异常 / 竞态**：Pending token 访问业务接口、设备丢失、旧挑战重放、提供方未启用。
- **最低验收**：启用与未启用状态准确；配置能力可用后完成挑战及恢复验证。

<a id="uc-f04"></a>
### UC-F04 — 账号资料、凭据管理、会话 / 设备、注销 / 撤销及账号删除预检

- **归属 / 来源**：Keycloak / BFF、Organization / P1–P5；S01、S02、S06。
- **页面**：`/profile、/profile/sessions`。
- **API / 入口**：`GET /api/v1/me；GET /api/v1/me/sessions；POST /auth/logout`。
- **前置与授权**：只操作本人；跨成员管理另用治理权限。
- **主流程**：查询资料 / 会话 → 修改允许字段或撤销指定会话 → 删除阻断预检 → 执行可恢复身份停用。
- **异常 / 竞态**：撤销他人会话、最后管理员删除、财务历史级联删除、凭据类型不支持。
- **最低验收**：按登录方式管理凭据；会话可撤销，账号删除须处理管理员阻断且保留业务历史。

<a id="uc-f05"></a>
### UC-F05 — 企业工作区创建、切换与初始化向导

- **归属 / 来源**：Organization / P1–P2；S04、S06。
- **页面**：`/workspaces/new、/select-workspace`。
- **API / 入口**：`POST /api/v1/organization/workspaces；POST /api/v1/session/company`。
- **前置与授权**：organization.workspace.create 或受控引导；配额有效。
- **主流程**：建立工作区 → 配置 CN / CNY → Finance 初始化账簿 → 状态 ready 后切换。
- **异常 / 竞态**：重复创建、初始化一侧失败、无成员资格切换、旧请求返回污染新工作区。
- **最低验收**：公司资料、核算起点、科目模板、币种与会计年度可配置。

<a id="uc-f06"></a>
### UC-F06 — 成员邀请、加入、停用、管理角色

- **归属 / 来源**：Organization / P1；S02、S06。
- **页面**：`/w/{id}/members、/invite`。
- **API / 入口**：`POST /api/v1/organization/invitations；POST /api/v1/organization/members/{id}/suspend`。
- **前置与授权**：organization.members.invite / suspend；同工作区且不可越权转授。
- **主流程**：创建授权提案与令牌哈希 → 受邀者认证后兑换 → 绑定成员 / 角色 → 递增版本。
- **异常 / 竞态**：邀请过期 / 撤销 / 重复、跨租户角色、移除最后治理管理员。
- **最低验收**：过期 / 重复邀请拒绝，成员范围与最后管理员约束生效。

<a id="uc-f07"></a>
### UC-F07 — 业务角色、权限、数据范围、职责分离与审批政策

- **归属 / 来源**：Organization、各服务 / P1–P2；S02、S03、S07。
- **页面**：`/w/{id}/settings/access`。
- **API / 入口**：`PUT /api/v1/organization/members/{id}/roles；GET /api/v1/me/access`。
- **前置与授权**：organization.roles.assign；敏感授权需要独立批准。
- **主流程**：选择角色和各自范围 → 校验授予权限 → 本地提交分配 / 版本 / 审计 → Outbox 失效缓存。
- **异常 / 竞态**：权限范围交叉提权、Owner 自动拥有过账、未知权限、审批旧单据版本。
- **最低验收**：Owner 不自动拥有财务权限，跨范围资源及同人审批按政策拒绝。

<a id="uc-f08"></a>
### UC-F08 — 公司偏好、Logo / 品牌、日期与本位币格式

- **归属 / 来源**：Organization、Finance / P2；S01、S04、S06、S12。
- **页面**：`/w/{id}/settings/company`。
- **API / 入口**：`PUT /api/v1/organization/workspaces/{id}/settings`。
- **前置与授权**：organization.workspace.settings；公司币种变更受账簿状态限制。
- **主流程**：维护资料 / Logo → 校验币种精度 / 时区 / 年度 → 版本化提交 → 下游取快照。
- **异常 / 竞态**：首笔过账后静默更换币种、恶意文件、历史单据抬头被新资料覆盖。
- **最低验收**：不同公司独立配置币种与年度；修改不重写历史金额。

<a id="uc-f09"></a>
### UC-F09 — 计划、订阅、模块开关、配额和权益查询

- **归属 / 来源**：Organization / P1–P5；S05 源码。
- **页面**：`/w/{id}/settings/subscription`。
- **API / 入口**：`GET /api/v1/organization/subscription；PUT /api/v1/organization/modules`。
- **前置与授权**：organization.subscription.manage；实际功能权限独立检查。
- **主流程**：查看计划 / 模块 → 提交允许的开关 → 计算有效权益 → 发布权益版本。
- **异常 / 竞态**：客户端指定已付款、关闭模块仍有后台 / MCP 执行、配额并发超用。
- **最低验收**：API、页面、后台和工具同时受权益约束，套餐不替代操作权限。

<a id="uc-f10"></a>
### UC-F10 — 计费状态与客户门户

- **归属 / 来源**：Organization / P5；S05 接口；依赖提供方。
- **页面**：`/w/{id}/settings/billing`。
- **API / 入口**：`POST /api/v1/organization/billing/portal；POST /internal/billing/webhooks`。
- **前置与授权**：Owner 发起；provider 签名和事件用途验证。
- **主流程**：创建短期门户会话 → provider 完成 → 接收验签事件 → 幂等 / 有序更新计费事实与权益。
- **异常 / 竞态**：回跳提权、重放 / 乱序回调、provider 不可用、手工管理计划被外部覆盖。
- **最低验收**：手工 / 自托管状态准确；接入提供方后门户、回调验签与重复事件可验证。

<a id="uc-f11"></a>
### UC-F11 — 个人账本创建及与企业工作区链接 / 解除

- **归属 / 来源**：Organization、Finance / P2；S04 源码。
- **页面**：`/workspaces/personal、/w/{id}/links`。
- **API / 入口**：`POST /api/v1/organization/workspaces/personal；POST /api/v1/organization/workspace-links`。
- **前置与授权**：当前用户与双侧明确授权。
- **主流程**：建立个人工作区 → 初始化独立账簿 → 建立导航链接 → 单独核对访问。
- **异常 / 竞态**：链接后串账、解除链接误删业务、个人数据泄露到公司导出。
- **最低验收**：独立账簿与权限，链接只改变访问关系，不串账、不自动合并。

<a id="uc-f12"></a>
### UC-F12 — 公告及按工作区能力展示

- **归属 / 来源**：Organization、Web / P1–P5；S06、S17 源码。
- **页面**：`/dashboard 公告栏`。
- **API / 入口**：`GET /api/v1/organization/announcements`。
- **前置与授权**：当前用户 / 公告指定受众；公开公告单独分类。
- **主流程**：按时间和受众查询 → 返回安全展示数据 → 记录必要阅读状态。
- **异常 / 竞态**：过期公告、未授权工作区内容、HTML 注入、能力不可用却展示成功。
- **最低验收**：目标用户可见，过期及不匹配工作区公告不展示。

<a id="uc-f13"></a>
### UC-F13 — 客户 / 供应商 / 捐赠人、联系人与业务资料

- **归属 / 来源**：MasterData / P2；S01、S06、S10、S14。
- **页面**：`/w/{id}/partners`。
- **API / 入口**：`POST /api/v1/masterdata/partners；PUT /api/v1/masterdata/partners/{id}`。
- **前置与授权**：masterdata.partner.manage；角色与范围校验。
- **主流程**：创建主体 → 设置客户 / 供应商 / 捐赠人身份和联系人 → 校验唯一编码 → 保存版本。
- **异常 / 竞态**：跨公司引用、停用后新交易、同一主体重复而丢失往来链、旧版本覆盖。
- **最低验收**：列表、详情、编辑、停用与引用校验；同一主体可有多个身份。

<a id="uc-f14"></a>
### UC-F14 — 商品 / 服务、分类、计量单位与库存标记

- **归属 / 来源**：MasterData、Inventory / P2–P3；S01、S06、S10。
- **页面**：`/w/{id}/items`。
- **API / 入口**：`POST /api/v1/masterdata/items；PUT /api/v1/masterdata/items/{id}`。
- **前置与授权**：masterdata.item.manage。
- **主流程**：创建商品或服务 → 设置分类 / 基础单位 / 库存标记 → 下游引用版本。
- **异常 / 竞态**：服务误入库、已有数量后改基本单位、负数量 / 无效精度、停用 SKU 新交易。
- **最低验收**：服务项目不误增库存，商品基础属性和单位引用可验证。

<a id="uc-f15"></a>
### UC-F15 — 税项、税率、商品税组、往来税组及单据税额

- **归属 / 来源**：Finance Tax、MasterData / P2–P4；S09 源码。
- **页面**：`/w/{id}/finance/taxes`。
- **API / 入口**：`POST /api/v1/finance/tax-rules；POST /api/v1/finance/tax-preview`。
- **前置与授权**：finance.tax.manage；真实税务模板确认前仅研发样例。
- **主流程**：配置税组 / 生效版本 → 引用商品 / 往来分类 → 预览含税 / 未税 / 折扣 → 冻结单据结果。
- **异常 / 竞态**：税率失效、并发改模板、历史税额重算、未确认模板冒充法定票据。
- **最低验收**：含税 / 未税、折扣、舍入与科目映射有样例，历史税率快照保持。

<a id="uc-f16"></a>
### UC-F16 — 科目层级、类别、归档 / 恢复与使用限制

- **归属 / 来源**：Finance GL / P2；S07 源码。
- **页面**：`/w/{id}/finance/accounts`。
- **API / 入口**：`POST /api/v1/finance/accounts；POST /api/v1/finance/accounts/{id}/archive`。
- **前置与授权**：finance.accounts.manage。
- **主流程**：建层级 / 分类 / 用途 → 检查父子关系 → 归档或恢复 → 审计。
- **异常 / 竞态**：循环层级、统驭科目任意手工记账、删除已用科目、跨公司编码冲突。
- **最低验收**：层级及科目用途正确，已用科目不可随意删除。

<a id="uc-f17"></a>
### UC-F17 — 科目模板、结构 / 快照导出、导入预览与提交

- **归属 / 来源**：Finance GL / P2；S07 源码。
- **页面**：`/w/{id}/finance/accounts/import`。
- **API / 入口**：`POST /api/v1/finance/account-imports/preview；POST /api/v1/finance/account-imports/{id}/commit`。
- **前置与授权**：finance.accounts.import / export；预览绑定文件与映射版本。
- **主流程**：导出结构 / 模板 → 识别来源 → Append / Upsert / 条件 Replace 预览 → 确认提交。
- **异常 / 竞态**：文件变更后复用预览、CSV 偷改余额、非空账簿 Replace、部分失败无错误报告。
- **最低验收**：Append / Upsert、空账 Replace 与来源格式适配用固定样例验证；不改余额。

<a id="uc-f18"></a>
### UC-F18 — 手工 / 自动凭证、过账、总账与科目明细

- **归属 / 来源**：Finance GL / P2–P4；S01、S07 源码。
- **页面**：`/w/{id}/finance/journals、/ledger`。
- **API / 入口**：`POST /api/v1/finance/journals/{id}/post；POST /api/v1/finance/journals/{id}/reverse`。
- **前置与授权**：finance.journal.post / reverse；独立审批及资源版本。
- **主流程**：制单 → 审批 → 期间门禁下过账 → 总账钻取 → 新事实关联冲销。
- **异常 / 竞态**：借贷不平、来源重复、审批人等于制单人、旧版本及关闭期间。
- **最低验收**：借贷平衡、来源幂等、钻取及关联冲销可核对。

<a id="uc-f19"></a>
### UC-F19 — 会计年度、年结预览、关闭与重开

- **归属 / 来源**：Finance / P2、P5；S07 源码。
- **页面**：`/w/{id}/finance/periods`。
- **API / 入口**：`POST /api/v1/finance/periods/{id}/close；POST /api/v1/finance/periods/{id}/reopen`。
- **前置与授权**：finance.period.close / reopen；有原因与检查记录。
- **主流程**：进入 Closing → 固定水位 → 排空 / 对账 → 复核检查版本 → Closed。
- **异常 / 竞态**：对账后插入新凭证、迟到事实静默改期、重开未授权或重复结转。
- **最低验收**：结转、期初和截止水位可核对，关闭后并发过账不能穿透。

<a id="uc-f20"></a>
### UC-F20 — 试算平衡、利润表、资产负债表、现金流量表

- **归属 / 来源**：Finance、Reporting / P5；S07 源码与页面。
- **页面**：`/w/{id}/reports/financial`。
- **API / 入口**：`GET /api/v1/finance/reports/{kind}`。
- **前置与授权**：reports.finance.read；日期 / 口径 / 公司范围。
- **主流程**：选择四类报表 / 日期 / basis → Finance 计算正式结果 → 比较 / 钻取 / 导出。
- **异常 / 竞态**：半笔核销被当作全收、预收误确认为收入、跨期 / 跨公司、口径切换改账。
- **最低验收**：日期筛选、上期对比、导出、权责 / 收付口径及钻取可验证。

<a id="uc-f21"></a>
### UC-F21 — 财务 / 经营仪表盘、收入支出与现金概览

- **归属 / 来源**：Finance、Reporting / P5；S01、S06。
- **页面**：`/w/{id}/dashboard`。
- **API / 入口**：`GET /api/v1/reporting/dashboard`。
- **前置与授权**：reports.dashboard.read；投影水位可见。
- **主流程**：选工作区和期间 → 查询经营投影 → 展示现金 / 收支 → 跳明细。
- **异常 / 竞态**：把延迟投影当实时额度、指标定义不一致、旧公司请求覆盖新公司。
- **最低验收**：汇总口径有定义，与明细核对并显示投影水位。

<a id="uc-f22"></a>
### UC-F22 — 销售报价、订单及履约依据

- **归属 / 来源**：Sales / P4；S01 声明、S10。
- **页面**：`/w/{id}/sales/quotes、/orders`。
- **API / 入口**：`POST /api/v1/sales/orders；POST /api/v1/sales/orders/{id}/fulfillments`。
- **前置与授权**：sales.order.submit / approve / fulfill。
- **主流程**：报价转单 → 审批 → 原子签许可 → 库存预留 → 跟踪部分履约。
- **异常 / 竞态**：并发超发、价格改后旧审批、许可取消晚到消息、部分失败无状态。
- **最低验收**：报价转单、审批、部分履约及数量额度控制完整。

<a id="uc-f23"></a>
### UC-F23 — 客户发票列表 / 编辑 / 详情 / 生效与更正

- **归属 / 来源**：Finance AR、Sales / P4；S06、S10 源码。
- **页面**：`/w/{id}/sales/invoices`。
- **API / 入口**：`POST /api/v1/finance/invoices；POST /api/v1/finance/invoices/{id}/post`。
- **前置与授权**：finance.invoice.create / post；来源行额度与独立批准。
- **主流程**：读取商业依据快照 → 占用开票额度 → 建草稿 / 审批 → 生效 / 过账 → 更正。
- **异常 / 竞态**：两张并发发票超开、未发货就默认收入、重复来源 / 旧税率、退货后额度未调。
- **最低验收**：来源额度、价格税额快照、重复提交和更正链正确。

<a id="uc-f24"></a>
### UC-F24 — 客户收款、部分核销、未结金额及客户账龄

- **归属 / 来源**：Finance AR / P4–P5；S01、S10。
- **页面**：`/w/{id}/finance/receipts、/receivables`。
- **API / 入口**：`POST /api/v1/finance/receipts；POST /api/v1/finance/settlements`。
- **前置与授权**：finance.payment.record / allocate；指定资金账户与未结项。
- **主流程**：登记收款 → 建可分配余额 → 核销一或多未结项 → 查看剩余与账龄。
- **异常 / 竞态**：并发超核销、退款无来源、未分配款当收入、重复外部付款引用。
- **最低验收**：收款与未结项余额可核对，并发核销不超额。

<a id="uc-f25"></a>
### UC-F25 — 发票 PDF、品牌模板 / 预览和受控分享链接

- **归属 / 来源**：Finance AR、Organization / P4；S12 源码。
- **页面**：`/w/{id}/sales/invoices/{id}/preview`。
- **API / 入口**：`GET /api/v1/finance/invoices/{id}/pdf；POST /api/v1/finance/invoices/{id}/share-links`。
- **前置与授权**：finance.invoice.view / share；受控外链用途。
- **主流程**：用固定模板 / 字体渲染快照 → 预览 / 下载 → 签发限时分享 → 撤销。
- **异常 / 竞态**：ID 猜测下载、历史版本泄露、过期 / 撤销令牌、中文缺字 / 货币格式错误。
- **最低验收**：字体 / 币种 / 模板、下载权限、到期及撤销链接通过验证。

<a id="uc-f26"></a>
### UC-F26 — 发票邮件、投递状态、重新发送 / 放弃

- **归属 / 来源**：Finance AR Worker / P4；S13 源码；发送渠道依赖。
- **页面**：`/w/{id}/sales/invoices/{id}/delivery`。
- **API / 入口**：`POST /api/v1/finance/invoices/{id}/dispatches；GET /api/v1/finance/dispatches/{id}`。
- **前置与授权**：finance.invoice.email.send；模块与发件能力有效。
- **主流程**：冻结收件 / 版本 → 提交 Dispatch 与 Outbox → Worker 发送 → 状态回执。
- **异常 / 竞态**：发送成功回执丢失、重复重发、非法收件范围、渠道不可用伪成功。
- **最低验收**：真实测试渠道交付、失败 / 未知结果、重试及权限可验证。

<a id="uc-f27"></a>
### UC-F27 — 周期性开票计划、执行记录、日期预览和手动运行

- **归属 / 来源**：Finance AR、Wolverine / P4；S11 源码。
- **页面**：`/w/{id}/sales/recurring`。
- **API / 入口**：`POST /api/v1/finance/invoice-schedules；POST /api/v1/finance/invoice-schedules/{id}/run`。
- **前置与授权**：finance.recurring.manage / run。
- **主流程**：配置模板 / 时区 / 期限 → 预览 → 到期或手动建 occurrence → 正常开票流程。
- **异常 / 竞态**：暂停后晚到触发、同日手动与定时竞争、停机补跑、模板版本混用。
- **最低验收**：暂停 / 编辑、时区、停机恢复和重复触发不生成重复发票。

<a id="uc-f28"></a>
### UC-F28 — 采购订单、收货与供应商履约

- **归属 / 来源**：Purchasing、Inventory / P3；S01 声明、S10。
- **页面**：`/w/{id}/purchasing/orders`。
- **API / 入口**：`POST /api/v1/purchasing/orders；POST /api/v1/purchasing/orders/{id}/receipt-authorizations`。
- **前置与授权**：purchasing.order.submit / approve / receive；指定仓库。
- **主流程**：采购批准 → 原子签收货许可 → 仓库确认 → 计价暂估 → 更新履约。
- **异常 / 竞态**：并发超收、关单后许可、取消未栅栏、采购退货 / 价差丢来源。
- **最低验收**：部分收货、许可额度、库存计价及退货可对账。

<a id="uc-f29"></a>
### UC-F29 — 供应商账单、付款、部分核销和供应商账龄

- **归属 / 来源**：Finance AP、Purchasing / P3–P5；S01、S06、S10。
- **页面**：`/w/{id}/purchasing/bills、/payables`。
- **API / 入口**：`POST /api/v1/finance/bills；POST /api/v1/finance/payments`。
- **前置与授权**：finance.bill.create / post、finance.payment.record / allocate。
- **主流程**：匹配采购 / 收货 → 占账单额度 → 正式应付 → 付款核销 → 供应商账龄。
- **异常 / 竞态**：超收货开票、暂估 / 税额差异未审、重复付款、关闭期间冲回。
- **最低验收**：采购 / 收货匹配、来源幂等、暂估差异和未结项核对。

<a id="uc-f30"></a>
### UC-F30 — 库存查询、变动台账与调整

- **归属 / 来源**：Inventory / P3–P5；S01、S06、S10。
- **页面**：`/w/{id}/inventory`。
- **API / 入口**：`GET /api/v1/inventory/positions；POST /api/v1/inventory/adjustments`。
- **前置与授权**：inventory.read / adjust.approve / transfer.approve。
- **主流程**：查询流水 → 盘点差异制单 / 审批 → 原子调整 → 计价 / 对账；调拨保留在途。
- **异常 / 竞态**：负库存、未计价当零、越仓、直接覆盖余额、源出库后目标成本未知。
- **最低验收**：数量与价值可追溯，调整审批、盘点调拨和总账核对通过。

<a id="uc-f31"></a>
### UC-F31 — 银行 / 现金账户、默认账户、流水与交易作废

- **归属 / 来源**：Finance Treasury / P2–P3；S08 源码。
- **页面**：`/w/{id}/banking/accounts、/transactions`。
- **API / 入口**：`POST /api/v1/finance/bank-accounts；POST /api/v1/finance/bank-transactions`。
- **前置与授权**：finance.bank.manage / transaction.record。
- **主流程**：建账户与科目映射 → 设默认 → 登记流水 → 作废生成关联更正。
- **异常 / 竞态**：归档有未结事项、双边转账不平、跨公司账户、删除已发生资金事实。
- **最低验收**：账户科目映射、余额、默认设置及更正历史正确。

<a id="uc-f32"></a>
### UC-F32 — 银行对账单导入、映射、预览及待审核行

- **归属 / 来源**：Finance Treasury / P3–P5；S08 源码与页面。
- **页面**：`/w/{id}/banking/import`。
- **API / 入口**：`POST /api/v1/finance/bank-imports/preview；POST /api/v1/finance/bank-imports/{id}/commit`。
- **前置与授权**：finance.bank.import；目标账户 / 文件来源有效。
- **主流程**：解析编码 / 列映射 → 预览错误与重复行 → 确认 → 生成待审核行。
- **异常 / 竞态**：同文件重导、重映射复用旧预览、金额方向 / 日期错误、文件过大。
- **最低验收**：重复导入不重复记账，原始行和批次可追溯。

<a id="uc-f33"></a>
### UC-F33 — 银行对账、调整、完成、撤销与 PDF 报告

- **归属 / 来源**：Finance Treasury / P5；S08 源码。
- **页面**：`/w/{id}/banking/reconciliations`。
- **API / 入口**：`POST /api/v1/finance/bank-reconciliations/{id}/finish；POST /api/v1/finance/bank-reconciliations/{id}/undo`。
- **前置与授权**：finance.bank.reconcile / undo；独立复核。
- **主流程**：选择账期与交易 → 输入银行期末 → 调整未达 / 差异 → 完成 → 导出或受控撤销。
- **异常 / 竞态**：非零差异却完成、同交易重复对账、关闭期间撤销、原报告被覆盖。
- **最低验收**：期末差异校验、重复确认、权限和关闭期间限制通过。

<a id="uc-f34"></a>
### UC-F34 — 对账单行匹配、收付核销、费用 / 其他收入和排除

- **归属 / 来源**：Finance Treasury、AR / AP / P3–P5；S08 源码。
- **页面**：`/w/{id}/banking/review`。
- **API / 入口**：`POST /api/v1/finance/statement-lines/{id}/allocations`。
- **前置与授权**：finance.bank.match；对应 AR / AP / 费用权限。
- **主流程**：选择匹配 / 核销 / 费用收入 → 校验剩余 → 走所属用例 → 记录分配。
- **异常 / 竞态**：超行金额分配、取消后重复记账、直接写总账、排除行仍被自动消费。
- **最低验收**：同一行不被重复分配，取消匹配和重投不重复生成凭证。

<a id="uc-f35"></a>
### UC-F35 — 捐赠人、捐赠单与捐赠科目

- **归属 / 来源**：MasterData、Finance Donations / P3–P5；S01 声明、S14 源码。
- **页面**：`/w/{id}/donations`。
- **API / 入口**：`POST /api/v1/finance/donations`。
- **前置与授权**：finance.donation.manage；捐赠人 / 资金 / 科目同工作区。
- **主流程**：选择捐赠人 → 登记用途 / 方式 / 金额 → 确认收款 → 财务过账。
- **异常 / 竞态**：普通交易伪装捐赠、跨公司捐赠人、重复收入、直接改已生效金额。
- **最低验收**：捐赠、收款及总账对应，编辑 / 更正遵守单据状态。

<a id="uc-f36"></a>
### UC-F36 — 捐赠税务收据、现金 / 支票 / 卡 / 转账登记

- **归属 / 来源**：Finance Donations / P5；S01 声明。
- **页面**：`/w/{id}/donations/{id}/receipts`。
- **API / 入口**：`POST /api/v1/finance/donation-receipts；GET /api/v1/finance/donation-receipts/{id}/pdf`。
- **前置与授权**：finance.donation.receipt.issue；收据类型与资格 / 渠道满足。
- **主流程**：普通业务收据生成 / 重印；法定类型核定后经提供方签发 → 保存外部号码 / 验真引用。
- **异常 / 竞态**：无资格自造财政票据、重复打印新编号、退款不更正、付款方式登记冒充支付成功。
- **最低验收**：号码、打印、重发、更正及选定辖区模板验收；登记方式不冒充支付接入。

<a id="uc-f37"></a>
### UC-F37 — 科目 / 经营 / 财务数据导出与打印

- **归属 / 来源**：所属服务、Reporting / P5；S06、S07、S08。
- **页面**：`/w/{id}/exports`。
- **API / 入口**：`POST /api/v1/reporting/exports；GET /api/v1/reporting/exports/{id}/download`。
- **前置与授权**：reports.export；来源服务范围及下载时权限有效。
- **主流程**：固定筛选 / 水位 / 口径 → 后台导出 → 校验总额 → 下载 / 过期。
- **异常 / 竞态**：导出扩大范围、CSV 公式注入、前端金额与导出不一致、撤权后长期链接仍可用。
- **最低验收**：内容 / 金额核对，范围授权、文件下载、分页与大任务恢复可用。

<a id="uc-f38"></a>
### UC-F38 — 业务与安全审计查询

- **归属 / 来源**：各服务、Organization / P1–P5；S01 声明、S17 源码。
- **页面**：`/w/{id}/audit`。
- **API / 入口**：`GET /api/v1/organization/audit；各服务受限审计查询`。
- **前置与授权**：audit.read；可见范围与脱敏规则。
- **主流程**：按对象 / 人员 / 操作查询 → 关联业务及授权决策 → 导出受控记录。
- **异常 / 竞态**：日志含密钥或token、跨公司检索、重试重写原审计、无来源财务更正。
- **最低验收**：可按操作 / 对象追溯，敏感操作留痕，日志不泄露 token。

<a id="uc-f39"></a>
### UC-F39 — CLI 登录授权、同意 / 拒绝与令牌撤销

- **归属 / 来源**：Keycloak / BFF、业务 API / P5；S16 源码。
- **页面**：`/cli/authorize`。
- **API / 入口**：`GET /auth/cli；IdP 标准授权 / token / revoke 端点`。
- **前置与授权**：当前用户批准已登记公共客户端；受限 scope。
- **主流程**：CLI 发起 PKCE → 浏览器登录 / 选择范围 → 同意或拒绝 → 交换码 → 限定 API 使用。
- **异常 / 竞态**：任意回调、码重放、越用途 / 越公司、撤销后行为超出约定窗口。
- **最低验收**：PKCE / 回调、限定 scope / 用途、跨公司限制与撤销通过验证。

<a id="uc-f40"></a>
### UC-F40 — AI 助手流式会话、历史、取消 / 恢复与工具审批

- **归属 / 来源**：Gateway 支持模块、Organization / P5；S15 源码；外部 agent 依赖。
- **页面**：`/w/{id}/assistant`。
- **API / 入口**：`POST /api/v1/assistant/runs；POST /api/v1/assistant/executions/{id}/cancel`。
- **前置与授权**：assistant.run；会话 / 执行所属人和公司一致。
- **主流程**：创建隔离会话 → 流式执行 → 工具审批 → 取消 / 恢复 → 查询历史。
- **异常 / 竞态**：prompt 伪造权限、跨会话读取、取消只改 UI、恢复重复写财务、provider 未配置。
- **最低验收**：配置真实测试 agent 后会话隔离、取消恢复、审批与错误可验证。

<a id="uc-f41"></a>
### UC-F41 — 财务 MCP 查询与调用者权限 / 权益传递

- **归属 / 来源**：Gateway 工具适配、Finance / P5；S15 源码与文档。
- **页面**：`/w/{id}/assistant/tools`。
- **API / 入口**：`/mcp；Finance 应用授权与只读工具端口`。
- **前置与授权**：mcp.finance.read；成员 / 权限 / 模块 / 资源范围有效。
- **主流程**：恢复可信调用者 → 检查工具及参数 → 取 Finance 正式数据 → 返回有口径结果。
- **异常 / 竞态**：伪造用户头、无模块仍查账、模型生成 SQL 直连、工具错误泄露财务数据。
- **最低验收**：科目 / 试算 / 财务报表 / 总账工具不绕过授权，伪造上下文拒绝。

<a id="uc-f42"></a>
### UC-F42 — 邮件 / 安全 / 集成能力发现及外部渠道配置

- **归属 / 来源**：Organization、BFF、所属服务 / P1–P5；S03、S05、S13、S15。
- **页面**：`/w/{id}/settings/integrations`。
- **API / 入口**：`GET /api/v1/organization/capabilities；PUT /api/v1/organization/integrations/{id}`。
- **前置与授权**：organization.integration.manage；秘密只入秘密系统。
- **主流程**：显示可用 / 配置 / 授权状态 → 配置受控渠道 → 沙箱验证 → 开启模块。
- **异常 / 竞态**：有 UI 就标可用、配置者读取原始密钥、未验签渠道回调、失效能力继续发起任务。
- **最低验收**：平台邮件与自定义发件能力区分；未配置时状态准确，启用后真实联调。
