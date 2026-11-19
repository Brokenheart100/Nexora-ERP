# Nexora ERP Dashboard UI 原型 TODO

在 `src/Web/nexora-dashboard/` 用官方 Nuxt UI Dashboard 模板新建独立的 UI 原型，保留原项目 `src/Web/nexora-web/`。原型以 Carbon 为视觉参考，用本地模拟数据填充页面，打开预览直接进入工作台。你确认界面满意后，再另开后端接入阶段。[官方 Dashboard 模板](https://github.com/nuxt-ui-templates/dashboard)

## 1. 从模板创建独立预览

- [x] 在 `src/Web/` 下生成 `nexora-dashboard`。新项目维护自己的 `package.json` 和 `pnpm-lock.yaml`，保留模板的 MIT 版权及许可声明。[Nuxt 创建命令](https://nuxt.com/docs/4.x/api/commands/init) · [模板许可证](https://github.com/nuxt-ui-templates/dashboard/blob/main/LICENSE)
- [x] 采用仓库的 Node 和 pnpm 基线，使用 Nuxt 4、Vue 3、TypeScript strict、Nuxt UI 4 和 Tailwind 4。配置 `dev`、`typecheck`、`lint` 和 `build`，用 `http://localhost:3001/` 预览。[依赖基线](docs/依赖.md) · [Nuxt 开发命令](https://nuxt.com/docs/4.x/api/commands/dev)
- [x] 用 ERP 页面替换模板的收件箱、客户及演示设置，清理模板模拟接口、示例通知和闲置依赖。保留 `UApp` 与 Dashboard 布局，确认首页和静态资源能独立加载。

```powershell
pnpm create nuxt@latest src/Web/nexora-dashboard --template ui/dashboard --packageManager pnpm --no-install --no-gitInit
pnpm --dir src/Web/nexora-dashboard install
pnpm --dir src/Web/nexora-dashboard dev --port 3001
```

## 2. 做出 Carbon 风格的界面

**组件选型优先使用 Nuxt UI 自带组件。** 复用官方 Dashboard 模板中的布局与交互，用主题和插槽适配 Carbon 风格。遇到现有组件覆盖不了的需求，再评估第三方组件或自定义实现。

- [x] 复用 `UDashboardGroup`、`UDashboardSidebar`、`UDashboardPanel`、`UDashboardNavbar` 和 `UNavigationMenu`。模块入口集中在左栏，顶栏只放当前页面和常用操作。移动端用模板的侧栏抽屉。[Carbon 顶栏](https://www.carbondesignsystem.com/building-blocks/core/patterns/global-header)
- [x] 用 Nuxt UI 语义变量与 `app.config.ts` 统一紧凑顶栏、浅灰背景、白色内容层、细边框、品牌蓝和小圆角，同时检查暗色和键盘焦点。[Nuxt UI 主题变量](https://ui.nuxt.com/docs/getting-started/theme/css-variables) · [Carbon 颜色与层级](https://www.carbondesignsystem.com/building-blocks/foundations/color/guidelines)
- [x] 用 `UTable`、`UFormField`、`USlideover` 和 `UDropdownMenu` 实现列表与编辑界面。首屏露出表头和数据，筛选与主要操作放在同一工具栏，低频操作收进菜单。金额右对齐，状态同时有文字和颜色。[Carbon 数据表格](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)

## 3. 用模拟数据跑通三种页面

- [x] 在新项目的 `app/mocks/` 放前端直接导入的 TypeScript 样例，包括工作区、商品和采购单。用同一组名称、单号和金额填充首页与详情，覆盖长名称、空结果及常见状态。
- [x] **工作台。** 默认选中一个示例工作区，展示少量能点开的待办和最近单据。复用模板里的 `UChart` 展示模拟月度采购额趋势。切换示例工作区时更新列表和图表。[UChart 文档](https://ui.nuxt.com/docs/components/chart)
- [x] **商品目录。** 验证搜索、状态筛选、分页和编辑抽屉。保存编辑后立即更新本次预览的列表，刷新恢复初始样例。
- [x] **采购订单。** 从列表打开详情，展示供应商、订单状态、商品明细和金额，验证返回列表及长表在窄屏下的展示。

## 4. 预览与确认

- [x] 只启动新版前端，验证能直接打开工作台，商品筛选和编辑、采购详情及返回都能用模拟数据操作。
- [x] 在桌面和手机检查首屏密度、折叠导航、表格滚动、明暗主题及键盘焦点，提供可点击的本地预览和代表页面截图。
- [ ] 根据你的反馈调整布局和交互。你确认 UI 满意后，再制定后端接入清单（已改为纯 UI 扩展清单，见 §5；真实后端接入另行规划）。

在仓库根目录执行新版的静态检查和构建。

```powershell
$nexoraDashboard = 'src/Web/nexora-dashboard'
pnpm --dir $nexoraDashboard install --frozen-lockfile
pnpm --dir $nexoraDashboard typecheck
pnpm --dir $nexoraDashboard lint
pnpm --dir $nexoraDashboard build
```

## 5. 按后端能力扩展 UI（纯 UI 阶段，模拟数据）

- [x] 依据现有后端能力制定前端 UI 扩展清单：[后端能力对照的 UI TODO](docs/ui-dashboard-backend-todolist.md)（2026-11-17）。
- [x] 按确认的优先级分批实施 B0–B10（纯 UI、模拟数据）；实现清单与状态见 [后端能力对照的 UI TODO](docs/ui-dashboard-backend-todolist.md)，验收见 [原型验收记录](docs/verification/web-ui-dashboard-prototype.md)；真实后端接入另行规划。
