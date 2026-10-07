namespace ETransport.Core.Entities;

public static class OrderFulfillment
{
    // Vagon limiti bo‘lsa shu limit, aks holda tonna limiti buyurtmani tugatadi.
    // Bir qatorning ortiqcha ijrosi boshqa qatorning qoldig‘ini yopmaydi.
    public static bool IsComplete(MonthlyOrder order) =>
        order.Lines.Any(x => x.WagonCount > 0 || x.TonCount > 0)
        && order.Lines.All(x => x.WagonCount > 0
            ? x.FulfilledWagonCount >= x.WagonCount
            : x.TonCount <= 0 || x.FulfilledNetWeight >= x.TonCount);

    public static void RefreshStatus(MonthlyOrder order)
    {
        if (order.Status is OrderStatus.Active or OrderStatus.Completed)
            order.Status = IsComplete(order) ? OrderStatus.Completed : OrderStatus.Active;
    }
}
