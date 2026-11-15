# P0 上下文、状态机与集成契约

> 2026-11-06，设计基线。七服务与四层约束沿用 [架构.md](../架构.md)。本文为 P0-02 的实现输入，API 与消息版本在 P1 建立可执行契约检查。

## 1. 上下文与聚合边界

| 服务 | 独立聚合示例 | 本地强一致边界 | 下游契约 |
| --- | --- | --- | --- |
| Organization | Workspace、Membership、BusinessRole、Invitation、Subscription、WorkspaceLink | 成员 / 分配 / 授权版本变更；权益事件与本地状态 | 授权查询、成员 / 权益变更 |
| MasterData | Item、BusinessPartner、UnitDefinition | 单聚合行为、编码唯一性、身份角色及停用 | 商品 / 往来版本、可引用快照 |
| Sales | Quotation、SalesOrder、FulfillmentProcess | 订单行许可占用与订单版本；已完成数量不能重写 | 预留 / 发货意图、商业依据 |
| Purchasing | PurchaseOrder、ReceiptProcess | 采购行许可额度及状态 | 收货意图、商业匹配依据 |
| Inventory | StockPosition、Reservation、GoodsReceipt、GoodsIssue、CostPool、TransferOrder | 同池余额 / 预留 / 执行 / 流水序列；同库多位置操作固定锁顺序 | 收发事实、成本与调整事实 |
| Finance | Journal、FiscalPeriod、OpenItem、Payment、Settlement、BankReconciliation、InvoiceSchedule、Donation | 期间 / 过账门禁、来源开票额度、核销 / 未结项、来源唯一键 | 财务结果、过账 / 更正、投递状态 |
| Reporting | ProjectionCheckpoint、ExportJob | 投影更新 / 消费检查点；导出范围与状态 | 带水位的视图与文件 |

Finance 内部以 GL、AR、AP、Treasury、Tax、Donations 模块隔离模型；Organization 内以身份映射、治理 / 权限、权益 / 计费、平台记录隔离。模块不会直接修改对方表，必要协调通过应用接口并明确本地事务边界。

查询模型可以组合本服务表；跨服务只能通过 API、消息和导出快照。主数据实体不共享程序集，下游只记录 ID / 版本及业务快照。BFF 不接管订单、库存和账簿事务。

## 2. 状态机

| 对象 | 主路径 | 拒绝 / 终态规则 |
| --- | --- | --- |
| Invitation | Pending → Accepted / Expired / Revoked | 过期或撤销不可兑换；重复兑换返回原结果或明确冲突 |
| Membership | Invited → Active → Suspended / Removed | 每次变更递增授权版本；重新加入生成受控新授权，不复用旧邀请 |
| SalesOrder | Draft → Submitted → Approved → Fulfilling → Fulfilled → Closed | Cancelled 只关闭未执行额度；已发货走退货 |
| PurchaseOrder | Draft → Submitted → Approved → Receiving → Received → Closed | 关闭后不再签许可；超收默认拒绝 |
| ExecutionPermit | Issued → Executing → Completed；Issued / 部分执行 → Cancelling → Cancelled | 取消栅栏在执行方持久化；只能释放未执行数量 |
| Reservation | Requested → Reserved → Consumed / Released / Expired | 消耗、释放、过期互斥；晚到超时消息核对版本 |
| StockDocument | Draft → Approved → Confirmed | Confirmed 不可覆盖；更正使用引用原单的新单据 |
| CostFact | Pending → Costed / NeedsAttention | 单成本池顺序，缺口阻塞；不以零成本冒充成功 |
| FinancialDocument | Draft → Submitted → Approved → Posted → Reversed / Adjusted | 开票、收入、收付款状态分别记录，不合并成单一大枚举 |
| Settlement | Proposed → Applied → Reversed | 应用时原子校验两侧剩余；冲回不删除历史 |
| FiscalPeriod | Open → Closing → Closed；Closed → Reopening → Open | 关账门禁检查版本与水位；重开需要权限与原因 |
| BankImport | Uploaded → Validated → Committed / Rejected | 预览令牌绑定文件摘要、映射、账号、工作区与版本 |
| Reconciliation | Draft → Reviewed → Completed → Undone | 完成差异校验；撤销保留原记录及后续影响 |
| RecurringSchedule | Draft → Active ↔ Paused → Retired | 日程不是发票；每次到期创建唯一 occurrence |
| Occurrence | Due → Accepted → Invoiced / NeedsAttention | 人工和定时共用业务唯一键；不能重复开票 |
| EmailDispatch | Pending → Sending → Sent / Unknown / Failed / Abandoned | Unknown 先查询渠道状态；重发是可审计的新操作或同意图重试 |
| DonationReceipt | Draft → Issued → Corrected / Voided | 重印不新编号；法定类型需先验证工作区资格 / 渠道 |
| Subscription | Pending → Active → PastDue / Suspended / Cancelled | 以已验证 provider 事实为准，不以回跳 URL 提权 |

