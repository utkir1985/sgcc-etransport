namespace ETransport.Core.Entities;

public static class OrderFulfillment
{
    // Ijro tonna bo‘yicha: qatorda tonna bo‘lsa — tonna limiti, faqat vagon bo‘lsa (eski buyurtma) — vagon.
    // Bir qatorning ortiqcha ijrosi boshqa qatorning qoldig‘ini yopmaydi.
    public static bool IsComplete(MonthlyOrder order) =>
        order.Lines.Any(x => x.WagonCount > 0 || x.TonCount > 0)
        && order.Lines.All(x => x.TonCount > 0
            ? x.FulfilledNetWeight >= x.TonCount
            : x.WagonCount <= 0 || x.FulfilledWagonCount >= x.WagonCount);

    public static void RefreshStatus(MonthlyOrder order)
    {
        if (order.Status is OrderStatus.Active or OrderStatus.Completed)
            order.Status = IsComplete(order) ? OrderStatus.Completed : OrderStatus.Active;
    }
}
