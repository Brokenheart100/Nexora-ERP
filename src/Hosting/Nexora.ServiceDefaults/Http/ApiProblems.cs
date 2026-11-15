using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;

namespace Nexora.ServiceDefaults.Http;

public static class ApiProblems
{
    public static IServiceCollection AddNexoraProblemDetails(this IServiceCollection services) =>
        services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            var extensions = context.ProblemDetails.Extensions;
            extensions.TryAdd("traceId", context.HttpContext.TraceIdentifier);
            extensions.TryAdd("code", StatusCode(context.ProblemDetails.Status ?? context.HttpContext.Response.StatusCode));
        });

    public static void UseApiStatusProblems(this WebApplication app) => app.UseStatusCodePages(async status =>
    {
        var context = status.HttpContext;
        if (!context.Request.Path.StartsWithSegments("/api") || HttpMethods.IsHead(context.Request.Method)) return;
        await Create(context, context.Response.StatusCode).ExecuteAsync(context);
    });

    public static IResult Create(HttpContext context, int status, string? code = null, string? detail = null, string? title = null) =>
        Results.Problem(statusCode: status, title: title ?? ReasonPhrases.GetReasonPhrase(status), detail: detail,
            extensions: new Dictionary<string, object?> { ["code"] = code ?? StatusCode(status), ["traceId"] = context.TraceIdentifier });

    private static string StatusCode(int status) => status switch
    {
        400 => "request.invalid",
        401 => "auth.required",
        403 => "auth.forbidden",
        404 => "resource.not_found",
        405 => "request.method_not_allowed",
        409 => "resource.conflict",
        412 => "resource.precondition_failed",
        415 => "request.unsupported_media_type",
        429 => "request.rate_limited",
        503 => "dependency.unavailable",
        _ => $"http.{status}"
    };
}
