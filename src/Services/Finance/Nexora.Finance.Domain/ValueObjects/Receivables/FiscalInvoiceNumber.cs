using System.Globalization;
using System.Text.RegularExpressions;

namespace Nexora.Finance.Domain;

public static partial class FiscalInvoiceNumber
{
    public const long Limit = 999_999_999;

    public static string? Normalize(string? input, long start)
    {
        if (start is < 1 or > Limit) throw new ArgumentException("Choose a starting number between 1 and 999999999.");
        var pattern = input?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(pattern)) return null;
        if (pattern.Length > 55 || !Pattern().IsMatch(pattern)
            || pattern.Split("{FY}").Length != 2 || Sequence().Matches(pattern).Count != 1
            || Format(pattern, 9999, Limit).Length > 60)
            throw new ArgumentException("Use one {FY} and one {####} token separated by letters, digits, -, _ or /.");
        return pattern;
    }

    public static int Year(DateOnly on, int fiscalStartMonth) => on.Month < fiscalStartMonth ? on.Year - 1 : on.Year;

    public static string Format(string pattern, int year, long sequence) =>
        Sequence().Replace(pattern.Replace("{FY}", year.ToString("0000", CultureInfo.InvariantCulture), StringComparison.Ordinal),
            match => sequence.ToString(new string('0', match.Length - 2), CultureInfo.InvariantCulture));

    [GeneratedRegex(@"^(?:[A-Z0-9_/-]|\{FY\}|\{#{1,9}\})+$", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();

    [GeneratedRegex(@"\{#{1,9}\}", RegexOptions.CultureInvariant)]
    private static partial Regex Sequence();
}
