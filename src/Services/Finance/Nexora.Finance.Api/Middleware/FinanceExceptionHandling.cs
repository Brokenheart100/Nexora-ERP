using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Npgsql;
using Nexora.ServiceDefaults.Http;

namespace Nexora.Finance.Api;

internal static class FinanceExceptionHandling
{
    public static void UseFinanceExceptionHandling(this WebApplication app)
    {
        app.UseExceptionHandler(handler => handler.Run(async context =>
        {
            var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
            var conditional = error is RevisionConflictException && context.Items.ContainsKey(ApiIdempotency.ConditionalRevision);
            var status = error switch
            {
                RevisionConflictException when conditional => 412,
                ResourceNotFoundException => 404,
                AccessDeniedException => 403,
                BookAuthorityUnavailableException or InvoiceRenderingUnavailableException => 503,
                ArgumentException => 400,
                BusinessConflictException or LedgerRuleException or IdempotencyConflictException or DbUpdateConcurrencyException => 409,
                DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => 409,
                BadHttpRequestException badRequest => badRequest.StatusCode,
                _ => 500
            };
            var detail = error is ArgumentException or BusinessConflictException or LedgerRuleException ? error.Message : null;
            var code = error switch
            {
                IdempotencyConflictException => "finance.idempotency_conflict",
                RevisionConflictException when conditional => "finance.precondition_failed",
                RevisionConflictException or DbUpdateConcurrencyException => "finance.version_conflict",
                BusinessConflictException => "finance.state_conflict",
                LedgerRuleException => "finance.ledger_rule",
                _ => null
            };
            await ApiProblems.Create(context, status, code, detail).ExecuteAsync(context);
        }));
    }
}
