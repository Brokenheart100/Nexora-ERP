using System.Text.RegularExpressions;

namespace Nexora.Finance.Domain;

public sealed record AccountDefinition(string Code, string Name, AccountCategory Category, string? ParentCode,
    AccountPurpose Purpose, bool IsArchived)
{
    public static AccountDefinition Parse(string? code, string? name, string? category, string? parentCode, string? purpose, bool archived)
    {
        var normalizedName = name?.Trim();
        if (string.IsNullOrEmpty(normalizedName) || normalizedName.Length > 160 || normalizedName.Any(char.IsControl))
            throw new ArgumentException("科目名称需要 1 至 160 个字符。");
        return new(NormalizeCode(code), normalizedName, ParseEnum<AccountCategory>(category, "类别"),
            string.IsNullOrWhiteSpace(parentCode) ? null : NormalizeCode(parentCode),
            ParseEnum<AccountPurpose>(purpose ?? "posting", "用途"), archived);
    }

    private static string NormalizeCode(string? value)
    {
        var code = value?.Trim().ToUpperInvariant();
        if (code is null || !Regex.IsMatch(code, @"\A[A-Z0-9][A-Z0-9._-]{0,39}\z"))
            throw new ArgumentException("科目编码需要 1 至 40 个字母、数字、点、下划线或连字符。");
        return code;
    }

    private static T ParseEnum<T>(string? value, string field) where T : struct, Enum
    {
        if (Enum.TryParse<T>(value, true, out var parsed) && string.Equals(Enum.GetName(parsed), value, StringComparison.OrdinalIgnoreCase))
            return parsed;
        throw new ArgumentException($"科目{field}无效。");
    }
}
