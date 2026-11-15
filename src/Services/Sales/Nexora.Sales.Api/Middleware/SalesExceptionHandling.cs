using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Application;
using Nexora.Sales.Domain;
using Npgsql;

namespace Nexora.Sales.Api;

internal static class SalesExceptionHandling
{
    public static void UseSalesExceptionHandling(this WebApplication app)
    {
        app.UseExceptionHandler(handler => handler.Run(async context =>
        {
            var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
            var (status, code) = error switch
            {
                ResourceNotFoundException => (404, "sales.not_found"),
                AccessDeniedException => (403, "sales.access_denied"),
                SalesAuthorityUnavailableException => (503, "sales.dependency_unavailable"),
                ArgumentException => (400, "sales.invalid_request"),
                SalesPreconditionFailedException => (412, "sales.precondition_failed"),
                SalesVersionConflictException or DbUpdateConcurrencyException => (409, "sales.version_conflict"),
                IdempotencyConflictException => (409, "sales.idempotency_conflict"),
                SalesRuleException or BusinessConflictException => (409, "sales.state_conflict"),
                DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => (409, "sales.duplicate"),
                _ => (500, "sales.unexpected_error")
            };
            var detail = error is ArgumentException or SalesRuleException or BusinessConflictException or SalesVersionConflictException or SalesPreconditionFailedException
                ? error.Message : null;
            await Results.Problem(statusCode: status, title: "Sales request failed", detail: detail,
                extensions: new Dictionary<string, object?> { ["code"] = code, ["traceId"] = context.TraceIdentifier }).ExecuteAsync(context);
        }));
    }
}
