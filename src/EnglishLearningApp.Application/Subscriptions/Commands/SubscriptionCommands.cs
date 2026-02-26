using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Subscriptions.Commands;

public record CreateSubscriptionCommand(
    string Name,
    decimal Price,
    int DurationDays,
    string? Features
) : IRequest<SubscriptionResult>;

public record UpdateSubscriptionCommand(
    Guid Id,
    string Name,
    decimal Price,
    int DurationDays,
    string? Features,
    bool IsActive
) : IRequest<bool>;

public record DeleteSubscriptionCommand(Guid Id) : IRequest<bool>;

public record SubscriptionResult(
    Guid Id,
    string Name,
    decimal Price,
    int DurationDays,
    string? Features,
    bool IsActive,
    DateTime CreatedAt
);

public class CreateSubscriptionCommandHandler(
    IGenericRepository<Subscription> repository
) : IRequestHandler<CreateSubscriptionCommand, SubscriptionResult>
{
    public async Task<SubscriptionResult> Handle(CreateSubscriptionCommand request, CancellationToken cancellationToken)
    {
        var entity = new Subscription
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Price = request.Price,
            DurationDays = request.DurationDays,
            Features = request.Features,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        await repository.AddAsync(entity);
        await repository.SaveChangesAsync();
        return new SubscriptionResult(entity.Id, entity.Name, entity.Price,
            entity.DurationDays, entity.Features, entity.IsActive, entity.CreatedAt);
    }
}

public class UpdateSubscriptionCommandHandler(
    IGenericRepository<Subscription> repository
) : IRequestHandler<UpdateSubscriptionCommand, bool>
{
    public async Task<bool> Handle(UpdateSubscriptionCommand request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy gói cước.");
        entity.Name = request.Name;
        entity.Price = request.Price;
        entity.DurationDays = request.DurationDays;
        entity.Features = request.Features;
        entity.IsActive = request.IsActive;
        repository.Update(entity);
        await repository.SaveChangesAsync();
        return true;
    }
}

public class DeleteSubscriptionCommandHandler(
    IGenericRepository<Subscription> repository
) : IRequestHandler<DeleteSubscriptionCommand, bool>
{
    public async Task<bool> Handle(DeleteSubscriptionCommand request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy gói cước.");
        repository.Delete(entity);
        await repository.SaveChangesAsync();
        return true;
    }
}
