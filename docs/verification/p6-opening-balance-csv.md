# P6-05 总账期初 CSV 导入本地验收

在「账簿设置 → 会计期间、期初与凭证 → 导入总账期初」上传或粘贴 UTF-8 CSV，表头为 `Code,Debit,Credit`。每份文件最多 200 行，每个科目占一行。预览显示逐行错误、借贷合计和有效科目，使用账簿起始日及本位币精度。提交按文件 SHA-256 与科目表版本重新校验，为该账簿创建一张待提交的期初草稿。凭证保存来源和文件摘要，通过既有的制单、独立复核与过账流程生效。

## 2026-11-17 本地验收

```powershell
pnpm --dir src/Web/nexora-web test:e2e --grep 'Opening, journal approval' --reporter=list --output '../../../artifacts/p1/runtime/opening-csv'
```

使用本地 Aspire、Keycloak OIDC / TOTP、PostgreSQL 和 Edge，1 项 Playwright 通过。测试覆盖借贷不平预览、越权拒绝、通过界面导入、文件摘要追溯、同一操作重放、重复开账拦截、独立复核过账，以及后续试算平衡和账龄报表回归。

期初库存、未结应收应付、银行现金子账及其与总账批次的勾稽见 [期初子账本地验收](p6-opening-subledger-cutover.md)。生产迁移和镜像回退记录见 [P6-05 演练](p6-05-operations-drill.md)。
