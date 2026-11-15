using Microsoft.AspNetCore.OpenApi;
using Microsoft.Net.Http.Headers;
using Microsoft.OpenApi;

namespace Nexora.Sales.Api;

internal sealed class SalesOrderOpenApi : IOpenApiDocumentTransformer
{
    private const string Orders = "/api/sales/workspaces/{workspaceId}/orders";
    private const string Detail = Orders + "/{id}";

    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        foreach (var (path, item) in document.Paths)
        {
            if (path != Orders && path != Detail && !path.StartsWith(Detail + "/", StringComparison.Ordinal)) continue;
            if (item.Operations is not { } operations) continue;
            foreach (var (method, operation) in operations)
            {
                if (method == HttpMethod.Post || method == HttpMethod.Put)
                {
                    AddParameter(operation, SalesOrderHeaders.IdempotencyKey,
                        "UUID for this operation. Supply the header or operationId. Both must agree when sent together.");
                    if (path != Orders)
                        AddParameter(operation, HeaderNames.IfMatch,
                            "Strong tags from the order detail, or *. Supply this header or expectedVersion. Both conditions apply when sent together.");
                }
                if (method == HttpMethod.Get && path == Detail)
                {
                    AddParameter(operation, HeaderNames.IfNoneMatch, "Return 304 if the current order detail matches the supplied tag.");
                    AddResponseHeader(operation, "200", HeaderNames.ETag, "Strong validator for this order detail.");
                    AddResponseHeader(operation, "304", HeaderNames.ETag, "Current validator for this order detail.");
                }
                AddResponseHeader(operation, "201", HeaderNames.Location, "URI of the created order.");
            }
        }
        return Task.CompletedTask;
    }

    private static void AddParameter(OpenApiOperation operation, string name, string description)
    {
        (operation.Parameters ??= []).Add(new OpenApiParameter
        {
            Name = name, In = ParameterLocation.Header, Description = description, Schema = new OpenApiSchema { Type = JsonSchemaType.String }
        });
    }

    private static void AddResponseHeader(OpenApiOperation operation, string status, string name, string description)
    {
        if (operation.Responses?.TryGetValue(status, out var entry) != true || entry is not OpenApiResponse response) return;
        (response.Headers ??= new Dictionary<string, IOpenApiHeader>())[name] = new OpenApiHeader
        {
            Description = description, Schema = new OpenApiSchema { Type = JsonSchemaType.String }
        };
    }
}
