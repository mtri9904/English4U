using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.LessonComments.Commands;

public record CreateCommentCommand(
    Guid LessonId,
    Guid UserId,
    string Content,
    Guid? ParentId
) : IRequest<LessonCommentResult>;

public record LessonCommentResult(Guid Id, Guid LessonId, Guid UserId, string Content, Guid? ParentId, DateTime CreatedAt);

public class CreateCommentCommandHandler(
    IGenericRepository<LessonComment> repository
) : IRequestHandler<CreateCommentCommand, LessonCommentResult>
{
    public async Task<LessonCommentResult> Handle(CreateCommentCommand request, CancellationToken cancellationToken)
    {
        var entity = new LessonComment
        {
            Id = Guid.NewGuid(),
            LessonId = request.LessonId,
            UserId = request.UserId,
            Content = request.Content,
            ParentId = request.ParentId,
            CreatedAt = DateTime.UtcNow
        };
        await repository.AddAsync(entity);
        await repository.SaveChangesAsync();
        return new LessonCommentResult(entity.Id, entity.LessonId, entity.UserId,
            entity.Content, entity.ParentId, entity.CreatedAt);
    }
}
