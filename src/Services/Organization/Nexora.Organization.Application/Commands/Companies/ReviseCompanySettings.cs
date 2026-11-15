using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed record ReviseCompanySettings(Guid WorkspaceId, long ExpectedVersion, CompanyPresentation Presentation,
    int? SessionIdleMinutes, int? RoleGrantApprovals, ActorContext Actor) : IUserGovernanceCommand;
