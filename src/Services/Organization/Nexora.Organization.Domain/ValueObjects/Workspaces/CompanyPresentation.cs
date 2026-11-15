namespace Nexora.Organization.Domain;

public sealed record CompanyPresentation(string LegalName, string BrandName, string AccentColor,
    string DateFormat, string TimeZone, string? LogoDataUrl);
