using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Microsoft.Extensions.Hosting;

public static class Authentication
{
    public static void AddNexoraBearer(this IHostApplicationBuilder builder)
    {
        var authority = builder.Configuration["Authentication:Authority"]
            ?? throw new InvalidOperationException("Authentication authority is required.");
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.Authority = authority;
            options.Audience = "nexora-api";
            options.MapInboundClaims = false;
            options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
            options.TokenValidationParameters.ClockSkew = TimeSpan.FromSeconds(15);
        });
        builder.Services.AddAuthorization(options => options.FallbackPolicy =
            new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
    }
}
