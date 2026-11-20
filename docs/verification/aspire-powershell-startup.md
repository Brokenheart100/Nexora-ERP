# Aspire：PowerShell MSIX 进程启动失败

2026-11-20，本地 Windows 启动恢复。用户从编辑器启动 AppHost 后，`identity-onboarding` 和 `dashboard` 显示 `FailedToStart`，`gateway` 等待 Dashboard。

## 原因与复现

`identity-onboarding` 执行 `scripts/p1/Configure-EmailOnboarding.ps1`。DCP 首次解析到 Microsoft Store 的 `WindowsApps\pwsh.exe` 执行别名，进程启动日志为：

```text
could not complete process start: could not assign process ... to cleanup job: Access is denied.
```

初始化任务启动失败后，Dashboard 的 `WaitForCompletion(identityOnboarding)` 失败，Gateway 继续等待 Dashboard。原始日志保留在忽略的 `artifacts/p1/runtime/startup-identity-onboarding-failed.log`。

第一次尝试指定商店版 PowerShell 7.7.0 的包内实体程序，仍然复现同一 Job 分配错误。因此本机问题涉及 MSIX 版进程启动，单独解析执行别名不足以修复。此结论来自本机复现，不代表所有 Windows / DCP 环境都会失败。

## 修复

- AppHost 支持本机配置 `Tools:PowerShellExecutable`，未配置时沿用 `pwsh`。只修改初始化任务的命令来源，保留既有服务图与用户停用旧版 Web 的设置。
- 从微软官方发布下载相同版本的 PowerShell 7.7.0 win-x64 ZIP，验证发布方 SHA256 后解压到 `%LOCALAPPDATA%\Nexora\tools\PowerShell\7.7.0`。商店版安装与全局 PATH 保留。
- 本机 User Secrets 将 `Tools:PowerShellExecutable` 指向此独立版本，机器路径不写入仓库。
- 通过指定 AppHost 的普通 `aspire stop` / `aspire start` 应用配置，保留持久卷。

发布方：[PowerShell v7.7.0](https://github.com/PowerShell/PowerShell/releases/tag/v7.7.0)。ZIP 的 SHA256 为 `7C74E03B20A75B59715847439D046A6214B1863EE79B187872980F139BB4A05F`。

已安装独立版本后可重新设置路径：

```powershell
$nexoraPwsh = Join-Path $env:LOCALAPPDATA 'Nexora/tools/PowerShell/7.7.0/pwsh.exe'
dotnet user-secrets set 'Tools:PowerShellExecutable' $nexoraPwsh --project src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 150 --non-interactive
```

若需要还原默认命令，可删除 AppHost User Secrets 的 `Tools:PowerShellExecutable`，然后正常重启指定 AppHost。切换工具版本时先验证新的实体路径。

## 验证

- ZIP 版 `pwsh` 输出版本 `7.7.0`。
- DCP 日志确认执行 `%LOCALAPPDATA%\Nexora\tools\PowerShell\7.7.0\pwsh.exe`，初始化脚本输出 `Keycloak email onboarding is configured.`，资源正常完成。
- `dashboard` 为 `Running / Healthy`，`gateway` 为 `Running / Healthy`；`aspire wait gateway` 返回成功。
- `pnpm --dir src/Web/nexora-dashboard test:e2e --grep '新版 HTTPS 跳转'`：1 项 Edge 测试通过，验证 3002 到 7444 的跳转、真实登录入口、模拟预览和可选旧入口的状态；原始结果在 `artifacts/p1/runtime/startup-pwsh-entry-test.log`。
- PostgreSQL、Redis、Keycloak 与 RabbitMQ 四个命名持久卷仍存在。
- 本轮恢复的是用户已启动的开发环境，验证后保留服务运行。原始诊断与下载包留在忽略的 `artifacts/p1/runtime/`，未修改全局执行策略。

验证边界为本机的 AppHost、初始化任务和 Dashboard 入口恢复，未重新宣称远程 CI 或生产验收。
