using FluentValidation;

namespace Nexora.Organization.Api;

public sealed class CreateWorkspaceRequestValidator : AbstractValidator<CreateWorkspaceRequest>
{
    public CreateWorkspaceRequestValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
    }
}
