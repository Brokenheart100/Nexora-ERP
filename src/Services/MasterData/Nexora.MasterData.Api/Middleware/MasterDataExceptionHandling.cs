using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;
using Npgsql;
using Nexora.ServiceDefaults.Http;

namespace Nexora.MasterData.Api;

internal static class MasterDataExceptionHandling
{
    public static void UseMasterDataExceptionHandling(this WebApplication app)
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
                CatalogRuleException or ArgumentException => 400,
                CatalogAuthorityUnavailableException => 503,
                IdempotencyConflictException or BusinessConflictException or DbUpdateConcurrencyException => 409,
                DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } => 409,
                BadHttpRequestException badRequest => badRequest.StatusCode,
                _ => 500
            };
            var code = error switch
            {
                IdempotencyConflictException => "masterdata.idempotency_conflict",
                RevisionConflictException when conditional => "masterdata.precondition_failed",
                RevisionConflictException or DbUpdateConcurrencyException => "masterdata.version_conflict",
                BusinessConflictException => "masterdata.state_conflict",
                CatalogRuleException => "masterdata.validation",
                _ => null
            };
            await ApiProblems.Create(context, status, code, null).ExecuteAsync(context);
        }));
    }
}
