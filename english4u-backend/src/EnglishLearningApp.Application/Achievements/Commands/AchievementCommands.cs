using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Achievements.Commands;

public record CreateAchievementCommand(
    string Title,
    string? Description,
    string? IconUrl,
    int PointsReward
) : IRequest<AchievementResult>;

public record UpdateAchievementCommand(
    Guid Id,
    string Title,
    string? Description,
    string? IconUrl,
    int PointsReward
) : IRequest<bool>;

public record DeleteAchievementCommand(Guid Id) : IRequest<bool>;

public record AchievementResult(Guid Id, string Title, string? Description, string? IconUrl, int PointsReward);

public class CreateAchievementCommandHandler(
    IGenericRepository<Achievement> repository
) : IRequestHandler<CreateAchievementCommand, AchievementResult>
{
    public async Task<AchievementResult> Handle(CreateAchievementCommand request, CancellationToken cancellationToken)
    {
        var entity = new Achievement
        {
            Id = Guid.NewGuid(),
            Title = request.Title,
            Description = request.Description,
            IconUrl = request.IconUrl,
            PointsReward = request.PointsReward
        };
        await repository.AddAsync(entity);
        await repository.SaveChangesAsync();
        return new AchievementResult(entity.Id, entity.Title, entity.Description, entity.IconUrl, entity.PointsReward);
    }
}

public class UpdateAchievementCommandHandler(
    IGenericRepository<Achievement> repository
) : IRequestHandler<UpdateAchievementCommand, bool>
{
    public async Task<bool> Handle(UpdateAchievementCommand request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy thành tích.");
        entity.Title = request.Title;
        entity.Description = request.Description;
        entity.IconUrl = request.IconUrl;
        entity.PointsReward = request.PointsReward;
        repository.Update(entity);
        await repository.SaveChangesAsync();
        return true;
    }
}

public class DeleteAchievementCommandHandler(
    IGenericRepository<Achievement> repository
) : IRequestHandler<DeleteAchievementCommand, bool>
{
    public async Task<bool> Handle(DeleteAchievementCommand request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy thành tích.");
        repository.Delete(entity);
        await repository.SaveChangesAsync();
        return true;
    }
}
