using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Npgsql;
using Nexora.ServiceDefaults.Http;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Api;

internal static class OrganizationExceptionHandling
{
    public static void UseOrganizationExceptionHandling(this WebApplication app)
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
                GovernanceAccessException => 403,
                IdempotencyConflictException => 409,
                BusinessConflictException => 409,
                GovernanceRuleException => 409,
                PlanLimitExceededException => 409,
                DbUpdateConcurrencyException => 409,
                ArgumentException => 400,
                DbUpdateException { InnerException: PostgresException { SqlState: "23505" } } => 409,
                BadHttpRequestException badRequest => badRequest.StatusCode,
                _ => 500
            };
            var code = error switch
            {
                IdempotencyConflictException => "organization.idempotency_conflict",
                RevisionConflictException or DbUpdateConcurrencyException when conditional => "organization.precondition_failed",
                RevisionConflictException or DbUpdateConcurrencyException => "organization.version_conflict",
                BusinessConflictException => "organization.state_conflict",
                GovernanceRuleException => "organization.governance_rule",
                PlanLimitExceededException => "billing.quota_exceeded",
                _ => null
            };
            await ApiProblems.Create(context, status, code, null).ExecuteAsync(context);
        }));
    }
}
