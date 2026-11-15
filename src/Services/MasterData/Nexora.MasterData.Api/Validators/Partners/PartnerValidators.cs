using FluentValidation;
using Nexora.MasterData.Application;

namespace Nexora.MasterData.Api;

public sealed class PartnerProfileValidator : AbstractValidator<PartnerProfileRequest>
{
    public PartnerProfileValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.TaxNumber).MaximumLength(64);
        RuleFor(x => x.Address).MaximumLength(300);
        RuleFor(x => x.Roles).Must(roles => roles is { Length: >= 1 and <= 3 } &&
            roles.All(PartnerRoleCodes.IsKnown) && roles.Distinct(StringComparer.Ordinal).Count() == roles.Length)
            .WithMessage("Select one or more distinct partner roles.");
        RuleFor(x => x.Contacts).Must(contacts => contacts is { Length: <= 20 }).WithMessage("Supply at most 20 contacts.");
    }
}

public sealed class AddPartnerValidator : AbstractValidator<AddPartnerRequest>
{
    public AddPartnerValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(40);
        RuleFor(x => x.Profile).NotNull().SetValidator(new PartnerProfileValidator());
    }
}

public sealed class RevisePartnerValidator : AbstractValidator<RevisePartnerRequest>
{
    public RevisePartnerValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Profile).NotNull().SetValidator(new PartnerProfileValidator());
        RuleFor(x => x.IsActive).NotNull();
    }
}
