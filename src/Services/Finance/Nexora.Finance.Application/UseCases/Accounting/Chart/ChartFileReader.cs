using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.VisualBasic.FileIO;

namespace Nexora.Finance.Application;

public static class ChartFileReader
{
    public const int MaxFileLength = 256 * 1024;
    public const int MaxAccounts = 1000;
    private static readonly JsonSerializerOptions StrictJson = new(JsonSerializerDefaults.Web)
    {
        MaxDepth = 12, UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };
    private sealed record StructureFile(string Format, string? Template, AccountInput?[]? Accounts);

    public static ParsedChart Read(string format, string? file)
    {
        if (string.IsNullOrWhiteSpace(file) || file.Length > MaxFileLength)
            return new([], [new(null, null, "请提供不超过 256 Ki 字符的科目文件。")]);
        var parsed = new List<ImportedAccount>();
        var issues = new List<ChartImportIssue>();
        void ParseRow(long row, AccountInput? input)
        {
            try
            {
                if (input is null) throw new ArgumentException("空科目记录。");
                parsed.Add(new(row, input.Parse()));
            }
            catch (ArgumentException error) { issues.Add(new(row, input?.Code, error.Message)); }
        }

        try
        {
            if (format == "nexora-json")
            {
                var structure = JsonSerializer.Deserialize<StructureFile>(file.TrimStart('\uFEFF'), StrictJson);
                if (structure?.Format != "nexora.chart-structure.v1" || structure.Accounts is null)
                    throw new ArgumentException("需要 nexora.chart-structure.v1 结构文件。");
                if (structure.Accounts.Length is < 1 or > MaxAccounts) throw new ArgumentException("文件须含 1 至 1000 条科目。");
                for (var index = 0; index < structure.Accounts.Length; index++)
                    ParseRow(index + 1, structure.Accounts[index]);
            }
            else
            {
                using var parser = new TextFieldParser(new StringReader(file.TrimStart('\uFEFF'))) { TrimWhiteSpace = true };
                parser.SetDelimiters(",");
                var headers = parser.ReadFields() ?? throw new ArgumentException("缺少 CSV 表头。");
                var fields = headers.Select((name, index) => (name, index))
                    .ToDictionary(pair => pair.name, pair => pair.index, StringComparer.OrdinalIgnoreCase);
                var (code, name, category, optional) = format switch
                {
                    "nexora-csv" => ("Code", "Name", "Category", new[] { "ParentCode", "Purpose", "IsArchived" }),
                    "xero-csv" => ("Code", "Name", "Type", new[] { "Tax Code", "Description" }),
                    "qbo-csv" => ("Account Number", "Account Name", "Type", new[] { "Detail Type" }),
                    _ => throw new ArgumentException("不支持此来源格式。")
                };
                var required = new[] { code, name, category };
                if (required.Any(column => !fields.ContainsKey(column))
                    || headers.Any(column => !required.Concat(optional).Contains(column, StringComparer.OrdinalIgnoreCase)))
                    throw new ArgumentException("CSV 表头不匹配所选格式。科目结构不能携带金额字段。");
                var rows = 0;
                while (!parser.EndOfData)
                {
                    var row = parser.LineNumber;
                    var values = parser.ReadFields() ?? [];
                    if (++rows > MaxAccounts) throw new ArgumentException("单次导入最多 1000 条科目。");
                    if (values.Length != headers.Length)
                    {
                        issues.Add(new(row, null, "列数与表头不一致。"));
                        continue;
                    }
                    string? Field(string column) => fields.TryGetValue(column, out var index) ? values[index] : null;
                    var archived = Field("IsArchived");
                    if (!string.IsNullOrEmpty(archived) && !bool.TryParse(archived, out _))
                    {
                        issues.Add(new(row, Field(code), "IsArchived 必须是 true 或 false。"));
                        continue;
                    }
                    ParseRow(row, new(Field(code)!, Field(name)!, MapCategory(format, Field(category)!),
                        Field("ParentCode"), Field("Purpose") is { Length: > 0 } purpose ? purpose : null,
                        bool.TryParse(archived, out var flag) && flag));
                }
                if (rows == 0) throw new ArgumentException("CSV 没有科目数据。");
            }
        }
        catch (JsonException) { issues.Add(new(null, null, "JSON 结构无效或含不支持的字段。")); }
        catch (MalformedLineException error) { issues.Add(new(error.LineNumber, null, "CSV 引号或分隔符无效。")); }
        catch (ArgumentException error) { issues.Add(new(null, null, error.Message)); }

        foreach (var duplicate in parsed.GroupBy(row => row.Definition.Code).Where(group => group.Count() > 1))
            foreach (var row in duplicate) issues.Add(new(row.Row, duplicate.Key, "文件内科目编码重复。"));
        return new(parsed, issues);
    }

    private static string MapCategory(string format, string category) =>
        format == "nexora-csv" ? category : category.Trim().ToLowerInvariant() switch
        {
            "bank" or "current asset" or "fixed asset" or "inventory" or "non-current asset" or "prepayment"
                or "accounts receivable" or "accounts receivable (a/r)" or "other current assets" or "fixed assets" or "other assets" => "asset",
            "current liability" or "non-current liability" or "liability" or "accounts payable" or "accounts payable (a/p)"
                or "credit card" or "other current liabilities" or "long term liabilities" => "liability",
            "equity" => "equity",
            "revenue" or "sales" or "other income" or "income" => "income",
            "direct costs" or "expense" or "overhead" or "depreciation" or "expenses" or "cost of goods sold" or "other expenses" => "expense",
            _ => category
        };
}
