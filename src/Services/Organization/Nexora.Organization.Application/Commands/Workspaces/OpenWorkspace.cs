using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed record OpenWorkspace(Guid OperationId, string Name, ActorContext Actor, bool IsPersonal = false) : IUserGovernanceCommand;
