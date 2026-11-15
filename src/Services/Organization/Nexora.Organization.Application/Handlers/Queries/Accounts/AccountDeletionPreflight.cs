using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed class AccountDeletionPreflight(IAccountDeletionImpactReader reader)
{
    public async Task<AccountDeletionReview> ReadAsync(ActorContext actor, CancellationToken ct)
    {
        var impact = await reader.ReadAsync(new(actor.Issuer, actor.Subject), ct);
        var blockers = new List<DeletionBlocker>();
        foreach (var workspace in impact.Workspaces)
        {
            if (workspace.Owned)
                blockers.Add(new(workspace.Personal ? "personal-workspace-disposition" : "company-ownership", workspace.WorkspaceId, workspace.Name));
            if (!workspace.Personal && workspace.LastAdministrator)
                blockers.Add(new("last-active-administrator", workspace.WorkspaceId, workspace.Name));
        }
        if (impact.PersonalLinks > 0) blockers.Add(new("active-personal-links", null, null));
        return new(blockers.ToArray(), RequiresRetentionReview: true);
    }
}
