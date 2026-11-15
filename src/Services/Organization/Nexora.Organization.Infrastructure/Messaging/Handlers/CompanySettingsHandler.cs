using Nexora.Organization.Application;
using Wolverine.Attributes;

namespace Nexora.Organization.Infrastructure.Messaging;

public static class CompanySettingsHandler
{
    [Transactional]
    public static async Task<CompanySettingsView> Handle(ReviseCompanySettings command, OrganizationDbContext db,
        CompanySettingsUseCases useCases, TimeProvider clock, CancellationToken ct)
    {
        var (tenantId, result) = await useCases.UpdateAsync(command, ct);
        db.Audits.Add(new(Guid.CreateVersion7(), tenantId, command.WorkspaceId, "workspace.settings.revised",
            command.Actor.Issuer, command.Actor.Subject, clock.GetUtcNow()));
        return result;
    }
}
