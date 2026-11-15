using FluentValidation;

namespace Nexora.Finance.Api;

public sealed class InitializeBookValidator : AbstractValidator<InitializeBookRequest>
{
    public InitializeBookValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.BaseCurrency).NotEmpty().Length(3);
        RuleFor(x => x.StartsOn).NotEmpty();
        RuleFor(x => x.FiscalYearStartMonth).InclusiveBetween(1, 12);
    }
}
