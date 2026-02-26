using EnglishLearningApp.Application.CourseReviews.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.CourseReviews.Queries;

public record GetReviewsByCourseIdQuery(Guid CourseId) : IRequest<IEnumerable<CourseReviewResult>>;

public class GetReviewsByCourseIdQueryHandler(
    IGenericRepository<CourseReview> repository
) : IRequestHandler<GetReviewsByCourseIdQuery, IEnumerable<CourseReviewResult>>
{
    public async Task<IEnumerable<CourseReviewResult>> Handle(GetReviewsByCourseIdQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.FindAsync(r => r.CourseId == request.CourseId);
        return list.Select(r => new CourseReviewResult(r.Id, r.CourseId, r.UserId, r.Rating, r.Comment, r.CreatedAt))
                   .OrderByDescending(r => r.CreatedAt);
    }
}
