# 2026-11-13 F05 工作区创建、切换与初始化向导验收

## 范围

- 对应 docs/accountgo-gap-todo.md 的 W2 F05，以及 docs/计划.md 第 2.2 节 F05 与第 10.8 节 F05。
- 验收用户结果：企业工作区创建后进入初始化向导；向导覆盖公司资料、会计年度与开账、科目模板、税制（可选）四步；可「稍后继续」，再次打开时从首个未完成步骤恢复；进度由服务端状态推导，不依赖浏览器本地标记。

## 实现摘要

- 新增前端模块与页面：
  - `app/utils/workspaceSetup.ts`：`SetupSnapshot`（settingsVersion、bookInitialized、taxConfigured）、`setupSteps`、`setupComplete`、`resumeStepIndex`。
  - `app/components/WorkspaceSetup.vue`：四步 stepper（`aria-current`）。第 1 步公司资料（法定名称、品牌名称、品牌色、日期格式、时区；本位币与国家只读）；第 2 步会计年度与开账（开账日期、会计年度起始月）；第 3 步科目模板（按类别汇总起始科目）；第 4 步税制（可选，一键补齐标准增值税税率与标准税率组）。页脚提供「上一步 / 稍后继续 / 下一步 / 完成初始化」。
  - `app/pages/companies/[workspaceId]/setup.vue`：向导页，展示工作区名称、本位币、国家/地区及返回工作台链接。
  - `test/setup-wizard.test.ts`：`setupSteps`、`setupComplete`、`resumeStepIndex` 单元测试 3 项。
- 修改：
  - `app/pages/index.vue`：创建工作区成功后（企业工作区）跳转 `/companies/{id}/setup`；读取 `?workspace=` 恢复选中；概览栏新增「初始化向导」入口。
  - `e2e/workspace.spec.ts`：创建流程改为先断言向导并点「稍后继续」；文件末尾新增向导端到端用例。
- 后端契约未改，向导只编排既有 API：`GET/PUT /api/workspaces/{id}/settings`（`CompanySettingsView` / `ReviseCompanySettingsRequest`，PUT 需 Manage 权限并校验版本）、`GET/POST /api/finance/workspaces/{id}/book`（`InitializeBookRequest`，初始化生成标准科目模板）、`GET /api/finance/workspaces/{id}/tax`、`POST /tax/rates`、`POST /tax/groups`。写操作经 `useWorkspaceMutation` 自动附加 operationId 与 `X-CSRF-TOKEN`。
- 本位币与国家在创建工作区时确定（`Workspace.Open` 固定 CN / CNY），向导只读展示，本项不扩展创建契约。
- 账簿初始化成功后刷新税务能力：账簿未初始化时 `GET /tax` 返回 404，初始化后税制步骤才可操作。

## 环境与复现

```powershell
aspire start --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
aspire wait gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --timeout 180 --non-interactive
pnpm --dir src/Web/nexora-web exec playwright test e2e/workspace.spec.ts -g 'OIDC + TOTP|setup wizard' --reporter=line
pnpm --dir src/Web/nexora-web typecheck
pnpm --dir src/Web/nexora-web lint
pnpm --dir src/Web/nexora-web test:unit
pnpm --dir src/Web/nexora-web build
aspire stop --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --non-interactive
```

注意：修改 `app/` 下的页面或组件后需重启 AppHost 才会生效；本地 Nuxt dev 未热更新这些源码（本次排查中旧 bundle 曾造成「创建后未跳转」「税制按钮禁用」的假象）。

## 验收断言

| 断言 | 结果 | 证据 |
| --- | --- | --- |
| 创建工作区后进入 `/companies/{id}/setup`，显示初始化向导与公司名 | 通过 | `artifacts/w2/f05-focused-e2e.log` |
| 第 1 步保存公司资料（PUT settings，版本 0 到 1）并提示 | 通过 | 同上 |
| 第 2 步初始化账簿（开账日期、会计年度起始月），生成起始科目并提示 | 通过 | 同上 |
| 第 3 步显示科目构成与起始科目 | 通过 | 同上 |
| 第 4 步补齐标准税率（VAT13 / VAT09 / VAT06 / VAT00）与标准税率组，页面显示 VAT13 | 通过 | 同上 |
| 完成初始化回到工作台并选中该工作区（`?workspace={id}`） | 通过 | 同上 |
| 稍后继续后再次进入仍停留在第 1 步，账簿未初始化（`book.settings` 为 null） | 通过 | 同上 |
| 完整 workspace 回归套件 17 用例通过（9.3m） | 通过 | `artifacts/w2/f05-workspace-suite.log` |

静态检查：`pnpm typecheck` 通过（仅既有 vue-router / volar 插件警告）；`pnpm lint` 0 error（17 条既有 first-attribute-linebreak 警告）；`pnpm test:unit` 3 个文件 14 个用例通过；`pnpm build` 通过（18.9s，Σ 3.74 MB）。

## 边界与后续增强

- 科目模板仅使用账簿初始化自动生成的起始科目；自定义模板与科目导入仍由财务模块承担。
- 税制步骤只提供中国大陆标准增值税税率与标准税率组；辖区差异与税码分类维护仍由税务模块承担。
- 向导未包含成员邀请与角色配置（属 F08 / F11 范围），创建者可在完成后从团队页邀请。
- 「稍后继续」不写本地标记：进度完全由服务端状态推导，清除浏览器数据后仍可恢复；账簿已初始化后重复进入会展示已有设置。
- 会计年度关账仍由 Finance 年度模块执行，向导只配置开账日期与起始月。