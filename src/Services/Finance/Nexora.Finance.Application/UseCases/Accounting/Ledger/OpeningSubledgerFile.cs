using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.VisualBasic.FileIO;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

internal sealed record OpeningFileRow(long Line, OpeningSubledgerKind Kind, string Reference, Guid Resource, Guid? Warehouse,
    decimal Quantity, decimal Amount, DateOnly? DueOn);

internal static class OpeningSubledgerFile
{
    public static (string Hash, OpeningFileRow[] Rows, OpeningBalanceIssue[] Errors) Read(string? file, int minorUnits)
    {
        if (string.IsNullOrWhiteSpace(file) || file.Length > ChartFileReader.MaxFileLength)
            throw new ArgumentException("请提供不超过 256 Ki 字符的期初子账 CSV。");
        var rows = new List<OpeningFileRow>();
        var errors = new List<OpeningBalanceIssue>();
        var stock = new HashSet<(Guid, Guid)>();
        var banks = new HashSet<Guid>();
        var invoices = new HashSet<(OpeningSubledgerKind, Guid, string)>();
        try
        {
            using var reader = new TextFieldParser(new StringReader(file.TrimStart('\uFEFF'))) { TrimWhiteSpace = true };
            reader.SetDelimiters(",");
            string[] header = ["Kind", "Reference", "ResourceId", "WarehouseId", "Quantity", "Amount", "DueOn"];
            if (reader.ReadFields() is not { } columns || !columns.SequenceEqual(header, StringComparer.OrdinalIgnoreCase))
                throw new ArgumentException("CSV 表头应为 Kind,Reference,ResourceId,WarehouseId,Quantity,Amount,DueOn。");
            for (var count = 0; !reader.EndOfData; count++)
            {
                if (count == 100) throw new ArgumentException("每批最多 100 条期初子账。");
                var line = reader.LineNumber;
                var values = reader.ReadFields();
                try
                {
                    var row = Parse(line, values, minorUnits);
                    var unique = row.Kind switch
                    {
                        OpeningSubledgerKind.Stock => stock.Add((row.Warehouse!.Value, row.Resource)),
                        OpeningSubledgerKind.Bank => banks.Add(row.Resource),
                        _ => invoices.Add((row.Kind, row.Resource, row.Reference.ToUpperInvariant()))
                    };
                    if (!unique) throw new ArgumentException("同一库存位置、资金账户或往来来源单号重复。");
                    rows.Add(row);
                }
                catch (ArgumentException error) { errors.Add(new(line, error.Message)); }
            }
        }
        catch (MalformedLineException error) { errors.Add(new(error.LineNumber, "CSV 引号或分隔符无效。")); }
        if (rows.Count == 0 && errors.Count == 0) errors.Add(new(null, "请至少提供一条期初子账。"));
        return (Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(file))), rows.ToArray(), errors.ToArray());
    }

    private static OpeningFileRow Parse(long line, string[]? values, int minorUnits)
    {
        if (values is not [var type, var reference, var resourceId, var warehouseId, var qty, var amount, var due])
            throw new ArgumentException("期初行应包含七列。");
        var kind = type.ToLowerInvariant() switch
        {
            "stock" => OpeningSubledgerKind.Stock,
            "receivable" => OpeningSubledgerKind.Receivable,
            "payable" => OpeningSubledgerKind.Payable,
            "bank" => OpeningSubledgerKind.Bank,
            _ => throw new ArgumentException("类型须是 stock、receivable、payable 或 bank。")
        };
        if (reference.Length is < 1 or > 60 || !Guid.TryParse(resourceId, out var id) || id == Guid.Empty)
            throw new ArgumentException("请填写来源编号及有效的资源 UUID。");
        if (!Decimal(amount, minorUnits, out var value) || value > 1_000_000_000_000m || (value == 0 && kind != OpeningSubledgerKind.Stock))
            throw new ArgumentException("填写符合本位币精度的期初金额。");
        Guid? warehouse = null;
        decimal quantity = 0;
        if (kind == OpeningSubledgerKind.Stock)
        {
            if (!Guid.TryParse(warehouseId, out var target) || target == Guid.Empty || !Decimal(qty, 6, out quantity)
                || quantity is <= 0 or > 1_000_000m) throw new ArgumentException("库存行必须填写仓库及有效数量。");
            warehouse = target;
        }
        else if (warehouseId.Length != 0 || qty.Length != 0)
            throw new ArgumentException("仓库和数量仅用于库存期初。");
        DateOnly? dueOn = null;
        if (kind is OpeningSubledgerKind.Receivable or OpeningSubledgerKind.Payable)
        {
            if (!DateOnly.TryParseExact(due, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                || date.Year is < 1900 or > 9998) throw new ArgumentException("应收应付必须保留原到期日。");
            dueOn = date;
        }
        else if (due.Length != 0) throw new ArgumentException("到期日仅用于应收应付期初。");
        return new(line, kind, reference, id, warehouse, quantity, value, dueOn);
    }

    private static bool Decimal(string text, int digits, out decimal amount) =>
        decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount)
        && amount >= 0 && Math.Round(amount, digits) == amount;
}
