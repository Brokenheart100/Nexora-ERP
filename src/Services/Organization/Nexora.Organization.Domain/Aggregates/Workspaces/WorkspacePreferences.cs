using System.Buffers.Binary;

namespace Nexora.Organization.Domain;

public sealed class WorkspacePreferences
{
    public const int DefaultSessionIdleMinutes = 30;
    public const int MinimumSessionIdleMinutes = 1;
    public const int MaximumSessionIdleMinutes = 480;
    public const int DefaultRoleGrantApprovals = 1;
    public const int MinimumRoleGrantApprovals = 1;
    public const int MaximumRoleGrantApprovals = 2;

    private WorkspacePreferences() { }

    public WorkspacePreferences(Guid workspaceId, Guid tenantId)
    {
        WorkspaceId = workspaceId;
        TenantId = tenantId;
    }

    public Guid WorkspaceId { get; private set; }
    public Guid TenantId { get; private set; }
    public string LegalName { get; private set; } = "";
    public string BrandName { get; private set; } = "";
    public string AccentColor { get; private set; } = "#274580";
    public string DateFormat { get; private set; } = "yyyy-MM-dd";
    public string TimeZone { get; private set; } = "Asia/Shanghai";
    public string? LogoDataUrl { get; private set; }
    public int SessionIdleMinutes { get; private set; } = DefaultSessionIdleMinutes;
    public int RoleGrantApprovals { get; private set; } = DefaultRoleGrantApprovals;
    public long Version { get; private set; }

    public void Revise(CompanyPresentation presentation, int? sessionIdleMinutes = null, int? roleGrantApprovals = null)
    {
        var legalName = NormalizeName(presentation.LegalName);
        var brandName = NormalizeName(presentation.BrandName);
        var color = presentation.AccentColor?.Trim();
        if (color is not { Length: 7 } || color[0] != '#' || !color.Skip(1).All(Uri.IsHexDigit))
            throw new ArgumentException("Use a six-digit hexadecimal brand color.");
        if (presentation.DateFormat is not ("yyyy-MM-dd" or "dd/MM/yyyy" or "yyyy年MM月dd日"))
            throw new ArgumentException("Unsupported date format.");
        var timeZone = presentation.TimeZone?.Trim();
        if (timeZone is null || timeZone.Length > 80 || !TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _))
            throw new ArgumentException("Unknown time zone.");
        var logo = ValidateLogo(presentation.LogoDataUrl);
        var idleMinutes = sessionIdleMinutes ?? SessionIdleMinutes;
        if (idleMinutes is < MinimumSessionIdleMinutes or > MaximumSessionIdleMinutes)
            throw new ArgumentException("Session idle timeout must be between 1 and 480 minutes.");
        var approvals = roleGrantApprovals ?? RoleGrantApprovals;
        if (approvals is < MinimumRoleGrantApprovals or > MaximumRoleGrantApprovals)
            throw new ArgumentException("Role grants require one or two owner approvals.");
        SessionIdleMinutes = idleMinutes;
        RoleGrantApprovals = approvals;
        LegalName = legalName;
        BrandName = brandName;
        AccentColor = color.ToUpperInvariant();
        DateFormat = presentation.DateFormat;
        TimeZone = timeZone;
        LogoDataUrl = logo;
        Version++;
    }

    private static string NormalizeName(string? value)
    {
        var name = value?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 160 || name.Any(char.IsControl))
            throw new ArgumentException("Use a name of 1–160 characters.");
        return name;
    }

    private static string? ValidateLogo(string? data)
    {
        if (string.IsNullOrEmpty(data)) return null;
        const string prefix = "data:image/png;base64,";
        const int maximumBytes = 128 * 1024;
        if (!data.StartsWith(prefix, StringComparison.Ordinal) || data.Length > prefix.Length + (maximumBytes + 2) / 3 * 4)
            throw new ArgumentException("The logo must be a PNG of at most 128 KiB.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(data[prefix.Length..]); }
        catch (FormatException) { throw new ArgumentException("The logo is not valid base64."); }
        ReadOnlySpan<byte> signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.Length is < 45 or > maximumBytes || !bytes.AsSpan(0, 8).SequenceEqual(signature)
            || BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(8, 4)) != 13
            || !bytes.AsSpan(12, 4).SequenceEqual("IHDR"u8)
            || !bytes.AsSpan(bytes.Length - 8, 4).SequenceEqual("IEND"u8))
            throw new ArgumentException("The logo must be a complete PNG.");
        var width = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4));
        var height = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4));
        if (width is 0 or > 512 || height is 0 or > 512)
            throw new ArgumentException("The logo must fit within 512 by 512 pixels.");
        return prefix + Convert.ToBase64String(bytes);
    }
}
