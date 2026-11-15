# P6-01 发布验收汇总（草稿）

> 状态：内部核对完成；外部渠道确认与生产目标未完成，因此 **P6-01 尚未验收，不勾选**。
>
> 日期：2026-11-15。口径：AccountGo 固定基线 535c1cd 的 F01–F42，加 W4 参考增量与 W5 发布项。本文只汇总已有本地/测试证据，不把本地结果表述为生产验收。

## 1. 结论

- **F 项**：42 项中已验收 37 项；4 项未验收：F01、F26、F36、F42；F02 Google 登录按本次要求不纳入（适用项 41 项中已验收 37 项）。
- **W4 参考增量**：8/8 已验收（LNK、RCD、UPD、STS、RDY、SUBX、SESS、PWA）。
- **W5 发布**：P6-01 至 P6-06 均未验收。P6-01 内部汇总完成；P6-02 本地检查完成；P6-03 本地容量基线、P6-04 本地备份恢复、P6-05 本地迁移 / 期初 / 运维手册演练均已完成本地部分，但均因生产配置、独立用户并发 / 写命令、补投 / 重建或镜像回退缺口保持未勾选；P6-06 未开始。
- **发布结论**：当前版本可继续本地/内测，但不满足“生产发布”门槛。阻断项是 4 个未验收 F 项、外部渠道未确认，以及 P6-03/04/05 未完成生产口径、P6-06 未开始。

## 2. F01–F42 验收状态

