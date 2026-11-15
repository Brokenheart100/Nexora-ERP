using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class CompanySettingsUseCases(IWorkspaceRepository workspaces, IWorkspacePreferencesRepository repository,
    IApplicationAuthorization authorization)
{
    public async Task<CompanySettingsView> GetAsync(Guid id, ActorContext actor, CancellationToken ct)
    {
        var workspace = await RequireWorkspaceAsync(id, ct);
        var scope = new ResourceScope(workspace.TenantId, id);
        await authorization.DemandAsync(actor, scope, WorkspacePermissions.Read, ct);
        var canManage = (await authorization.CheckAsync(actor, scope, WorkspacePermissions.Manage, ct)).Allowed;
        var preferences = await repository.FindAsync(scope, ct);
        return View(workspace, preferences, canManage);
    }

    public async Task<(Guid TenantId, CompanySettingsView Settings)> UpdateAsync(ReviseCompanySettings command, CancellationToken ct)
    {
        var workspace = await RequireWorkspaceAsync(command.WorkspaceId, ct);
        var scope = new ResourceScope(workspace.TenantId, workspace.Id);
        await authorization.DemandAsync(command.Actor, scope, WorkspacePermissions.Manage, ct);
        var preferences = await repository.FindAsync(scope, ct);
        if ((preferences?.Version ?? 0) != command.ExpectedVersion)
            throw new BusinessConflictException("Company settings have changed.");
        if (preferences is null)
        {
            preferences = new(workspace.Id, workspace.TenantId);
            repository.Add(preferences);
        }
        preferences.Revise(command.Presentation, command.SessionIdleMinutes, command.RoleGrantApprovals);
        return (workspace.TenantId, View(workspace, preferences, true));
    }

    private async Task<Workspace> RequireWorkspaceAsync(Guid id, CancellationToken ct) =>
        await workspaces.FindAsync(id, ct) ?? throw new ResourceNotFoundException();

    private static CompanySettingsView View(Workspace workspace, WorkspacePreferences? preferences, bool canManage)
    {
        var presentation = preferences is null
            ? new CompanyPresentation(workspace.Name, workspace.Name, "#274580", "yyyy-MM-dd", "Asia/Shanghai", null)
            : new CompanyPresentation(preferences.LegalName, preferences.BrandName, preferences.AccentColor,
                preferences.DateFormat, preferences.TimeZone, preferences.LogoDataUrl);
        return new(workspace.Id, workspace.BaseCurrency, preferences?.Version ?? 0, presentation,
            preferences?.SessionIdleMinutes ?? WorkspacePreferences.DefaultSessionIdleMinutes,
            preferences?.RoleGrantApprovals ?? WorkspacePreferences.DefaultRoleGrantApprovals, canManage);
    }
}
