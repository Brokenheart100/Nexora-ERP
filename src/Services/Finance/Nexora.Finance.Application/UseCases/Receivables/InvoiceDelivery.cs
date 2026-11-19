using System.Security.Cryptography;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases
{
    public async Task<InvoicePdf> PdfAsync(Guid workspace, Guid id, bool preview, IInvoiceRenderer renderer, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspace, ct);
        var doc = await FindAsync(current.Scope, id, ct);
        if (doc.Terms.Kind != CustomerDocumentKind.Invoice || doc.Terms.OpeningSource is not null || doc.State == CustomerDocumentState.Cancelled)
            throw new ResourceNotFoundException();
        if (doc.State != CustomerDocumentState.Posted
            && (!preview || !(doc.MadeBy(Actor(current)) || current.Allows(LedgerPermissions.Post))))
            throw new ResourceNotFoundException();
        var terms = doc.UsesFiscalNumber && doc.NumberSequence is null ? doc.Terms with { Number = "待分配" } : doc.Terms;
        return await renderer.RenderAsync(terms, preview && doc.State != CustomerDocumentState.Posted, ct);
    }

    public async Task<InvoicePdf> SharedPdfAsync(string? token, IInvoiceShares shares, IInvoiceRenderer renderer, CancellationToken ct)
    {
        if (token is not { Length: 64 } || !token.All(Uri.IsHexDigit)) throw new ResourceNotFoundException();
        var share = await shares.FindTokenAsync(Hash(token), ct);
        if (share is null || !share.Allows(clock.GetUtcNow())) throw new ResourceNotFoundException();
        var doc = await DeliverableInvoiceAsync(new(share.TenantId, share.WorkspaceId), share.InvoiceId, ct);
        if (doc.JournalId != share.JournalId) throw new ResourceNotFoundException();
        return await renderer.RenderAsync(doc.Terms, false, ct);
    }

    public async Task<InvoiceShareView[]> SharesAsync(Guid workspace, Guid invoiceId, IInvoiceShares shares, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspace, ct);
        current.Demand(LedgerPermissions.Post);
        await DeliverableInvoiceAsync(current.Scope, invoiceId, ct);
        return (await shares.ListAsync(current.Scope, invoiceId, ct)).Select(x => ShareView(x)).ToArray();
    }

    public async Task<InvoiceShareView> CreateShareAsync(CreateInvoiceShare command, IInvoiceShares shares, CancellationToken ct)
    {
        const string action = "invoice.share-created";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return ShareView(await shares.FindAsync(current.Scope, replay.TargetId!.Value, ct)
            ?? throw new ResourceNotFoundException());
        if (command.LifetimeMinutes is < 1 or > 10080) throw new ArgumentException("A share must expire within one minute to seven days.");
        var doc = await DeliverableInvoiceAsync(current.Scope, command.InvoiceId, ct);
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var share = new InvoiceShare(doc, Hash(token), clock.GetUtcNow().AddMinutes(command.LifetimeMinutes));
        shares.Add(share);
        mutations.Record(current, command.OperationId, action, command, share.Id, 1);
        return ShareView(share, token);
    }

    public async Task<InvoiceShareView> RevokeShareAsync(RevokeInvoiceShare command, IInvoiceShares shares, CancellationToken ct)
    {
        const string action = "invoice.share-revoked";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        var share = await shares.FindAsync(current.Scope, command.ShareId, ct) ?? throw new ResourceNotFoundException();
        if (replay is not null) return ShareView(share);
        share.Revoke(clock.GetUtcNow());
        mutations.Record(current, command.OperationId, action, command, share.Id, 2);
        return ShareView(share);
    }

    private async Task<CustomerDocument> DeliverableInvoiceAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        var document = await InvoiceDocumentAsync(scope, id, ct);
        return document.Terms.OpeningSource is null ? document : throw new ResourceNotFoundException();
    }

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Convert.FromHexString(token)));
    private static InvoiceShareView ShareView(InvoiceShare x, string? token = null) => new(x.Id, x.ExpiresAtUtc, x.RevokedAtUtc, token);
}
