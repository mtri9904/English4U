using EnglishLearningApp.Application.Exams.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Queries.GetExamById;

public class GetExamByIdQueryHandler(
    IGenericRepository<Exam> examRepository
) : IRequestHandler<GetExamByIdQuery, ExamResult>
{
    public async Task<ExamResult> Handle(GetExamByIdQuery request, CancellationToken cancellationToken)
    {
        var exam = await examRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bài thi.");

        return new ExamResult(exam.Id, exam.CourseId, exam.Title, exam.Description,
            exam.Duration, exam.TotalPoints, exam.PassingScore, exam.IsPublished, exam.CreatedAt);
    }
}
