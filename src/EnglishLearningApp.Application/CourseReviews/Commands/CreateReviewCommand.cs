using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.CourseReviews.Commands;

public record CreateReviewCommand(
    Guid CourseId,
    Guid UserId,
    int Rating,
    string? Comment
) : IRequest<CourseReviewResult>;

public record CourseReviewResult(Guid Id, Guid CourseId, Guid UserId, int Rating, string? Comment, DateTime CreatedAt);

public class CreateReviewCommandHandler(
    IGenericRepository<CourseReview> repository
) : IRequestHandler<CreateReviewCommand, CourseReviewResult>
{
    public async Task<CourseReviewResult> Handle(CreateReviewCommand request, CancellationToken cancellationToken)
    {
        if (request.Rating < 1 || request.Rating > 5)
            throw new ArgumentException("Rating phải từ 1 đến 5.");

        var existing = await repository.FindAsync(
            r => r.CourseId == request.CourseId && r.UserId == request.UserId);

        if (existing.Any())
            throw new InvalidOperationException("Bạn đã đánh giá khóa học này rồi.");

        var entity = new CourseReview
        {
            Id = Guid.NewGuid(),
            CourseId = request.CourseId,
            UserId = request.UserId,
            Rating = request.Rating,
            Comment = request.Comment,
            CreatedAt = DateTime.UtcNow
        };
        await repository.AddAsync(entity);
        await repository.SaveChangesAsync();
        return new CourseReviewResult(entity.Id, entity.CourseId, entity.UserId,
            entity.Rating, entity.Comment, entity.CreatedAt);
    }
}
