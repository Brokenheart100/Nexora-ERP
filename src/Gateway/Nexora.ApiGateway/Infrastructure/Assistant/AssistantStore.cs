using System.Text.Json;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal sealed class AssistantStore
{
    private readonly IDatabase _database;
    private readonly AssistantOptions _options;

    public AssistantStore(IConnectionMultiplexer redis, IOptions<AssistantOptions> options)
    {
        _database = redis.GetDatabase();
        _options = options.Value;
    }

    private TimeSpan Ttl => TimeSpan.FromMinutes(_options.SessionTtlMinutes);

    private static string SessionKey(Guid id) => "nexora:assistant:session:" + id.ToString("N");
    private static string IndexKey(Guid workspaceId, string subject) => "nexora:assistant:index:" + workspaceId.ToString("N") + ":" + subject;
    private static string ExecutionKey(Guid executionId) => "nexora:assistant:exec:" + executionId.ToString("N");
    private static string CancelKey(Guid executionId) => "nexora:assistant:cancel:" + executionId.ToString("N");

    public async Task<AssistantSession?> FindAsync(Guid workspaceId, string subject, Guid sessionId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var payload = await _database.StringGetAsync(SessionKey(sessionId));
        if (payload.IsNullOrEmpty) return null;
        var session = JsonSerializer.Deserialize<AssistantSession>(payload.ToString(), AssistantProtocol.Json);
        return session is not null && session.WorkspaceId == workspaceId && session.Subject == subject ? session : null;
    }

    public async Task<AssistantSession?> FindByExecutionAsync(Guid workspaceId, string subject, Guid executionId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var sessionId = await _database.StringGetAsync(ExecutionKey(executionId));
        if (sessionId.IsNullOrEmpty || !Guid.TryParse(sessionId.ToString(), out var parsed)) return null;
        return await FindAsync(workspaceId, subject, parsed, cancellationToken);
    }

    public async Task<AssistantSession> CreateAsync(Guid workspaceId, string issuer, string subject, string title, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var now = DateTimeOffset.UtcNow;
        var session = new AssistantSession
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspaceId,
            Issuer = issuer,
            Subject = subject,
            Title = title,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        await SaveAsync(session, cancellationToken);
        return session;
    }

    public async Task SaveAsync(AssistantSession session, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var payload = JsonSerializer.Serialize(session, AssistantProtocol.Json);
        await _database.StringSetAsync(SessionKey(session.Id), payload, Ttl);
        var indexKey = IndexKey(session.WorkspaceId, session.Subject);
        await _database.SortedSetAddAsync(indexKey, session.Id.ToString("N"), session.UpdatedAtUtc.ToUnixTimeMilliseconds());
        await _database.KeyExpireAsync(indexKey, Ttl);
        foreach (var message in session.Messages.Where(message => message.Role == "assistant"))
            await _database.StringSetAsync(ExecutionKey(message.Id), session.Id.ToString("N"), Ttl);
    }

    public async Task<IReadOnlyList<AssistantSession>> ListAsync(Guid workspaceId, string subject, int limit, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var indexKey = IndexKey(workspaceId, subject);
        var ids = await _database.SortedSetRangeByRankAsync(indexKey, 0, Math.Max(0, limit - 1), Order.Descending);
        var sessions = new List<AssistantSession>();
        foreach (var id in ids)
        {
            if (!Guid.TryParse(id.ToString(), out var sessionId)) continue;
            var payload = await _database.StringGetAsync(SessionKey(sessionId));
            if (payload.IsNullOrEmpty) continue;
            var session = JsonSerializer.Deserialize<AssistantSession>(payload.ToString(), AssistantProtocol.Json);
            if (session is not null && session.WorkspaceId == workspaceId && session.Subject == subject) sessions.Add(session);
        }
        return sessions;
    }

    public Task MarkCanceledAsync(Guid executionId) => _database.StringSetAsync(CancelKey(executionId), "1", TimeSpan.FromMinutes(10));

    public async Task<bool> IsCanceledAsync(Guid executionId) => await _database.StringGetAsync(CancelKey(executionId)) == "1";
}
