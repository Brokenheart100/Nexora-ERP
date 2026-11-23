# Dashboard D9 定期开票、编号与交付

2026-11-21。接入使用原 `nexora-dashboard` 的销售页面。真实浏览器用例在独立测试工作区开账，使用 Alice 制单和 Bob 独立复核，邮件由独立的本地 Mailpit 接收。

## 页面入口

| 操作 | Dashboard 入口 |
| --- | --- |
| 新建或编辑计划，暂停、恢复、执行与跳过 | 销售 → 定期开票。计划详情显示下次执行时刻、未来日期和执行历史，可从历史打开已生成的发票 |
| 设置编号，预览候选号 | 销售 → 发票交付 → 编号规则。复核人从发票详情获取当前候选号，确认后过账 |
| 预览、下载和分享 PDF | 销售 → 发票交付 → 样张与分享，也可从发票详情进入。复核人可创建和撤销已过账发票的分享链接 |
| 寄送和处置投递记录 | 销售 → 发票交付 → 寄送记录。选择已过账发票和客户档案中的联系人邮箱 |

销售页面通过新版同源 BFF 读取计划、编号和发票。定期执行时刻由 Finance 按计划时区计算并返回 `nextAtUtc`。分享时由当前 Dashboard 入口生成 `/invoice-share#token=…`，页面读取后清理地址中的片段。匿名 PDF 请求由 Nitro 转发到固定的 Gateway 公开路径。分享列表和幂等重放只返回记录信息，首次创建回执提供明文令牌。

## Aspire 本地端到端

真实浏览器用例 1 项通过，包含以下场景。

| 场景 | 实测结果 |
| --- | --- |
| 定期开票 | 月末预览从 1 月 31 日到 2 月 28 日再到 3 月 31 日，详情显示服务端返回的 UTC 执行时刻。编辑同一到期日后，旧版本修改和跳过均被拒绝。跳过写入历史且发票 ID 为空，手动执行已跳过的日期也不生成发票。暂停后无执行时刻，恢复后可手动运行，执行历史可打开同一张发票。Finance 重启后用新操作键重跑同一到期日，仍返回原发票 ID。再次修改计划后，历史只保留一笔该日记录及原执行版本。 |
| 编号与过账 | 新启用的规则从 `D9-2026-0101` 开始。对同一个候选号并发复核两张发票，只有一张先过账。另一张仍待复核，刷新候选号后用 `D9-2026-0102` 过账。已关闭的 2026 年 2 月拒绝过账，发票版本和候选号均无变化。启用规则前过账的发票保留原号。 |
| PDF 与分享 | 未登录访问受保护 PDF 返回 401，待复核发票只允许制单人或复核人预览，已过账发票可下载。匿名会话通过 Dashboard 的 `/public/invoice-pdf` 下载实际 PDF，确认附件响应、`application/pdf`、文件签名、`no-store` 及 `no-referrer`。分享链接撤销及实际到期后均返回无效，列表和重放保持脱敏。页面清理链接片段，浏览器控制台未记录令牌。 |
| 发票邮件 | 本地渠道返回 `local-only`。提交返回 201，按 `Location` 回读任务。Mailpit 的 451 拒绝进入明确失败，恢复后重试沿用原 ID 并将尝试次数增至 2。另一笔明确失败通过原记录放弃。暂停 Mailpit 使 SMTP 没有确认，记录进入结果未知并只提供重寄或放弃。重寄建立新 ID，保留与原任务的双向关联。收件箱实际捕获初发、重试及重寄共三封邮件，每封含一份 PDF。 |

Finance 重启验证使用已经执行过的到期日。停机跨过待执行时刻的演练见 [F27 停机恢复记录](w1-f27-downtime.md)。

## MSW 与构建

