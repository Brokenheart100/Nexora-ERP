using FluentValidation;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Api;

public sealed class InviteMemberValidator : AbstractValidator<InviteMemberRequest>
{
    public InviteMemberValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty(); RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254).EmailAddress(); RuleFor(x => x.Role).Must(GovernanceRoles.Known);
        RuleFor(x => x.BusinessRoles).Must(ValidSelection);
    }

    internal static bool ValidSelection(string[]? roles) => roles is null ||
        (roles.Length <= 3 && roles.All(ExecutionRoles.All.Contains) && roles.Select(ExecutionRoles.AreaOf).Distinct().Count() == roles.Length);
}

public sealed class ApproveInvitationValidator : AbstractValidator<ApproveInvitationRequest>
{
    public ApproveInvitationValidator() => RuleFor(x => x.ExpectedVersion).GreaterThan(0);
}

public sealed class ChangeBusinessRolesValidator : AbstractValidator<ChangeBusinessRolesRequest>
{
    public ChangeBusinessRolesValidator()
    {
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Action).Must(action => action is "submit" or "approve" or "cancel");
        RuleFor(x => x.BusinessRoles).NotNull().When(x => x.Action == "submit");
        RuleFor(x => x.BusinessRoles).Must(InviteMemberValidator.ValidSelection);
    }
}

public sealed class RedeemInvitationValidator : AbstractValidator<RedeemInvitationRequest>
{
    public RedeemInvitationValidator() => RuleFor(x => x.Token).NotEmpty().Length(64).Matches("^[0-9a-f]{64}$");
}

public sealed class ChangeMemberValidator : AbstractValidator<ChangeMemberRequest>
{
    public ChangeMemberValidator() { RuleFor(x => x.ExpectedVersion).GreaterThan(0); RuleFor(x => x.Role).Must(GovernanceRoles.Known); RuleFor(x => x.IsActive).NotNull(); }
}

public sealed class RevokeInvitationValidator : AbstractValidator<RevokeInvitationRequest>
{
    public RevokeInvitationValidator() => RuleFor(x => x.ExpectedVersion).GreaterThan(0);
}
