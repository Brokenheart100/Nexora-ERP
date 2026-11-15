using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nexora.Finance.Api;

internal sealed class DecimalStringConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String && reader.GetString() is { Length: >= 1 and <= 26 } input
            && decimal.TryParse(input, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var value))
            return value;
        throw new JsonException("A decimal string is required.");
    }

    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString("0.############################", CultureInfo.InvariantCulture));
}
