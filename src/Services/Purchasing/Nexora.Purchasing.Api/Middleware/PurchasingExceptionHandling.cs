using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;
using Npgsql;
using Nexora.ServiceDefaults.Http;

namespace Nexora.Purchasing.Api;

internal static class PurchasingExceptionHandling
{
    public static void UsePurchasingExceptionHandling(this WebApplication app)
    {
        app.UseExceptionHandler(handler => handler.Run(async context =>
        {
            var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
            var conditional = error is (RevisionConflictException or DbUpdateConcurrencyException) && context.Items.ContainsKey(ApiIdempotency.ConditionalRevision);
            var status = error switch
            {
                RevisionConflictException or DbUpdateConcurrencyException when conditional => 412,
                ResourceNotFoundException => 404,
                AccessDeniedException => 403,
                PurchaseAuthorityUnavailableException => 503,
                ArgumentException => 400,
                PurchaseRuleException or BusinessConflictException or IdempotencyConflictException or DbUpdateConcurrencyException => 409,
                DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => 409,
                BadHttpRequestException badRequest => badRequest.StatusCode,
                _ => 500
            };
            var detail = error is ArgumentException or PurchaseRuleException or BusinessConflictException ? error.Message : null;
            var code = error switch
            {
                IdempotencyConflictException => "purchasing.idempotency_conflict",
                RevisionConflictException or DbUpdateConcurrencyException when conditional => "purchasing.precondition_failed",
                RevisionConflictException or DbUpdateConcurrencyException => "purchasing.version_conflict",
                BusinessConflictException => "purchasing.state_conflict",
                PurchaseRuleException => "purchasing.order_rule",
                _ => null
            };
            await ApiProblems.Create(context, status, code, detail).ExecuteAsync(context);
        }));
    }
}
