using FluentValidation;
using Nexora.Finance.Application;

namespace Nexora.Finance.Api;

public sealed class SaveChartAccountValidator : AbstractValidator<SaveChartAccountRequest>
{
    public SaveChartAccountValidator()
    {
        RuleFor(x => x.OperationId).NotEmpty();
        RuleFor(x => x.ExpectedRevision).GreaterThan(0);
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Account).NotNull();
    }
}

public sealed class PreviewChartImportValidator : AbstractValidator<PreviewChartImportRequest>
{
    public PreviewChartImportValidator()
    {
        RuleFor(x => x.Mode).Must(x => x is "append" or "upsert" or "replace");
        RuleFor(x => x.Format).Must(x => x is "nexora-json" or "nexora-csv" or "xero-csv" or "qbo-csv");
        RuleFor(x => x.File).NotEmpty().MaximumLength(ChartFileReader.MaxFileLength);
    }
}

public sealed class CommitChartImportValidator : AbstractValidator<CommitChartImportRequest>
{
    public CommitChartImportValidator() => RuleFor(x => x.OperationId).NotEmpty();
}
