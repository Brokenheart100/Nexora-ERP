using System.Text.Json;

namespace Nexora.BuildingBlocks.Infrastructure;

internal static class RecordChangeRedaction
{
    private static readonly HashSet<string> Sensitive = new(StringComparer.OrdinalIgnoreCase)
    {
        "Token", "TokenHash", "AccessToken", "RefreshToken", "IdToken", "Ticket", "Secret", "ClientSecret",
        "Password", "PasswordHash", "PrivateKey", "Credential", "Authorization", "Cookie", "CardNumber", "SecurityCode",
    };

    internal static bool CanExpose(string property) => !Sensitive.Contains(property);

    internal static string? ChangedProperties(string? value) => value is null ? null :
        string.Join(',', value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Where(CanExpose));

    internal static string? Snapshot(string? value)
    {
        if (value is null) return null;
        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                var visible = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
                foreach (var property in document.RootElement.EnumerateObject())
                    if (CanExpose(property.Name)) visible[property.Name] = property.Value;
                return JsonSerializer.Serialize(visible);
            }
        }
        catch (JsonException)
        {
            // A truncated historical snapshot cannot be inspected safely.
        }
        return "[snapshot unavailable]";
    }
}
