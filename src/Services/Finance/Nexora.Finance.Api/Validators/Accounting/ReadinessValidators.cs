using FluentValidation;

namespace Nexora.Finance.Api;

public sealed class BackfillReadinessValidator : AbstractValidator<BackfillRequest>
{
    public BackfillReadinessValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Through).InclusiveBetween(new DateOnly(1900, 1, 1), new DateOnly(9998, 12, 31))
            .When(x => x.Through is not null);
    }
}
