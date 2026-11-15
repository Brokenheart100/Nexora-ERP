using Nexora.Organization.Domain;

namespace Nexora.Organization.Api;

public sealed record ReviseCompanySettingsRequest(long? ExpectedVersion, CompanyPresentation Presentation,
    int? SessionIdleMinutes, int? RoleGrantApprovals);
