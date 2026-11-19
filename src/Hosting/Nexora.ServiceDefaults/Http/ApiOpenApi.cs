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
                if (metadata.OfType<ApiWriteAttribute>().FirstOrDefault() is { } contract)
                {
                    DescribeHeaderAlternatives(operation, contract);
                    if (contract.Idempotent)
                        AddHeader(operation, ApiIdempotency.Header, "Non-empty UUID. When operationId is also supplied, both values must agree.");
                    AddProblem(operation, 400);
                    AddProblem(operation, 409);
                    if (contract.RevisionField is { } field)
                    {
                        AddHeader(operation, HeaderNames.IfMatch, $"One strong quoted revision. Alternative to {field}.");
                        AddProblem(operation, 412);
                    }
                }
                AddResponseHeader(operation, "201", HeaderNames.Location, "URI of the created resource.");
                AddResponseHeader(operation, "202", HeaderNames.Location, "URI for checking progress.");
                if (metadata.OfType<RevisionTaggedAttribute>().Any())
                    AddResponseHeader(operation, "200", HeaderNames.ETag, "Quoted revision for the current resource.");
                return Task.CompletedTask;
            });
            configure?.Invoke(options);
        });

    private static void AddHeader(OpenApiOperation operation, string name, string description) =>
        (operation.Parameters ??= []).Add(new OpenApiParameter
        {
            Name = name,
            In = ParameterLocation.Header,
            Schema = new OpenApiSchema { Type = JsonSchemaType.String },
            Description = description
        });

    private static void DescribeHeaderAlternatives(OpenApiOperation operation, ApiWriteAttribute contract)
    {
        if (operation.RequestBody is not OpenApiRequestBody { Content: { } content } body) return;
        var alternatives = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (contract.Idempotent) alternatives.Add("operationId", ApiIdempotency.Header);
        if (contract.RevisionField is { } field) alternatives.Add(field, HeaderNames.IfMatch);

        foreach (var media in content.Values)
        {
            var original = (media.Schema as OpenApiSchemaReference)?.Target ?? media.Schema;
            if (original is not OpenApiSchema { Required: { Count: > 0 } required } schema) continue;
            var copy = (OpenApiSchema)schema.CreateShallowCopy();
            copy.Required = required.Where(field => !alternatives.ContainsKey(field)).ToHashSet(StringComparer.Ordinal);
            media.Schema = copy;
        }
        body.Description = "Supply each of the following values in the body or its corresponding header. "
            + "When both are present, the values must agree. "
            + string.Join(", ", alternatives.Select(pair => $"{pair.Key} ({pair.Value})")) + ".";
    }

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

    private static void AddResponseHeader(OpenApiOperation operation, string status, string name, string description)
    {
        if (operation.Responses?.TryGetValue(status, out var result) != true || result is not OpenApiResponse response) return;
        (response.Headers ??= new Dictionary<string, IOpenApiHeader>())[name] = new OpenApiHeader
        { Description = description, Schema = new OpenApiSchema { Type = JsonSchemaType.String } };
    }

    public static void MapBusinessOpenApi(this WebApplication app)
    {
        if (app.Environment.IsDevelopment()) app.MapOpenApi().AllowAnonymous();
    }
}