| F 项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| F01 自助注册 / 邀请登录、邮箱六位 OTP | 未验收 | 本地端到端通过：[p1-email-onboarding.md](p1-email-onboarding.md)；外部 SMTP 实际送达待完成 |
| F02 Google 登录 | 不纳入 | 本次范围明确不纳入，见 [计划 2.2](../计划.md)；是否永久移出待产品确认 |
| F03 MFA 能力查询、挑战 / 注册与敏感操作附加验证 | 已验收 | [w2-f03-mfa.md](w2-f03-mfa.md) |
| F04 账号资料、凭据、会话 / 设备、注销 / 撤销与删除预检 | 已验收 | [w2-f04-sessions.md](w2-f04-sessions.md) |
| F05 企业工作区创建、切换与初始化向导 | 已验收 | [w2-f05-setup.md](w2-f05-setup.md) |
| F06 成员邀请、加入、停用、管理角色 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F07 业务角色、权限、数据范围、职责分离与审批政策 | 已验收 | 财务期间范围、1 / 2 位所有者审批策略与双人复核、越权矩阵：[f07-resource-scope-approvals.md](f07-resource-scope-approvals.md)；敏感策略扩展与更细粒度范围列后续增强 |
| F08 公司偏好、Logo / 品牌、日期与本位币格式 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F09 计划、订阅、模块开关、配额和权益查询 | 已验收 | [w3-f09-f10-billing.md](w3-f09-f10-billing.md) |
| F10 计费状态与客户门户 | 已验收 | [w3-f09-f10-billing.md](w3-f09-f10-billing.md)；外部 provider 列后续增强 |
| F11 个人账本创建及与企业工作区链接 / 解除 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F12 公告及按工作区能力展示 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F13 客户 / 供应商 / 捐赠人、联系人与业务资料 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F14 商品 / 服务、分类、计量单位与库存标记 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F15 税项、税率、商品税组、往来税组及单据税额 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F16 科目层级、类别、归档 / 恢复与使用限制 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F17 科目模板、结构 / 快照导出、导入预览与提交 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F18 手工 / 自动凭证、过账、总账与科目明细 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F19 会计年度、年结预览、关闭与重开 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F20 试算平衡、利润表、资产负债表、现金流量表 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F21 财务 / 经营仪表盘、收入支出与现金概览 | 已验收 | [w2-f21-dashboard.md](w2-f21-dashboard.md) |
| F22 销售报价、订单及履约依据 | 已验收 | [p4-sales-to-ledger.md](p4-sales-to-ledger.md)（销售履约与开票链路交叉核对） |
| F23 客户发票列表 / 编辑 / 详情 / 生效与更正 | 已验收 | [p4-sales-to-ledger.md](p4-sales-to-ledger.md) |
| F24 客户收款、部分核销、未结金额及客户账龄 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F25 发票 PDF、品牌模板 / 预览和受控分享链接 | 已验收 | [p4-sales-to-ledger.md](p4-sales-to-ledger.md) |
| F26 发票邮件、投递状态、重新发送 / 放弃 | 未验收 | 本机 SMTP 捕获通过：[p4-sales-to-ledger.md](p4-sales-to-ledger.md)；外部投递 / 退信 / 回执待完成 |
| F27 周期性开票计划、执行记录、日期预览和手动运行 | 已验收 | [w1-f27-downtime.md](w1-f27-downtime.md) |
| F28 采购订单、收货与供应商履约 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F29 供应商账单、付款、部分核销和供应商账龄 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F30 库存查询、变动台账与调整 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F31 银行 / 现金账户、默认账户、流水与交易作废 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F32 银行对账单导入、映射、预览及待审核行 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F33 银行对账、调整、完成、撤销与 PDF 报告 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F34 对账单行匹配、收付核销、费用 / 其他收入和排除 | 已验收 | [w1-acceptance-20261113.md](w1-acceptance-20261113.md) |
| F35 捐赠人、捐赠单与捐赠科目 | 已验收 | [p5-finance-operations.md](p5-finance-operations.md) |
| F36 捐赠税务收据、现金 / 支票 / 卡 / 转账登记 | 未验收 | 普通捐赠收款确认单通过：[p5-finance-operations.md](p5-finance-operations.md)；法定票据辖区、模板与编号规则待定 |
| F37 科目 / 经营 / 财务数据导出与打印 | 已验收 | [w2-f37-exports.md](w2-f37-exports.md) |
| F38 业务与安全审计查询 | 已验收 | [w2-f38-audit.md](w2-f38-audit.md) |
| F39 CLI 登录授权、同意 / 拒绝与令牌撤销 | 已验收 | [w3-f39-cli.md](w3-f39-cli.md) |
| F40 AI 助手流式会话、历史、取消 / 恢复与工具审批 | 已验收 | [w3-f40-assistant.md](w3-f40-assistant.md)；外部模型 provider 列后续增强 |
| F41 财务 MCP 查询与调用者权限 / 权益传递 | 已验收 | [w3-f41-mcp.md](w3-f41-mcp.md) |
| F42 邮件 / 安全 / 集成能力发现及外部渠道配置 | 未验收 | 本机能力状态已覆盖：[p5-finance-operations.md](p5-finance-operations.md)；外部渠道配置待完成 |

汇总：已验收 37 项；未验收 4 项；不纳入 1 项（F02）。

## 3. W4 参考增量

| 项 | 状态 | 证据 |
| --- | --- | --- |
| LNK 关联分录与完整性扫描 | 已验收 | [w4-lnk-journal-links.md](w4-lnk-journal-links.md) |
| RCD 通用记录变更审计链 | 已验收 | [w4-rcd-record-changes.md](w4-rcd-record-changes.md) |
| UPD 版本更新提示 | 已验收 | [w4-upd-sts.md](w4-upd-sts.md) |
| STS 更新 / 启动 / 维护状态页 | 已验收 | [w4-upd-sts.md](w4-upd-sts.md) |
| RDY 开账就绪检查 | 已验收 | [w4-rdy-readiness.md](w4-rdy-readiness.md) |
| SUBX 订阅 UX | 已验收 | [w4-subx.md](w4-subx.md) |
| SESS 自动登出最短策略 | 已验收 | [w4-sess-session-policy.md](w4-sess-session-policy.md) |
| PWA 安装 / 离线壳 / 安全区 | 已验收 | [w4-pwa.md](w4-pwa.md) |

### 3.1 P6 非生产本地演练

