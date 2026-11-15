using Nexora.Organization.Application;
using Wolverine.Attributes;

namespace Nexora.Organization.Infrastructure.Messaging;

public static class WorkspaceLinkHandler
{
    [Transactional]
    public static async Task<PersonalLinkView> Handle(SetPersonalLink command, OrganizationDbContext db,
        WorkspaceLinkUseCases useCases, TimeProvider clock, CancellationToken ct)
    {
        var (tenantId, link, changed) = await useCases.SetAsync(command, ct);
        if (changed)
            db.Audits.Add(new(Guid.CreateVersion7(), tenantId, command.PersonalWorkspaceId,
                command.IsLinked ? "workspace.personal_link.added" : "workspace.personal_link.removed",
                command.Actor.Issuer, command.Actor.Subject, clock.GetUtcNow(), command.CompanyWorkspaceId));
        return link;
    }
}
