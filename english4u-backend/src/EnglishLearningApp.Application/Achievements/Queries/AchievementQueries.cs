using EnglishLearningApp.Application.Achievements.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Achievements.Queries;

public record GetAllAchievementsQuery : IRequest<IEnumerable<AchievementResult>>;
public record GetAchievementByIdQuery(Guid Id) : IRequest<AchievementResult>;

public class GetAllAchievementsQueryHandler(
    IGenericRepository<Achievement> repository
) : IRequestHandler<GetAllAchievementsQuery, IEnumerable<AchievementResult>>
{
    public async Task<IEnumerable<AchievementResult>> Handle(GetAllAchievementsQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.GetAllAsync();
        return list.Select(e => new AchievementResult(e.Id, e.Title, e.Description, e.IconUrl, e.PointsReward));
    }
}

public class GetAchievementByIdQueryHandler(
    IGenericRepository<Achievement> repository
) : IRequestHandler<GetAchievementByIdQuery, AchievementResult>
{
    public async Task<AchievementResult> Handle(GetAchievementByIdQuery request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy thành tích.");
        return new AchievementResult(entity.Id, entity.Title, entity.Description, entity.IconUrl, entity.PointsReward);
    }
}
