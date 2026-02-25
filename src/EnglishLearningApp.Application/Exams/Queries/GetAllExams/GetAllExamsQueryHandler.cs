using EnglishLearningApp.Application.Exams.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Queries.GetAllExams;

public class GetAllExamsQueryHandler(
    IGenericRepository<Exam> examRepository
) : IRequestHandler<GetAllExamsQuery, IEnumerable<ExamResult>>
{
    public async Task<IEnumerable<ExamResult>> Handle(GetAllExamsQuery request, CancellationToken cancellationToken)
    {
        var exams = await examRepository.GetAllAsync();
        return exams.Select(e => new ExamResult(e.Id, e.CourseId, e.Title, e.Description,
            e.Duration, e.TotalPoints, e.PassingScore, e.IsPublished, e.CreatedAt));
    }
}
