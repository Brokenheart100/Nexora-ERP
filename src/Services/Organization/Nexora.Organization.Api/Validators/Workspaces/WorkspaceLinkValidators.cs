using FluentValidation;

namespace Nexora.Organization.Api;

public sealed class SetPersonalLinkValidator : AbstractValidator<SetPersonalLinkRequest>
{
    public SetPersonalLinkValidator() => RuleFor(x => x.IsLinked).NotNull();
}
