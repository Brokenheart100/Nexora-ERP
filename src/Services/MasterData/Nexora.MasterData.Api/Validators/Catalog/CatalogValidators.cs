using FluentValidation;

namespace Nexora.MasterData.Api;

public sealed class AddDefinitionValidator : AbstractValidator<AddDefinitionRequest>
{
    public AddDefinitionValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Kind).Must(kind => kind is "category" or "unit");
        RuleFor(x => x.Code).NotEmpty().MaximumLength(40);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
    }
}

public sealed class AddItemValidator : AbstractValidator<AddItemRequest>
{
    public AddItemValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Kind).Must(kind => kind is "product" or "service");
        RuleFor(x => x.Code).NotEmpty().MaximumLength(40);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.TracksInventory).NotNull();
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.UnitId).NotEmpty();
    }
}

public sealed class ReviseDefinitionValidator : AbstractValidator<ReviseDefinitionRequest>
{
    public ReviseDefinitionValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.IsActive).NotNull();
    }
}

public sealed class ReviseItemValidator : AbstractValidator<ReviseItemRequest>
{
    public ReviseItemValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.IsActive).NotNull();
    }
}
