using FluentValidation;

namespace Nexora.Organization.Api;

public sealed class SelectBillingPlanValidator : AbstractValidator<SelectBillingPlanRequest>
{
    public SelectBillingPlanValidator()
    {
        RuleFor(x => x.PlanCode).NotEmpty().MaximumLength(40);
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.PaymentReference).MaximumLength(120);
    }
}

public sealed class PayBillingInvoiceValidator : AbstractValidator<PayBillingInvoiceRequest>
{
    public PayBillingInvoiceValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Reference).NotEmpty().MaximumLength(120);
    }
}

public sealed class CancelBillingSubscriptionValidator : AbstractValidator<CancelBillingSubscriptionRequest>
{
    public CancelBillingSubscriptionValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
    }
}

public sealed class ReserveBillingDocumentsValidator : AbstractValidator<ReserveBillingDocumentsRequest>
{
    public ReserveBillingDocumentsValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.Count).InclusiveBetween(1, 100);
    }
}
