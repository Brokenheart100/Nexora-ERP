using System.Globalization;

namespace Nexora.Sales.Application;

internal static class DecimalText
{
    public static decimal Parse(string? input) => input is { Length: >= 1 and <= 26 }
        && decimal.TryParse(input, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value)
        ? value : throw new ArgumentException("A decimal string is required.");

    public static string Format(decimal value) => value.ToString("0.######", CultureInfo.InvariantCulture);
}
