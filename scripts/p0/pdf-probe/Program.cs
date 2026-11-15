using System.Text.Json;
using Microsoft.Playwright;

if (args.Length != 2) throw new ArgumentException("Expected font file and output PDF path.");
var font = Convert.ToBase64String(File.ReadAllBytes(args[0]));
var html = $$"""
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
@font-face { font-family: ProbeNoto; src: url(data:font/ttf;base64,{{font}}) format('truetype'); font-weight: 400; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; color: #192c41; font-family: ProbeNoto; font-size: 11pt; }
.page { width: 210mm; height: 297mm; padding: 17mm; position: relative; break-after: page; }
.page:last-child { break-after: auto; }
.brand { color: #166f6f; font-size: 9pt; letter-spacing: 2px; }
h1 { font-size: 24pt; font-weight: 500; margin: 9mm 0 3mm; }
h2 { font-size: 15pt; font-weight: 500; }
.notice { color: #166f6f; margin: 0 0 7mm; }
.rule { border-top: 1px solid #d7e1e8; }
.details { line-height: 2.1; margin: 8mm 0; }
table { border-collapse: collapse; width: 100%; }
th { background: #eef5f7; font-weight: 500; }
th, td { text-align: left; padding: 4mm 3mm; border-bottom: 1px solid #d7e1e8; }
.totals { margin: 8mm 0 10mm auto; width: 95mm; line-height: 2.4; }
.totals div { display: flex; justify-content: space-between; gap: 6mm; }
.grand { color: #166f6f; font-size: 16pt; border-top: 1px solid #d7e1e8; margin-top: 3mm; }
.note { line-height: 1.8; }
.muted { color: #576675; font-size: 9pt; }
.footer { position: absolute; bottom: 16mm; left: 17mm; right: 17mm; border-top: 1px solid #d7e1e8; padding-top: 5mm; display: flex; justify-content: space-between; font-size: 8pt; color: #576675; }
li { margin: 5mm 0; }
</style></head><body>
<section class="page">
  <div class="brand">NEXORA / P0</div>
  <h1>销售单据 · 中文渲染样例</h1>
  <p class="notice">仅研发样例，非税务发票</p><div class="rule"></div>
  <div class="details">验证账簿：中国大陆 / CNY<br>单据：DEMO-20261106-001<br>客户：示例商贸有限公司<br><span class="muted">日期：2026-11-06 / Asia/Shanghai</span></div>
  <table><thead><tr><th>商品 / 服务</th><th>数量</th><th>不含税单价</th><th>折扣</th></tr></thead>
  <tbody><tr><td>商贸商品 A（研发示例）</td><td>3</td><td>100.00</td><td>10%</td></tr></tbody></table>
  <div class="totals"><div><span>不含税金额</span><span>CNY 270.00</span></div><div><span>税额（算例输入 13%）</span><span>CNY 35.10</span></div><div class="grand"><span>价税合计</span><span>¥305.10</span></div></div>
  <p class="note">说明：本页仅验证中文字体、人民币符号、金额和长文本换行。税率为研发算例输入，真实企业税目、纳税人类别及会计政策需另行核定。</p>
  <p class="muted">舍入验证：0.005 → 0.01；-0.005 → -0.01</p>
  <div class="footer"><span>Noto Sans SC / OFL-1.1 / Chromium</span><span>第 1 / 2 页</span></div>
</section>
<section class="page">
  <div class="brand">NEXORA / P0</div><h1>业务收据 · 分页验证</h1>
  <p class="notice">仅研发样例，非税务发票</p><div class="rule"></div>
  <div class="details"><h2>收到示例款项：CNY 200.00</h2>范围：普通业务收据技术样例</div>
  <p class="note">本页用于验证独立分页和重复页眉页脚。该样例不构成财政票据，不生成法定票据号码。真实捐赠票据必须确认主体资格、辖区规则和财政票据渠道后实施。</p>
  <h2 style="margin-top: 12mm">导出检查</h2><ol><li>中文可检索，字体随 PDF 嵌入。</li><li>金额、负数、人民币符号与日期可读。</li><li>A4 页面、换行与页码在渲染图中复核。</li></ol>
  <p class="muted" style="margin-top: 14mm">边界：本次仅验证 Windows；Linux 容器与实机打印待验。</p>
  <div class="footer"><span>Noto Sans SC / OFL-1.1 / Chromium</span><span>第 2 / 2 页</span></div>
</section></body></html>
""";

using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
await using var context = await browser.NewContextAsync(new() { JavaScriptEnabled = false });
// This probe uses trusted literal HTML and an embedded font. Production workers
// also need container egress restrictions; interception alone is not isolation.
await context.RouteAsync("**/*", route => route.AbortAsync());
var page = await context.NewPageAsync();
await page.SetContentAsync(html, new() { WaitUntil = WaitUntilState.Load });
await page.EvaluateAsync("document.fonts.ready");
if (!await page.EvaluateAsync<bool>("document.fonts.check('12px ProbeNoto')"))
    throw new InvalidOperationException("Pinned font was not loaded.");
await page.PdfAsync(new() { Path = args[1], Format = "A4", PrintBackground = true, PreferCSSPageSize = true });
Console.WriteLine(JsonSerializer.Serialize(new { browserVersion = browser.Version, playwrightVersion = typeof(Playwright).Assembly.GetName().Version?.ToString(), outboundRequests = "aborted", javascript = "disabled", pages = "validated by Python" }));
