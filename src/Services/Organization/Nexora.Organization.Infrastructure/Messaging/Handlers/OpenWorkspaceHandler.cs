using Nexora.Organization.Application;
using Nexora.Organization.Contracts;
using Wolverine.Attributes;

namespace Nexora.Organization.Infrastructure.Messaging;

public static class OpenWorkspaceHandler
{
    [Transactional]
    public static async Task<(OpenWorkspaceResult, WorkspaceCreatedV1?)> Handle(
        OpenWorkspace command, OrganizationDbContext db, OpenWorkspaceUseCase useCase, CancellationToken cancellationToken)
    {
        // The explicit DbContext parameter selects the write transaction. The repository
        // and this adapter resolve the very same scoped instance; Application never sees it.
        var outcome = await useCase.ExecuteAsync(command, cancellationToken);
        if (outcome.Event is not { } fact) return (outcome.Result, null);
        db.Audits.Add(new(fact.EventId, fact.TenantId, fact.WorkspaceId, "workspace.opened",
            command.Actor.Issuer, command.Actor.Subject, fact.OccurredAtUtc));
        return (outcome.Result, new(fact.EventId, fact.TenantId, fact.WorkspaceId, fact.Name,
            fact.CountryCode, fact.BaseCurrency, fact.OccurredAtUtc, fact.Version));
    }
}
