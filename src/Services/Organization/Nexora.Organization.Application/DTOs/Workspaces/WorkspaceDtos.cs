using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed record WorkspaceView(Guid Id, Guid TenantId, string Name, string CountryCode, string BaseCurrency, long Version, bool IsPersonal = false);

public sealed record OpenWorkspaceResult(WorkspaceView Workspace, bool Created);

public sealed record OpenWorkspaceOutcome(OpenWorkspaceResult Result, WorkspaceOpened? Event);
