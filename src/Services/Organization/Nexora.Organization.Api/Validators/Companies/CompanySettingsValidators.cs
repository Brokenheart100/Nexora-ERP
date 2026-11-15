using FluentValidation;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Api;

public sealed class ReviseCompanySettingsValidator : AbstractValidator<ReviseCompanySettingsRequest>
{
    public ReviseCompanySettingsValidator()
    {
        RuleFor(x => x.ExpectedVersion).NotNull().GreaterThanOrEqualTo(0L);
        RuleFor(x => x.Presentation).NotNull();
        RuleFor(x => x.SessionIdleMinutes)
            .InclusiveBetween(WorkspacePreferences.MinimumSessionIdleMinutes, WorkspacePreferences.MaximumSessionIdleMinutes)
            .When(x => x.SessionIdleMinutes.HasValue);
        RuleFor(x => x.RoleGrantApprovals)
            .InclusiveBetween(WorkspacePreferences.MinimumRoleGrantApprovals, WorkspacePreferences.MaximumRoleGrantApprovals)
            .When(x => x.RoleGrantApprovals.HasValue);
    }
}