“NeedsAttention”“Unknown”均要有工作台入口、原因码、下一步和原始关联号。未知结果不能自动视作失败并重复执行不可逆动作。

## 3. 集成信封与字段

事件 / 定向命令均包含 MessageId、SchemaVersion、Type、TenantId、CompanyId、OccurredAtUtc、CorrelationId、CausationId、SourceService、业务操作 ID 和 W3C trace context。数量、金额和汇率按十进制字符串传递；各 payload 标明单位、币种、业务日期、来源行及快照版本。

AggregateVersion 用于并发语义；需要连续交付检查的业务流另有 StreamKey / StreamSequence。并非每次聚合修改都产生所有订阅者可见的事件，二者不能混用。来源消息、业务来源事实和 API 幂等键分别去重。

| 契约 v1 | 生产者 → 接收者 | 最低 payload / 幂等边界 |
| --- | --- | --- |
| membership.changed | Organization → 各服务 | UserId、Status、AuthorizationVersion、有效范围；不携带永久授权口令 |
| entitlements.changed | Organization → 各服务 | 工作区、权益版本、模块 / 配额、有效期 |
| item.changed / partner.changed | MasterData → 业务服务 | ID、版本、停用状态、引用快照 |
| inventory.reserve-requested | Sales → Inventory | Order / Line / PermitId、操作号、数量 / 单位、期限 |
| inventory.reservation-result | Inventory → Sales | 操作号、预留明细、状态、拒绝原因 |
| inventory.receipt-authorized | Purchasing → Inventory | 收货许可、来源行、数量上限、采购价格快照 |
| inventory.issue-authorized | Sales → Inventory | 发货许可、预留引用、数量上限 |
| inventory.cancel-permit | 订单所有者 → Inventory | PermitId、取消操作号、期望版本 |
| inventory.permit-cancelled | Inventory → 订单所有者 | 终态版本、已执行量、可释放量、栅栏引用 |
| inventory.receipt-confirmed / issue-confirmed | Inventory → 订单所有者、Finance | 来源行、许可、执行号、数量流序列、业务日期 |
| inventory.receipt-costed / issue-costed | Inventory → Finance | CostFactId、原数量事实、成本池序列、确定金额、币种、政策版本 |
| inventory.value-adjusted | Inventory → Finance | 新调整事实 ID、原事实引用、价值变化及原因 |
| finance.document-posted / rejected | Finance → 来源服务、Reporting | 来源业务键、财务单据号、状态、原因及会计日期 |
| finance.payment-confirmed / settlement-applied | Finance → Reporting | 资金 / 核销号、对象、金额、未结结果、会计日期 |
| finance.invoice-occurrence-due | Finance 调度 → Finance AR | ScheduleId、应执行业务日期、模板版本；唯一键含工作区 |
| finance.email-requested / delivery-reported | Finance → Worker → Finance | DispatchId、用途 / 版本、收件快照、provider 引用 / 状态 |
| projection.snapshot-exported | 源服务 → Reporting | SnapshotId、截止游标、校验总数 / 金额、增量窗口 |

契约名称为 P0 语义，不等于已发布 NuGet 类型。P1 明确命名空间和 schema，兼容变更增加可选字段，破坏性变更发新版本。禁止在事件中塞入持久有效用户 access token、密码、支付密钥或整个可变领域实体。

## 4. 事务与恢复协议

1. 每服务同库业务状态、审计和 Wolverine Outbox 共同提交。框架 durable inbox 接收与业务执行是不同故障边界。
2. 聚合仓储与适配处理器共享同一个 scoped 写 DbContext；事务生成链必须显示该上下文。跨服务不使用数据库事务。
3. 源订单先占用许可，Inventory 决定执行和取消的唯一终态，订单收到确认后才释放剩余额度。
4. Finance 的开票来源额度、核销余额、期间门禁在本地事务校验；异步报表投影不参与额度裁决。
5. 重启后从已接受事实继续；已发货 / 过账使用新更正事实，不能依赖技术补偿抹去历史。
6. 关账及恢复按截止水位、版本和对账结论开放写入口；恢复到不同时间点的数据库必须先补投与对账。

P0 状态机与契约覆盖设计完成，P1 / 业务阶段仍须真实数据库 / broker 验证竞态，不能将本文当作运行时保证。
