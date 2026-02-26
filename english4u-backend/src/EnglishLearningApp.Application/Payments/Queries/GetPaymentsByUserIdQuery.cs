using EnglishLearningApp.Application.Payments.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Payments.Queries;

public record GetPaymentsByUserIdQuery(Guid UserId) : IRequest<IEnumerable<PaymentResult>>;

public class GetPaymentsByUserIdQueryHandler(
    IGenericRepository<Payment> repository
) : IRequestHandler<GetPaymentsByUserIdQuery, IEnumerable<PaymentResult>>
{
    public async Task<IEnumerable<PaymentResult>> Handle(GetPaymentsByUserIdQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(p => p.UserId == request.UserId);
        return list.Select(p => new PaymentResult(p.Id, p.UserId, p.Amount,
            p.PaymentMethod, p.Status, p.TransactionId, p.CreatedAt))
            .OrderByDescending(p => p.CreatedAt);
    }
}
