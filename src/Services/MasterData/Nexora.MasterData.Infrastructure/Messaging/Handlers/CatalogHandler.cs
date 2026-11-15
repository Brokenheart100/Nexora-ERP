using Nexora.MasterData.Application;
using Nexora.MasterData.Contracts;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.MasterData.Infrastructure;

public static class CatalogHandler
{
    [Transactional]
    public static Task<(CatalogMutation, MasterDataChangedV1?)> Handle(AddDefinition command, CatalogDbContext db, CatalogCommands useCases, CancellationToken ct) =>
        Complete(useCases.ExecuteAsync(command, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(CatalogMutation, MasterDataChangedV1?)> Handle(ReviseDefinition command, CatalogDbContext db, CatalogCommands useCases, CancellationToken ct) =>
        Complete(useCases.ExecuteAsync(command, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(CatalogMutation, MasterDataChangedV1?)> Handle(AddItem command, CatalogDbContext db, CatalogCommands useCases, CancellationToken ct) =>
        Complete(useCases.ExecuteAsync(command, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(CatalogMutation, MasterDataChangedV1?)> Handle(ReviseItem command, CatalogDbContext db, CatalogCommands useCases, CancellationToken ct) =>
        Complete(useCases.ExecuteAsync(command, ct));

    internal static async Task<(CatalogMutation, MasterDataChangedV1?)> Complete(Task<CatalogOutcome> pending)
    {
        var outcome = await pending;
        return (outcome.Result, outcome.Change);
    }
}
