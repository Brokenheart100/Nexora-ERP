using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class WorkspaceLinkUseCases(IWorkspaceRepository workspaces, IWorkspaceLinkRepository links,
    IApplicationAuthorization authorization)
{
    public async Task<IReadOnlyList<PersonalLinkView>> ListAsync(Guid companyId, ActorContext actor, CancellationToken ct)
    {
        var company = await workspaces.FindAsync(companyId, ct);
        if (company is null || company.IsPersonal) throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(company.TenantId, company.Id), WorkspacePermissions.Read, ct);
        return await links.ListAsync(company.Id, new(actor.Issuer, actor.Subject), ct);
    }

    public async Task<(Guid TenantId, PersonalLinkView Link, bool Changed)> SetAsync(SetPersonalLink command, CancellationToken ct)
    {
        var personal = await workspaces.FindAsync(command.PersonalWorkspaceId, ct);
        if (personal is null || !personal.IsPersonal) throw new ResourceNotFoundException();
        await authorization.DemandAsync(command.Actor, new(personal.TenantId, personal.Id), WorkspacePermissions.Manage, ct);
        var identity = new IdentityReference(command.Actor.Issuer, command.Actor.Subject);
        var link = await links.FindAsync(command.CompanyWorkspaceId, personal.Id, identity, ct);
        var result = new PersonalLinkView(personal.Id, command.CompanyWorkspaceId, command.IsLinked);
        if (!command.IsLinked)
            return (personal.TenantId, result, link?.SetActive(false) == true);

        var company = await workspaces.FindAsync(command.CompanyWorkspaceId, ct);
        if (company is null || company.IsPersonal) throw new ResourceNotFoundException();
        await authorization.DemandAsync(command.Actor, new(company.TenantId, company.Id), WorkspacePermissions.Manage, ct);
        if (link is not null) return (personal.TenantId, result, link.SetActive(true));
        links.Add(new(personal, company, identity));
        return (personal.TenantId, result, true);
    }
}
