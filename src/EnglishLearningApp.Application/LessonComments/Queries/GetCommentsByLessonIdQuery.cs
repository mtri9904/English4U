using EnglishLearningApp.Application.LessonComments.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.LessonComments.Queries;

public record GetCommentsByLessonIdQuery(Guid LessonId) : IRequest<IEnumerable<LessonCommentResult>>;

public class GetCommentsByLessonIdQueryHandler(
    IGenericRepository<LessonComment> repository
) : IRequestHandler<GetCommentsByLessonIdQuery, IEnumerable<LessonCommentResult>>
{
    public async Task<IEnumerable<LessonCommentResult>> Handle(GetCommentsByLessonIdQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(c => c.LessonId == request.LessonId);
        return list.Select(c => new LessonCommentResult(c.Id, c.LessonId, c.UserId,
            c.Content, c.ParentId, c.CreatedAt))
            .OrderBy(c => c.CreatedAt);
    }
}
