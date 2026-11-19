using System.Globalization;

namespace Nexora.Finance.Application;

internal sealed class WiseActivityImport
{
    private readonly Dictionary<string, int> columns;

    private WiseActivityImport(Dictionary<string, int> columns) => this.columns = columns;

    public static WiseActivityImport? Detect(string[] header)
    {
        string[] required = ["activity_id", "created_on", "currency", "status", "direction", "amount"];
        var columns = header.Select((name, index) => (Name: name.ToLowerInvariant(), Index: index)).ToArray();
        if (columns.Select(x => x.Name).Distinct().Count() != columns.Length) return null;
        var lookup = columns.ToDictionary(x => x.Name, x => x.Index);
        return required.All(lookup.ContainsKey) ? new(lookup) : null;
    }

    public (string Id, string Date, string Amount, string Description, string? SkipReason) Read(string[] fields, string currency)
    {
        string Field(string name) => columns.TryGetValue(name, out var i) ? fields[i] : "";
        var direction = Field("direction").ToLowerInvariant();
        var state = Field("status");
        var rowCurrency = Field("currency");
        var reason = direction switch
        {
            "neutral" or "internal" => "Wise internal conversion does not create a bank statement line.",
            _ when !string.Equals(state, "completed", StringComparison.OrdinalIgnoreCase) => "Wise activity has not completed.",
            _ when !string.Equals(rowCurrency, currency, StringComparison.OrdinalIgnoreCase) => "Wise activity belongs to a different currency.",
            _ => null
        };
        var timestamp = Field("created_on");
        var on = DateTimeOffset.TryParse(timestamp, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at)
            ? at.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";
        var amount = Field("signed_amount");
        if (string.IsNullOrEmpty(amount))
            amount = direction == "out" ? "-" + Field("amount").TrimStart('+') : Field("amount");
        if (direction is not ("in" or "out") || (direction == "out") != amount.StartsWith('-')) amount = "";
        var description = Field("description");
        return (Field("activity_id"), on, amount, description.Length == 0 ? Field("title") : description, reason);
    }
}
