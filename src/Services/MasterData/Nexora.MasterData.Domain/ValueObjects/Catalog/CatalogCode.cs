using System.Text.RegularExpressions;

namespace Nexora.MasterData.Domain;

public sealed record CatalogCode
{
    public string Value { get; }
    public CatalogCode(string? value)
    {
        var normalized = value?.Trim().ToUpperInvariant();
        if (normalized is null || !Regex.IsMatch(normalized, @"\A[A-Z0-9][A-Z0-9._-]{0,39}\z"))
            throw new CatalogRuleException("Use 1–40 letters, digits, dots, underscores or hyphens for the code.");
        Value = normalized;
    }

    internal static string Name(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > 160 || trimmed.Any(char.IsControl))
            throw new CatalogRuleException("A name of 1–160 characters is required.");
        return trimmed;
    }
}
