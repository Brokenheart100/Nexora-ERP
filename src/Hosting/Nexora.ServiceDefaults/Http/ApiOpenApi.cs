using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi;
using Microsoft.Net.Http.Headers;

namespace Nexora.ServiceDefaults.Http;

public static class ApiOpenApi
{
    public static IServiceCollection AddBusinessOpenApi(this IServiceCollection services, Action<OpenApiOptions>? configure = null) =>
        services.AddOpenApi(options =>
        {
            options.AddOperationTransformer((operation, context, _) =>
            {
                var metadata = context.Description.ActionDescriptor.EndpointMetadata;
                if (metadata.OfType<IAuthorizeData>().Any() && !metadata.OfType<IAllowAnonymous>().Any())
                {
                    AddProblem(operation, 401);
                    AddProblem(operation, 403);
                }
                if (metadata.OfType<IdempotentWriteAttribute>().FirstOrDefault() is { } contract)
                {
                    AddHeader(operation, ApiIdempotency.Header, "Non-empty UUID. When operationId is also supplied, both values must agree.");
                    AddProblem(operation, 400);
                    AddProblem(operation, 409);
                    if (contract.RevisionField is { } field)
                    {
                        AddHeader(operation, HeaderNames.IfMatch, $"One strong quoted revision. Alternative to {field}.");
                        AddProblem(operation, 412);
                    }
                }
                if (operation.Responses?.TryGetValue("201", out var result) == true && result is OpenApiResponse created)
                    (created.Headers ??= new Dictionary<string, IOpenApiHeader>())[HeaderNames.Location] = new OpenApiHeader
                    { Description = "URI of the created resource.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } };
                return Task.CompletedTask;
            });
            configure?.Invoke(options);
        });

    private static void AddHeader(OpenApiOperation operation, string name, string description) =>
        (operation.Parameters ??= []).Add(new OpenApiParameter
        {
            Name = name, In = ParameterLocation.Header, Schema = new OpenApiSchema { Type = JsonSchemaType.String }, Description = description
        });

    private static void AddProblem(OpenApiOperation operation, int status)
    {
        (operation.Responses ??= new OpenApiResponses()).TryAdd(status.ToString(System.Globalization.CultureInfo.InvariantCulture), new OpenApiResponse
        {
            Description = ReasonPhrases.GetReasonPhrase(status),
            Content = new Dictionary<string, OpenApiMediaType>
            {
                ["application/problem+json"] = new()
                {
                    Schema = new OpenApiSchema
                    {
                        Type = JsonSchemaType.Object,
                        Properties = new Dictionary<string, IOpenApiSchema>
                        {
                            ["title"] = new OpenApiSchema { Type = JsonSchemaType.String },
                            ["status"] = new OpenApiSchema { Type = JsonSchemaType.Integer },
                            ["code"] = new OpenApiSchema { Type = JsonSchemaType.String },
                            ["traceId"] = new OpenApiSchema { Type = JsonSchemaType.String }
                        }
                    }
                }
            }
        });
    }

    public static void MapBusinessOpenApi(this WebApplication app)
    {
        if (app.Environment.IsDevelopment()) app.MapOpenApi().AllowAnonymous();
    }
}