| 项 | 本地状态 | 证据 |
| --- | --- | --- |
| P6-03 容量与投影延迟 | 本地读路径、投影探测完成；50 并发 P95 超标且为单会话近似 | [p6-03-capacity.md](p6-03-capacity.md) |
| P6-04 备份恢复 | 8 库备份恢复通过；补投 / 投影重建 / 对账未演练 | [p6-04-backup-restore.md](p6-04-backup-restore.md) |
| P6-05 期初与迁移回退 | 手工期初、7 / 7 迁移回退通过；生产迁移 / 镜像回退未验证 | [p6-05-operations-drill.md](p6-05-operations-drill.md) |

## 4. 外部渠道与阻断项

| 依赖 | 影响项 | 当前状态 | 需要决定 / 准备 |
| --- | --- | --- | --- |
| 外部 SMTP、发件域、SPF/DKIM、退信地址 | F01、F26、F42 | 未确认；本地 Mailpit / SMTP 捕获通过 | 域名、发件服务、测试邮箱、退信与回执处理 |
| 计费 provider | F09、F10、SUBX | 未选型；当前为手工计费 | Stripe / Paddle / 国内 provider、沙箱、费率、发票要求 |
| 法定捐赠票据辖区 | F36 | 未确认 | 中国大陆公益捐赠票据资格、模板、编号与更正规则 |
| AI / MCP provider | F40、F41 | 本地 stub / 兼容端点通过，外部联调未做 | 供应商、密钥、数据合规、限流 |
| 生产目标 | P6-02、P6-06 | 未确认 | 云或自托管、域名与证书、部署方式、备份目标 |
| 远端 CI | 全部 | 未执行 | GitHub Actions 权限、secrets、分支保护 |
| Google 登录 | F02 | 不纳入 | 是否永久移出待产品确认 |

## 5. 已知限制（不影响已验收本地范围，但影响发布）

- F07 的最小验收切片（财务期间范围、1 / 2 位所有者审批、双人复核、越权矩阵）已通过；P1-07e 的敏感策略扩展与更细粒度资源范围仍列后续增强，不影响当前 F07 验收。
- 外部邮件、计费、法定票据、AI/MCP provider 均未做真实渠道联调；本地模拟 / 捕获不能替代生产验收。
- P6-03 本地容量与投影延迟基线完成，但 50 并发 P95 超标且为单会话近似；P6-04 本地 8 库备份恢复完成但补投 / 投影重建 / 对账 / RPO / RTO 未验证；P6-05 本地迁移回退与手工期初完成但生产迁移 / 镜像回退未验证；P6-06 UAT 未开始。
- 远端 CI 未运行；当前证据全部来自本地构建、单元 / 集成测试与 Playwright。
- 生产配置（TLS 终止、秘密托管、镜像扫描、最小权限）尚未按真实目标复核；本地检查见 [p6-02-local-checks.md](p6-02-local-checks.md)。

## 6. 一致性与复现

- 清单口径：本文第 2 节与 [计划 10.8](../计划.md) 的 F01–F42 勾选状态一致；W4 状态与 [差距清单 W4](../accountgo-gap-todo.md) 一致。
- 核对命令（仓库根）：

```powershell
Select-String -Path docs/计划.md -Pattern '^- \[(X| )\] F\d{2}'
Select-String -Path docs/accountgo-gap-todo.md -Pattern '^\| (RDY|SUBX|SESS|PWA|P6-)'
```

- 证据均为本地记录，复现环境与命令见各验收文档；远端 CI 与生产验收未执行。

## 7. P6-01 验收对照

| 验收条件 | 结果 |
| --- | --- |
| 汇总 F01–F42 验收证据 | 已完成（第 2 节） |
| 外部渠道状态 | 已列出，均未确认（第 4 节） |
| 未完成项与限制 | 已列出（第 1、5 节） |
| 清单与计划一致 | 内部核对通过；W4 总览表已修正，F07 已计入 37 项 |
| 每项有链接 | F 项、W4 项均有记录链接；F02 链接范围说明 |

**结论：P6-01 内部草稿完成，外部渠道确认未完成，保持未勾选。**