| 检查 | 实测结果 |
| --- | --- |
| D9 浏览器模拟 | 4 项通过。覆盖定期计划待处理原因与原日期回读、服务端候选号、分享令牌脱敏和撤销、邮件失败重试与未知结果恢复。 |
| D5 浏览器回归 | 1 项通过。两次分批发货后开票，核销 500.00 元，未结仍为 630.00 元。首次合并运行发生页面导航超时，单独复跑通过。 |
| D8 浏览器回归 | 4 项通过。覆盖 CSV 导入、对账、付款作废和捐赠收据投递。 |
| 静态与单元检查 | Nuxt 类型检查与 169 项前端单测通过。6 项 `P4SalesTests` Release 用例通过。 |
| 生产构建 | mock 和 live 的 Nuxt Node 构建均通过。 |

## 复现命令

从仓库根目录运行。按 [D0 本地环境](dashboard-d0-baseline.md) 准备 Alice、Bob、开发证书与浏览器登录。先使用 AppHost 的固定镜像准备仅监听回环地址的独立 Mailpit，再启动验证用 AppHost。以下命令使用已拉取的镜像 ID，HTTP 和 SMTP 端口由 Docker 分配。

```powershell
$nexoraD9Host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
$nexoraD9Mail = 'nexora-d9-mailpit-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$nexoraD9Image = 'sha256:aef2aacc11f075ec0fb6874275ee4a421e688e11a96ebb296134d1735c7761ce'
docker run --rm --detach --name $nexoraD9Mail -p '127.0.0.1::1025' -p '127.0.0.1::8025' -e MP_ENABLE_CHAOS=true $nexoraD9Image
$env:InvoiceMail__Host = '127.0.0.1'
$env:InvoiceMail__Port = (docker port $nexoraD9Mail 1025/tcp).Split(':')[-1]
$env:InvoiceMail__From = 'noreply@nexora.invalid'
$env:InvoiceMail__StartTls = 'false'
$env:NEXORA_D9_MAILPIT_NAME = $nexoraD9Mail
$env:NEXORA_D9_MAILPIT_URL = 'http://' + (docker port $nexoraD9Mail 8025/tcp)
$env:NEXORA_D9_RESTART = '1'
aspire start --apphost $nexoraD9Host --non-interactive
aspire wait gateway --apphost $nexoraD9Host --timeout 120 --non-interactive
$nexoraD9Dashboard = aspire describe dashboard --apphost $nexoraD9Host --format json --non-interactive | ConvertFrom-Json
$env:NODE_EXTRA_CA_CERTS = $nexoraD9Dashboard.resources[0].environment.NODE_EXTRA_CA_CERTS
pnpm --dir src/Web/nexora-dashboard test:e2e e2e/d9-invoicing-ui.spec.ts
aspire stop --apphost $nexoraD9Host --non-interactive
docker stop $nexoraD9Mail
```

`NEXORA_D9_RESTART=1` 使真实用例重启本地 Finance 后重放已执行的日期。邮件子项读取到 `local-only` 才开始提交，使用本轮专用 `example.invalid` 地址。故障验证临时拒绝 SMTP 收件人并恢复原响应设置，随后暂停并恢复独立 Mailpit。AppHost 自带的 Mailpit 继续用于测试身份的邮箱验证码。

```powershell
pnpm --dir src/Web/nexora-dashboard test:msw e2e/d9-invoicing.msw.spec.ts e2e/d5-fulfillment.msw.spec.ts e2e/d8-treasury.msw.spec.ts
pnpm --dir src/Web/nexora-dashboard test:unit
pnpm --dir src/Web/nexora-dashboard typecheck
dotnet test tests/Nexora.Tests -c Release --no-restore --filter 'FullyQualifiedName~P4SalesTests'
$env:NUXT_PUBLIC_DATA_MODE = 'mock'
pnpm --dir src/Web/nexora-dashboard build
$env:NUXT_PUBLIC_DATA_MODE = 'live'
pnpm --dir src/Web/nexora-dashboard build
```

本次 Playwright 结果归档在 `artifacts/p1/runtime/` 的 `dashboard-d9-live-results.json`、`dashboard-d9-msw-results.json` 和 `dashboard-d9-d5-rerun-results.json`。D9 用例关闭跟踪、截图和录屏，避免将分享链接写入诊断制品。外部 SMTP 通道的交付与远程 CI 有独立的验收范围。
