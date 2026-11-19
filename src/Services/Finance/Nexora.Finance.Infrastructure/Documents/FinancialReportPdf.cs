using System.Globalization;
using Nexora.Finance.Application;

namespace Nexora.Finance.Infrastructure;

public sealed partial class ChromiumInvoiceRenderer
{
    public Task<InvoicePdf> RenderAsync(FinancialReport report, CancellationToken ct) =>
        RenderAsync(FormattableString.Invariant($"{report.Kind}-{report.Period.From:yyyy-MM-dd}-{report.Period.Through:yyyy-MM-dd}.pdf"),
            font => FinancialReportHtml(report, font), ct);

    private static string FinancialReportHtml(FinancialReport report, string font)
    {
        var title = report.Kind switch
        {
            "trial-balance" => "试算平衡表",
            "profit-and-loss" => "利润表",
            "balance-sheet" => "资产负债表",
            "cash-flow" => "现金流量表",
            "equity-changes" => "权益变动表",
            _ => throw new ArgumentOutOfRangeException(nameof(report))
        };
        var trial = report.Kind == "trial-balance";
        string Amount(decimal? amount) => amount?.ToString("F" + report.MinorUnits, CultureInfo.InvariantCulture) ?? "—";
        string Row(string name, decimal amount, decimal? previous, decimal? difference, string details = "") =>
            $"<tr><td>{Encode(name)}</td>{(trial ? details : "")}<td>{Amount(amount)}</td><td>{Amount(previous)}</td><td>{Amount(difference)}</td></tr>";
        var rows = string.Concat(report.Lines.Select(x => Row($"{x.Row.Code} {x.Row.Name}".Trim(), x.Row.Amount, x.Previous, x.Difference,
            $"<td>{Amount(x.Row.Opening)}</td><td>{Amount(x.Row.Debit)}</td><td>{Amount(x.Row.Credit)}</td>")));
        var totals = string.Concat(report.Totals.Select(x => Row(TotalLabel(x.Key), x.Amount, x.Previous, x.Difference, "<td colspan=\"3\"></td>")));
        var extra = trial ? "<th>期初</th><th>本期借方</th><th>本期贷方</th>" : "";
        return $$"""
            <!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
            <style>
            @font-face { font-family: InvoiceNoto; src: url(data:font/ttf;base64,{{font}}) format('truetype'); }
            @page { size: A4; margin: 15mm } body { font: 10pt InvoiceNoto, sans-serif; color: #172534 }
            table { border-collapse: collapse; width: 100%; table-layout: fixed } th,td { padding: 6px; border-bottom: 1px solid #dde4ec; overflow-wrap: anywhere }
            th { background: #edf2f8; } td:not(:first-child) { text-align: right; } tr { break-inside: avoid; } tfoot { display: table-row-group; font-weight: bold; }
            </style></head><body>
            <h1>{{title}}</h1>
            <p>本期 {{report.Period.From:yyyy-MM-dd}} 至 {{report.Period.Through:yyyy-MM-dd}} · {{Encode(report.Currency)}} · {{(report.Basis == "cash" ? "收付实现制" : "权责发生制")}} · 过账水位 {{report.Watermark}}</p>
            <table><thead><tr><th>科目或项目</th>{{extra}}<th>本期金额</th><th>上期金额</th><th>变动</th></tr></thead>
            <tbody>{{rows}}</tbody><tfoot>{{totals}}</tfoot></table>
            </body></html>
            """;
    }

    private static string TotalLabel(string key) => key switch
    {
        "opening-net" => "期初借贷差", "period-debit" => "本期借方合计", "period-credit" => "本期贷方合计",
        "closing-net" => "期末借贷差", "income" => "收入", "expense" => "费用", "profit" => "净利润",
        "assets" => "资产", "liabilities" => "负债", "equity" => "权益", "balance-difference" => "平衡差",
        "cash-opening" => "期初现金", "operating" => "经营活动", "investing" => "投资活动", "financing" => "筹资活动",
        "unclassified" => "待分类", "cash-change" => "现金净增", "cash-closing" => "期末现金",
        "equity-opening" => "期初权益", "owner-contribution" => "业主出资", "owner-drawing" => "业主提款",
        "other-equity-adjustments" => "其他权益调整", "equity-closing" => "期末权益",
        _ => key
    };
}
