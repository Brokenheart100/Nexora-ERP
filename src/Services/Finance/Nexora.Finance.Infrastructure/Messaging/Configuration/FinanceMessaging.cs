using Microsoft.Extensions.Hosting;
using System.Reflection;
using Nexora.Finance.Application;
using Nexora.Finance.Contracts.Opening;
using Nexora.Purchasing.Contracts;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Nexora.Finance.Infrastructure;

public static class FinanceMessaging
{
    public static void AddFinanceMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string connection, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(InitializeBookHandler).Assembly);
            options.PersistMessagesWithPostgresql(connection, "finance_messages");
            options.UseEntityFrameworkCoreTransactions();
            options.UseRuntimeCompilation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision().DisableSystemRequestReplyQueueDeclaration().DisableDeadLetterQueueing();
            options.PublishMessage<BuildReportExport>().ToLocalQueue("report-exports");
            options.LocalQueue("report-exports").UseDurableInbox();
            options.PublishMessage<InvoiceScheduleDue>().ToLocalQueue("invoice-occurrences");
            options.LocalQueue("invoice-occurrences").UseDurableInbox();
            options.PublishMessage<DeliverInvoiceMail>().ToLocalQueue("invoice-mail");
            options.LocalQueue("invoice-mail").UseDurableInbox();
            options.PublishMessage<InvoiceMailLeaseExpired>().ToLocalQueue("invoice-mail-leases");
            options.LocalQueue("invoice-mail-leases").UseDurableInbox();
            options.PublishMessage<ResumeCostsAfterOpening>().ToLocalQueue("opening-stock-sequence");
            options.LocalQueue("opening-stock-sequence").UseDurableInbox();
            options.ListenToRabbitQueue(ReceiptRoutes.FinanceQueue).UseDurableInbox();
            options.PublishMessage<PurchaseVarianceV1>().ToRabbitExchange(ReceiptRoutes.InventoryExchange);
            options.PublishMessage<OpeningStockRequestedV1>().ToRabbitExchange(StockOpeningRoutes.Exchange);
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
        });
    }
}
