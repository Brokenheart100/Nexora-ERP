# Aspire 项目级技能安装与验证

日期：2026-11-19。范围：项目内的技能安装、Codex 发现和 CLI / MCP 只读调用。

## 安装来源与位置

从 Microsoft 官方 [microsoft/aspire-skills](https://github.com/microsoft/aspire-skills/tree/e529b608336cd41c1b1262aa76d00d9e4ef1bff8/skills) 安装，固定提交为 `e529b608336cd41c1b1262aa76d00d9e4ef1bff8`。使用 Codex 自带 Skill Installer 的 `install-skill-from-github.py`，指定 `--repo microsoft/aspire-skills`、上述 `--ref`、下表对应的 `skills/<名称>` 和 `--dest .agents/skills`。

用户明确选择维护项目级副本。Aspire CLI 17 的 `aspire agent init` 主要配置插件；本次直接安装官方技能目录，保留现有 Codex MCP 配置。

| 技能 | 职责 |
| --- | --- |
| [aspire](../../.agents/skills/aspire/SKILL.md) | 工作流入口与任务路由 |
| [aspire-init](../../.agents/skills/aspire-init/SKILL.md) | 新建或首次引入 Aspire |
| [aspire-orchestration](../../.agents/skills/aspire-orchestration/SKILL.md) | 本地生命周期、等待与资源操作 |
| [aspire-monitoring](../../.agents/skills/aspire-monitoring/SKILL.md) | 日志、追踪与资源观察 |
| [aspire-deployment](../../.agents/skills/aspire-deployment/SKILL.md) | 发布、部署与环境操作 |
| [aspire-project-v2-migration](../../.agents/skills/aspire-project-v2-migration/SKILL.md) | 适用版本的 Project v2 迁移 |
| [aspire-terminals](../../.agents/skills/aspire-terminals/SKILL.md) | 终端、REPL 与终端自动化 |
| [aspireify](../../.agents/skills/aspireify/SKILL.md) | 已有 AppHost 的资源接线 |

后续更新时选择官方提交、核对本地维护内容后再替换，并重新验证发现结果与引用。技能中的新 API 应按本项目实际 SDK 版本核对；安装技能不升级 AppHost。

## 验证命令与结果

1. 检查 8 个目录及其 `SKILL.md`：名称与目录一致，均包含 `name` 和 `description` 元数据。共 59 个文件；检查 Markdown 中 84 个本地文件链接，均可解析。
2. 启动本机 `codex app-server --stdio`，完成 `initialize` / `initialized` 后发送以下请求：

   ```json
   {"id":2,"method":"skills/list","params":{"cwds":["D:\\Code\\CSharp\\Nexora ERP"],"forceReload":true}}
   ```

   返回上述 8 个技能，路径全部指向本仓库 `.agents/skills/`，`scope` 均为 `repo`，`enabled` 均为 `true`，`errors` 为空。全局已有技能仍保留；本仓库通过 `AGENTS.md` 明确使用项目副本。
3. 从仓库根目录执行 CLI 只读检查：

   ```powershell
   aspire --version
   aspire ps --format Json --non-interactive
   ```

   CLI 版本为 `17.0.0`，进程列表返回 `[]`。
4. 通过当前会话的 Aspire MCP 实际调用 `list_apphosts` 和 `search_docs`：前者正常返回当前目录范围及空 AppHost 列表；后者成功返回 Aspire 技能的官方文档结果。

## 验证边界

本次确认了文件与引用完整、Codex 可发现并启用项目技能、CLI 与 MCP 只读操作可用。新安装的技能可在下一轮对话发现和使用。

本次未启动 AppHost，未执行业务测试、部署或远程 CI；资源健康、实时日志查询和业务流程不在这次技能安装验收范围内。项目 AppHost SDK 仍为 `13.6.5`。
