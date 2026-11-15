using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public sealed record AddPartner(Guid WorkspaceId, Guid OperationId, string Code, PartnerProfile Profile);

public sealed record RevisePartner(Guid WorkspaceId, Guid OperationId, Guid PartnerId, long ExpectedVersion,
    PartnerProfile Profile, bool IsActive);
