using Nexora.MasterData.Application;
using Nexora.MasterData.Contracts;
using Wolverine.Attributes;

namespace Nexora.MasterData.Infrastructure;

public static class PartnerHandler
{
    [Transactional]
    public static Task<(CatalogMutation, MasterDataChangedV1?)> Handle(AddPartner command, CatalogDbContext db, PartnerCommands useCases, CancellationToken ct) =>
        CatalogHandler.Complete(useCases.ExecuteAsync(command, ct));

    [Transactional]
    public static Task<(CatalogMutation, MasterDataChangedV1?)> Handle(RevisePartner command, CatalogDbContext db, PartnerCommands useCases, CancellationToken ct) =>
        CatalogHandler.Complete(useCases.ExecuteAsync(command, ct));
}
