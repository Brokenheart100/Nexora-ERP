using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class DonationFiscalTicketStore(FinanceDbContext db) : IDonationFiscalTickets
{
    private IQueryable<DonationFiscalTicket> Scoped(ResourceScope scope) =>
        db.Set<DonationFiscalTicket>().AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<DonationFiscalTicket?> FindAsync(ResourceScope scope, Guid donationId, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.DonationId == donationId, ct);

    public Task<bool> NumberInUseAsync(ResourceScope scope, string code, string number, CancellationToken ct) =>
        Scoped(scope).AnyAsync(x => x.Code == code && x.Number == number, ct);

    public void Add(DonationFiscalTicket ticket) => db.Add(ticket);
}
