namespace EnglishExamApp.Domain.Entities;

public class UserSubscription
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SubscriptionId { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string? Status { get; set; }

    public User User { get; set; } = null!;
    public Subscription Subscription { get; set; } = null!;
}
