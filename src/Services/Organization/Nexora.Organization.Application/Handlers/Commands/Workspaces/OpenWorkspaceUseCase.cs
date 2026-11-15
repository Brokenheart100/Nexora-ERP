using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class OpenWorkspaceUseCase(IWorkspaceRepository repository, TimeProvider clock, AccountMapping accounts, IApplicationAuthorization authorization,
    IBillingRepository billing, IBillingCounters counters, BillingEntitlements entitlements)
{
    public async Task<OpenWorkspaceOutcome> ExecuteAsync(OpenWorkspace command, CancellationToken cancellationToken)
    {
        await accounts.EnsureAsync(command.Actor, cancellationToken);
        var identity = new IdentityReference(command.Actor.Issuer, command.Actor.Subject);
        var existing = await repository.FindOperationAsync(identity, command.OperationId, cancellationToken);
        if (existing is not null)
        {
            // Idempotency is not a lasting access grant: a suspended creator must not read through POST replay.
            await authorization.DemandAsync(command.Actor, new(existing.TenantId, existing.Id), WorkspacePermissions.Read, cancellationToken);
            if (existing.Name != command.Name.Trim() || existing.IsPersonal != command.IsPersonal) throw new IdempotencyConflictException();
            return new(new(ToView(existing), false), null);
        }
        if (!command.IsPersonal)
        {
            var subscription = await billing.FindSubscriptionAsync(identity, cancellationToken);
            var plan = entitlements.Effective(subscription, clock.GetUtcNow());
            entitlements.EnsureWorkspaceQuota(plan, await counters.CountOwnedWorkspacesAsync(identity, cancellationToken));
        }
        var workspace = Workspace.Open(Guid.CreateVersion7(), Guid.CreateVersion7(), command.OperationId,
            command.Name, identity, clock.GetUtcNow(), command.IsPersonal);
        repository.Add(workspace);
        return new(new(ToView(workspace), true), new WorkspaceOpened(workspace.Id, workspace.TenantId,
            workspace.Id, workspace.Name, workspace.CountryCode, workspace.BaseCurrency, workspace.CreatedAtUtc, workspace.Version));
    }

    public static WorkspaceView ToView(Workspace workspace) => new(workspace.Id, workspace.TenantId,
        workspace.Name, workspace.CountryCode, workspace.BaseCurrency, workspace.Version, workspace.IsPersonal);
}
