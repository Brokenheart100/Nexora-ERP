using System.Globalization;
using Nexora.Finance.Application;
using Nexora.Finance.Contracts.Grpc;

namespace Nexora.Finance.Api.Grpc;

// Ordinary Wolverine handler behind the generated code-first gRPC service.
public static class FinanceGrpcHandler
{
    public static async Task<BookReply> Handle(BookRequest request, BookUseCases books, CancellationToken cancellationToken)
    {
        var book = await books.ReadAsync(request.WorkspaceId, cancellationToken);
        return new BookReply
        {
            IsPersonal = book.IsPersonal,
            CanInitialize = book.CanInitialize,
            HasSettings = book.Settings is not null,
            BaseCurrency = book.Settings?.BaseCurrency,
            MinorUnits = book.Settings?.MinorUnits ?? 0,
            StartsOn = book.Settings?.StartsOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            FiscalYearStartMonth = book.Settings?.FiscalYearStartMonth ?? 0,
            Template = book.Settings?.Template
        };
    }
}
