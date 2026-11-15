using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Playwright;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed partial class ChromiumInvoiceRenderer(IConfiguration configuration) : IInvoiceRenderer, IReconciliationRenderer, IDonationReceiptRenderer
{
    private const string FontHash = "641F6AF1A066A146CF09A8A7DA27EB4B1037B8B98016A052EB7E4E0A57FB425B";
    private readonly SemaphoreSlim capacity = new(2);
    private string? font;

    public Task<InvoicePdf> RenderAsync(CustomerTerms invoice, bool preview, CancellationToken ct) =>
        RenderAsync(invoice.Number.Replace('/', '-') + ".pdf", font => Html(invoice, font, preview), ct);

    public Task<InvoicePdf> RenderAsync(ReconciliationView reconciliation, string account, string currency, int minorUnits, CancellationToken ct) =>
        RenderAsync($"bank-reconciliation-{reconciliation.Id:N}.pdf",
            font => ReconciliationHtml(reconciliation, account, currency, minorUnits, font), ct);

    public Task<InvoicePdf> RenderAsync(DonationReceipt receipt, CancellationToken ct) =>
        RenderAsync(receipt.Number + ".pdf", font => DonationHtml(receipt, font), ct);

    private async Task<InvoicePdf> RenderAsync(string fileName, Func<string, string> content, CancellationToken ct)
    {
        if (!await capacity.WaitAsync(TimeSpan.FromSeconds(10), ct)) throw new InvoiceRenderingUnavailableException();
        try
        {
            if (font is null)
            {
                var path = configuration["InvoicePdf:FontPath"];
                if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) throw new InvoiceRenderingUnavailableException();
                var bytes = await File.ReadAllBytesAsync(path, ct);
                if (Convert.ToHexString(SHA256.HashData(bytes)) != FontHash) throw new InvoiceRenderingUnavailableException();
                font = Convert.ToBase64String(bytes);
            }
            using var playwright = await Playwright.CreateAsync().WaitAsync(ct);
            await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true, Timeout = 15000 });
            await using var context = await browser.NewContextAsync(new() { Offline = true, JavaScriptEnabled = false, ServiceWorkers = ServiceWorkerPolicy.Block });
            var page = await context.NewPageAsync();
            page.SetDefaultTimeout(15000);
            await page.SetContentAsync(content(font), new() { WaitUntil = WaitUntilState.Load });
            var loaded = await page.EvaluateAsync<bool>("async () => (await document.fonts.load('12px InvoiceNoto')).length > 0");
            if (!loaded) throw new InvoiceRenderingUnavailableException();
            var pdf = await page.PdfAsync(new() { PreferCSSPageSize = true, PrintBackground = true }).WaitAsync(ct);
            return new(fileName, pdf);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or PlaywrightException or TimeoutException)
        {
            throw new InvoiceRenderingUnavailableException();
        }
        finally { capacity.Release(); }
    }

    private static string Html(CustomerTerms invoice, string font, bool preview)
    {
        var brand = invoice.Brand ?? throw new InvoiceRenderingUnavailableException();
        var color = ColorPattern().IsMatch(brand.AccentColor) ? brand.AccentColor : "#274580";
        var logo = brand.LogoPngBase64 is { } data && Base64Pattern().IsMatch(data)
            ? $"<img alt=\"公司标识\" src=\"data:image/png;base64,{data}\">" : "";
        var rows = string.Concat(invoice.Lines!.Select(x => $"""
            <tr><td>{Encode(x.Name)}</td><td>{Number(x.Quantity)}</td><td>{Number(x.UnitPrice)}</td>
            <td>{Money(x.Net)}</td><td>{Money(x.Tax)}</td><td>{Money(x.Net + x.Tax)}</td></tr>
            """));
        return $$"""
            <!doctype html>
            <html lang="zh-CN"><head><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">
            <style>
            @font-face { font-family: InvoiceNoto; src: url(data:font/ttf;base64,{{font}}) format('truetype'); }
            @page { size: A4; margin: 17mm; }
            body { margin: 0; font-family: InvoiceNoto; font-size: 10pt; color: #223248; }
            h1 { margin: 8mm 0 3mm; font-size: 22pt; color: {{color}}; }
            h2 { margin: 0; color: {{color}}; } img { max-width: 40mm; max-height: 16mm; }
            table { width: 100%; border-collapse: collapse; margin: 8mm 0; table-layout: auto; }
            thead { display: table-header-group; } tr { break-inside: avoid; }
            th, td { padding: 2mm; border-bottom: 1px solid #dae0ea; text-align: right; overflow-wrap: anywhere; }
            th:first-child, td:first-child { text-align: left; }
            th { background: #eef1f7; } .totals { text-align: right; break-inside: avoid; }
            </style></head><body>
            {{logo}}<h2>{{Encode(brand.BrandName)}}</h2><p>{{Encode(brand.LegalName)}}</p>
            <h1>{{(preview ? "客户发票预览" : "客户发票")}}</h1>
            <p>发票编号 {{Encode(invoice.Number)}} · 开票日期 {{Date(invoice.On)}} · 到期日期 {{Date(invoice.DueOn ?? invoice.On)}}</p>
            <p>客户 {{Encode(invoice.CustomerName)}} · 币种 {{Encode(invoice.Currency)}}</p>
            <table><thead><tr><th>项目</th><th>数量</th><th>单价</th><th>未税金额</th><th>税额</th><th>含税金额</th></tr></thead>
            <tbody>{{rows}}</tbody></table>
            <div class="totals"><p>未税金额 {{Money(invoice.Lines!.Sum(x => x.Net))}}</p>
            <p>税额 {{Money(invoice.Lines!.Sum(x => x.Tax))}}</p><strong>合计 {{Encode(invoice.Currency)}} {{Money(invoice.Total)}}</strong></div>
            </body></html>
            """;

        string Date(DateOnly value) => Encode(value.ToString(brand.DateFormat, CultureInfo.InvariantCulture));
        string Money(decimal value) => value.ToString(invoice.Currency == "JPY" ? "F0" : "F2", CultureInfo.InvariantCulture);
    }

    private static string DonationHtml(DonationReceipt receipt, string font)
    {
        var method = receipt.Method switch
        {
            "cash" => "现金", "cheque" => "支票", "card" => "银行卡", "transfer" => "银行转账", _ => "其他"
        };
        return $$"""
            <!doctype html>
            <html lang="zh-CN"><head><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
            <style>
            @font-face { font-family: InvoiceNoto; src: url(data:font/ttf;base64,{{font}}) format('truetype'); }
            @page { size: A4; margin: 18mm; }
            body { font: 11pt InvoiceNoto; color: #223248; }
            h1 { margin-bottom: 8mm; } dt { font-weight: bold; } dd { margin: 0 0 3mm; overflow-wrap: anywhere; }
            </style></head><body>
            <h1>捐赠收款确认单</h1>
            <p>普通收款凭证 · {{(receipt.ReversedById is null ? "已过账" : "已作废")}}</p>
            <dl>
            <dt>确认单编号</dt><dd>{{Encode(receipt.Number)}}</dd>
            <dt>捐赠业务单号</dt><dd>{{Encode(receipt.DonationNumber)}}</dd>
            <dt>收款日期</dt><dd>{{receipt.On.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}}</dd>
            <dt>捐赠人</dt><dd>{{Encode(receipt.Donor)}}</dd>
            <dt>收款方</dt><dd>{{Encode(receipt.Recipient ?? "历史记录未保存名称")}}</dd>
            <dt>收款方式与金额</dt><dd>{{method}} · {{Encode(receipt.Currency)}} {{receipt.Amount.ToString($"F{receipt.MinorUnits}", CultureInfo.InvariantCulture)}}</dd>
            <dt>过账凭证</dt><dd>{{receipt.JournalId}}</dd>
            <dt>关联冲销单</dt><dd>{{receipt.ReversedById?.ToString() ?? "—"}}</dd>
            </dl>
            <p>仅供收款核对，公益事业捐赠票据由符合资格的主体通过法定渠道开具。</p>
            </body></html>
            """;
    }

    private static string ReconciliationHtml(ReconciliationView reconciliation, string account, string currency, int minorUnits, string font)
    {
        var report = reconciliation.Report;
        var state = reconciliation.State == "undone" ? "已撤销" : "已完成";
        return $$"""
            <!doctype html>
            <html lang="zh-CN"><head><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
            <style>
            @font-face { font-family: InvoiceNoto; src: url(data:font/ttf;base64,{{font}}) format('truetype'); }
            @page { size: A4; margin: 17mm; }
            body { font: 10pt InvoiceNoto; color: #223248; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 2mm; border-bottom: 1px solid #dae0ea; overflow-wrap: anywhere; }
            thead { display: table-header-group; } tr { break-inside: avoid; }
            </style></head><body>
            <h1>银行对账报告</h1>
            <p>{{Encode(account)}} · {{Encode(currency)}} · {{Date(report.Through)}} · {{state}}</p>
            <p>编号 {{reconciliation.Id}} · 撤销原因 {{Encode(reconciliation.UndoReason ?? "—")}}</p>
            <table><tbody>
            {{Row("银行期末余额", report.StatementBalance)}}{{Row("账面未达净额", report.OutstandingBooks)}}
            {{Row("银行未达净额", report.OutstandingStatement)}}{{Row("调整后银行余额", report.AdjustedStatement)}}
            {{Row("账面期末余额", report.BookBalance)}}{{Row("对账差额", report.Difference)}}
            {{Row("资金流水与总账差额", report.LedgerDifference)}}
            </tbody></table>
            <h2>未达项</h2>
            <table><thead><tr><th>来源</th><th>日期</th><th>凭证或流水号</th><th>金额</th></tr></thead>
            <tbody>{{Items(report.Books, "账面")}}{{Items(report.Statement, "银行")}}</tbody></table>
            <p>匹配记录 {{report.Matches.Length}} 条</p>
            </body></html>
            """;

        string Row(string label, decimal amount) => $"<tr><th>{label}</th><td>{Money(amount)}</td></tr>";
        string Items(OutstandingBankItem[] items, string source) => string.Concat(items.Select(item =>
            $"<tr><td>{source}</td><td>{Date(item.On)}</td><td>{Encode(item.JournalId?.ToString() ?? item.Reference)}</td><td>{Money(item.Amount)}</td></tr>"));
        string Money(decimal value) => value.ToString($"F{minorUnits}", CultureInfo.InvariantCulture);
        static string Date(DateOnly value) => value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string Number(decimal value) => value.ToString("0.######", CultureInfo.InvariantCulture);
    private static string Encode(string value) => WebUtility.HtmlEncode(value);

    [GeneratedRegex("^#[0-9a-fA-F]{6}$", RegexOptions.CultureInvariant)]
    private static partial Regex ColorPattern();
    [GeneratedRegex("^[A-Za-z0-9+/]+={0,2}$", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking)]
    private static partial Regex Base64Pattern();
}
