using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed record CompanySettingsView(Guid WorkspaceId, string BaseCurrency, long Version,
    CompanyPresentation Presentation, int SessionIdleMinutes, int RoleGrantApprovals, bool CanManage);
