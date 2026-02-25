using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Commands.UpdateExam;

public class UpdateExamCommandHandler(
    IGenericRepository<Exam> examRepository
) : IRequestHandler<UpdateExamCommand, bool>
{
    public async Task<bool> Handle(UpdateExamCommand request, CancellationToken cancellationToken)
    {
        var exam = await examRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bài thi.");

        exam.Title = request.Title;
        exam.Description = request.Description;
        exam.Duration = request.Duration;
        exam.TotalPoints = request.TotalPoints;
        exam.PassingScore = request.PassingScore;
        exam.IsPublished = request.IsPublished;

        examRepository.Update(exam);
        await examRepository.SaveChangesAsync();
        return true;
    }
}
