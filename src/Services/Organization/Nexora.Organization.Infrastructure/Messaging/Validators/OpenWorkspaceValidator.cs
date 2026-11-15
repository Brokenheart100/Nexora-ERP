using FluentValidation;
using Nexora.Organization.Application;

namespace Nexora.Organization.Infrastructure.Messaging;

public sealed class OpenWorkspaceValidator : AbstractValidator<OpenWorkspace>
{
    public OpenWorkspaceValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.Actor).NotNull();
        RuleFor(x => x.Actor.Issuer).NotEmpty().MaximumLength(500);
        RuleFor(x => x.Actor.Subject).NotEmpty().MaximumLength(200);
    }
}
