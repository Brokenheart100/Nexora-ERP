using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Application;
using Nexora.Inventory.Domain;
using Npgsql;
using Nexora.ServiceDefaults.Http;

namespace Nexora.Inventory.Api;

internal static class InventoryExceptionHandling
{
    public static void UseInventoryExceptionHandling(this WebApplication app)
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
                InventoryAuthorityUnavailableException => 503,
                ArgumentException => 400,
                StockRuleException or BusinessConflictException or IdempotencyConflictException or DbUpdateConcurrencyException => 409,
                DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => 409,
                BadHttpRequestException badRequest => badRequest.StatusCode,
                _ => 500
            };
            var detail = error is ArgumentException or StockRuleException or BusinessConflictException ? error.Message : null;
            var code = error switch
            {
                IdempotencyConflictException => "inventory.idempotency_conflict",
                RevisionConflictException when conditional => "inventory.precondition_failed",
                RevisionConflictException or DbUpdateConcurrencyException => "inventory.version_conflict",
                BusinessConflictException => "inventory.state_conflict",
                StockRuleException => "inventory.stock_rule",
                _ => null
            };
            await ApiProblems.Create(context, status, code, detail).ExecuteAsync(context);
        }));
    }
}
