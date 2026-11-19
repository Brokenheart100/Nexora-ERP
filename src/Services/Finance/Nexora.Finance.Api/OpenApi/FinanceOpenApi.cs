using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Nexora.Finance.Api;

internal sealed class FinanceOpenApi : IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        var type = context.JsonTypeInfo.Type;
        if (type == typeof(decimal) || Nullable.GetUnderlyingType(type) == typeof(decimal))
        {
            schema.Type = JsonSchemaType.String | (schema.Type.GetValueOrDefault() & JsonSchemaType.Null);
            schema.Format = null;
        }
        return Task.CompletedTask;
    }
}
