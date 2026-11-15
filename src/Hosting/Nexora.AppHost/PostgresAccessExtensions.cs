using System.Text.RegularExpressions;

namespace Nexora.AppHost;

internal static class PostgresAccessExtensions
{
    public static PostgresAccess ConfigurePostgresAccess(this IDistributedApplicationBuilder builder,
        IResourceBuilder<PostgresServerResource> postgres, params IResourceBuilder<PostgresDatabaseResource>[] databases)
    {
        var accounts = new Dictionary<string, PostgresAccount>();
        var definitions = new List<string>();
        foreach (var database in databases)
        {
            var name = database.Resource.DatabaseName;
            if (!Regex.IsMatch(name, "^[a-z][a-z0-9_]{0,54}$") || database.Resource.Parent != postgres.Resource)
                throw new InvalidOperationException("Application databases must use distinct lowercase names on this PostgreSQL server.");
            var user = "nexora_" + name;
            var password = builder.AddParameter(database.Resource.Name + "-password",
                new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true, persist: true);
            var environmentName = "NEXORA_DATABASE_PASSWORD_" + accounts.Count;
            postgres.WithEnvironment(environmentName, password);
            definitions.Add($"{name}:{user}:{environmentName}");
            accounts.Add(database.Resource.Name, new PostgresAccount(user, password));
        }
        postgres.WithEnvironment("NEXORA_DATABASES", string.Join(' ', definitions))
            .WithInitFiles(Path.GetFullPath("../../../deploy/postgres", builder.AppHostDirectory));
        var restoreDirectory = builder.Configuration["Postgres:RestoreDirectory"];
        if (!string.IsNullOrWhiteSpace(restoreDirectory))
        {
            var path = Path.GetFullPath(restoreDirectory, builder.AppHostDirectory);
            foreach (var database in databases)
                if (!File.Exists(Path.Combine(path, database.Resource.DatabaseName + ".dump")))
                    throw new InvalidOperationException("Every application database needs a backup in the explicit restore directory.");
            postgres.WithBindMount(path, "/nexora-restore", isReadOnly: true)
                .WithEnvironment("NEXORA_RESTORE_DIRECTORY", "/nexora-restore");
        }
        return new PostgresAccess(builder, accounts);
    }
}

internal sealed record PostgresAccount(string UserName, IResourceBuilder<ParameterResource> Password);

internal sealed class PostgresAccess(IDistributedApplicationBuilder builder, IReadOnlyDictionary<string, PostgresAccount> accounts)
{
    public PostgresAccount For(IResourceBuilder<PostgresDatabaseResource> database) => accounts[database.Resource.Name];

    // Build a service-only connection string: do not append to the parent's superuser connection string.
    public IResourceBuilder<ConnectionStringResource> AddConnection(IResourceBuilder<PostgresDatabaseResource> database)
    {
        var account = For(database);
        var server = database.Resource.Parent;
        var connection = ReferenceExpression.Create($"Host={server.Host};Port={server.Port};Database={database.Resource.DatabaseName};Username={account.UserName};Password={account.Password}");
        return builder.AddConnectionString($"{database.Resource.Name}-connection", connection);
    }
}
