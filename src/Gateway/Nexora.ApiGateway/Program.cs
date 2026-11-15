using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.RateLimiting;
using Nexora.ApiGateway.Infrastructure.Assistant;
using Nexora.ApiGateway.Infrastructure.Billing;
using Nexora.ApiGateway.Infrastructure.Authorization;
using Nexora.ApiGateway.Infrastructure.Mcp;
using Nexora.ApiGateway.Infrastructure.Proxy;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddNexoraProblemDetails();
builder.AddNexoraBearer();
builder.AddGatewayProxy();
builder.AddCliAuthorization();
builder.AddMcpTools();
builder.AddRedisClient("cache");
builder.AddAssistant();
builder.AddBillingGate();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(McpProtocol.RateLimitPolicy, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    options.AddPolicy(AssistantProtocol.RateLimitPolicy, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

var app = builder.Build();
app.UseApiStatusProblems();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapBillingGate();
app.MapDefaultEndpoints();
app.MapMcpEndpoints();
app.MapAssistantEndpoints();
app.MapReverseProxy();
app.Run();
