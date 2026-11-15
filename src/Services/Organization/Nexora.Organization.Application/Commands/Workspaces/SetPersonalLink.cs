using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed record SetPersonalLink(Guid CompanyWorkspaceId, Guid PersonalWorkspaceId, bool IsLinked, ActorContext Actor)
    : IUserGovernanceCommand;
