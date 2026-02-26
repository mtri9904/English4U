using EnglishLearningApp.Application.Exams.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Commands.CreateExam;

public class CreateExamCommandHandler(
    IGenericRepository<Exam> examRepository
) : IRequestHandler<CreateExamCommand, ExamResult>
{
    public async Task<ExamResult> Handle(CreateExamCommand request, CancellationToken cancellationToken)
    {
        var exam = new Exam
        {
            Id = Guid.NewGuid(),
            CourseId = request.CourseId,
            Title = request.Title,
            Description = request.Description,
            Duration = request.Duration,
            TotalPoints = request.TotalPoints,
            PassingScore = request.PassingScore,
            IsPublished = false,
            CreatedAt = DateTime.UtcNow
        };

        await examRepository.AddAsync(exam);
        await examRepository.SaveChangesAsync();

        return new ExamResult(exam.Id, exam.CourseId, exam.Title, exam.Description,
            exam.Duration, exam.TotalPoints, exam.PassingScore, exam.IsPublished, exam.CreatedAt);
    }
}
