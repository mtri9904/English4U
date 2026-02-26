using EnglishLearningApp.Application.Subscriptions.Queries;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Payments.Commands;

public record CreatePaymentCommand(
    Guid UserId,
    Guid SubscriptionId,
    decimal Amount,
    string PaymentMethod,
    string? TransactionId
) : IRequest<PaymentResult>;

public record PaymentResult(
    Guid Id,
    Guid UserId,
    decimal Amount,
    string? PaymentMethod,
    string? Status,
    string? TransactionId,
    DateTime CreatedAt
);

public class CreatePaymentCommandHandler(
    IGenericRepository<Payment> paymentRepository,
    IGenericRepository<UserSubscription> subscriptionRepository,
    IGenericRepository<Subscription> planRepository
) : IRequestHandler<CreatePaymentCommand, PaymentResult>
{
    public async Task<PaymentResult> Handle(CreatePaymentCommand request, CancellationToken cancellationToken)
    {
        var plan = await planRepository.GetByIdAsync(request.SubscriptionId)
            ?? throw new KeyNotFoundException("Không tìm thấy gói cước.");

        var now = DateTime.UtcNow;

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            Amount = request.Amount,
            PaymentMethod = request.PaymentMethod,
            Status = "COMPLETED",
            TransactionId = request.TransactionId,
            CreatedAt = now
        };
        await paymentRepository.AddAsync(payment);

        var userSub = new UserSubscription
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            SubscriptionId = request.SubscriptionId,
            StartDate = now,
            EndDate = now.AddDays(plan.DurationDays),
            Status = "ACTIVE"
        };
        await subscriptionRepository.AddAsync(userSub);

        await paymentRepository.SaveChangesAsync();

        return new PaymentResult(payment.Id, payment.UserId, payment.Amount,
            payment.PaymentMethod, payment.Status, payment.TransactionId, payment.CreatedAt);
    }
}
