using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Contracts;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public sealed class CatalogCommands(CatalogMutations mutations, ICatalogRepository repository)
{
    public Task<CatalogOutcome> ExecuteAsync(AddDefinition command, CancellationToken cancellationToken) =>
        mutations.ExecuteAsync(command.WorkspaceId, CatalogPermissions.Manage, command.OperationId, "catalog.definition.created", command, (scope, change, _) =>
        {
            var definition = new CatalogDefinition(scope.TenantId, scope.WorkspaceId, command.Kind, new(command.Code), command.Name);
            repository.Add(definition);
            return Task.FromResult(DefinitionChange(change, definition));
        }, cancellationToken);

    public Task<CatalogOutcome> ExecuteAsync(ReviseDefinition command, CancellationToken cancellationToken) =>
        mutations.ExecuteAsync(command.WorkspaceId, CatalogPermissions.Manage, command.OperationId, "catalog.definition.revised", command, async (scope, change, ct) =>
        {
            var definition = await repository.FindDefinitionForUpdateAsync(scope, command.DefinitionId, ct)
                ?? throw new ResourceNotFoundException();
            if (definition.Version != command.ExpectedVersion) throw new RevisionConflictException("The definition has changed.");
            definition.Revise(command.Name, command.IsActive);
            return DefinitionChange(change, definition);
        }, cancellationToken);

    public Task<CatalogOutcome> ExecuteAsync(AddItem command, CancellationToken cancellationToken) =>
        mutations.ExecuteAsync(command.WorkspaceId, CatalogPermissions.Manage, command.OperationId, "catalog.item.created", command, async (scope, change, ct) =>
        {
            var category = await RequireDefinitionAsync(scope, command.CategoryId, DefinitionKind.Category, true, ct);
            var unit = await RequireDefinitionAsync(scope, command.UnitId, DefinitionKind.Unit, true, ct);
            var item = new CatalogItem(scope.TenantId, scope.WorkspaceId, new(command.Code), command.Name,
                command.Kind, command.TracksInventory, category, unit);
            repository.Add(item);
            return ItemChange(change, item);
        }, cancellationToken);

    public Task<CatalogOutcome> ExecuteAsync(ReviseItem command, CancellationToken cancellationToken) =>
        mutations.ExecuteAsync(command.WorkspaceId, CatalogPermissions.Manage, command.OperationId, "catalog.item.revised", command, async (scope, change, ct) =>
        {
            var item = await repository.FindItemAsync(scope, command.ItemId, ct) ?? throw new ResourceNotFoundException();
            if (item.Version != command.ExpectedVersion) throw new RevisionConflictException("The item has changed.");
            var category = await RequireDefinitionAsync(scope, command.CategoryId, DefinitionKind.Category, command.IsActive, ct);
            if (command.IsActive)
                await RequireDefinitionAsync(scope, item.UnitId, DefinitionKind.Unit, true, ct);
            item.Revise(command.Name, category, command.IsActive);
            return ItemChange(change, item);
        }, cancellationToken);

    private async Task<CatalogDefinition> RequireDefinitionAsync(ResourceScope scope, Guid id, DefinitionKind kind,
        bool requireActive, CancellationToken ct)
    {
        var definition = await repository.FindDefinitionForUpdateAsync(scope, id, ct);
        if (definition is null || definition.Kind != kind)
            throw new CatalogRuleException("Select a valid category or unit from this workspace.");
        if (requireActive && !definition.IsActive) throw new BusinessConflictException("The definition is inactive.");
        return definition;
    }

    private static MasterDataChangedV1 DefinitionChange(ChangeStamp stamp, CatalogDefinition definition) =>
        new(stamp.EventId, definition.TenantId, definition.WorkspaceId,
            definition.Kind == DefinitionKind.Category ? "category" : "unit", definition.Id, definition.Version,
            definition.Code.Value, definition.Name, definition.IsActive, stamp.OccurredAtUtc);

    private static MasterDataChangedV1 ItemChange(ChangeStamp stamp, CatalogItem item) =>
        new(stamp.EventId, item.TenantId, item.WorkspaceId, "item", item.Id, item.Version, item.Code.Value,
            item.Name, item.IsActive, stamp.OccurredAtUtc,
            new(item.Kind == ItemKind.Product ? "product" : "service", item.TracksInventory, item.CategoryId, item.UnitId));
}

public sealed class CatalogMutations(ICatalogAccess access, ICatalogRepository repository, TimeProvider clock)
{
    public async Task<CatalogOutcome> ExecuteAsync<T>(Guid workspaceId, string permission, Guid operationId, string action, T command,
        Func<ResourceScope, ChangeStamp, CancellationToken, Task<MasterDataChangedV1>> mutate, CancellationToken cancellationToken)
    {
        if (operationId == Guid.Empty) throw new CatalogRuleException("An operation ID is required.");
        var current = await access.DemandAsync(workspaceId, permission, cancellationToken);
        var fingerprint = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(command)));
        var receipt = await repository.FindReceiptAsync(current, operationId, cancellationToken);
        if (receipt is not null)
        {
            if (receipt.Action != action || receipt.Fingerprint != fingerprint) throw new IdempotencyConflictException();
            return new(new(receipt.ResourceId, receipt.ResourceVersion), null);
        }
        var change = await mutate(current.Scope, new(Guid.CreateVersion7(), clock.GetUtcNow()), cancellationToken);
        repository.Add(new CatalogReceipt(change.EventId, current.Scope.TenantId, current.Scope.WorkspaceId,
            current.Actor.Issuer, current.Actor.Subject, operationId, action, fingerprint,
            change.ResourceId, change.Version, change.OccurredAtUtc));
        return new(new(change.ResourceId, change.Version), change);
    }
}
