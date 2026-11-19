# P1 Finance 消费者停机恢复验证

```powershell
$env:NEXORA_TEST_P3_RECOVERY = 'consumer'
pnpm --dir src/Web/nexora-web test:e2e --grep 'Purchase orders require' --reporter=list
```

2026-11-17 本地 Aspire 验证通过。先停止 Finance 消费者，库存通过正常收货入口提交单据，恢复 Finance 后等待就绪并核对收货处理、库存价值、应付和总账。相同收货操作重放返回原结果。该演练使用 Aspire 资源停止与启动，待验收包括消息已落 Inbox 后的进程崩溃、多节点重新接管和受控死信重放。
