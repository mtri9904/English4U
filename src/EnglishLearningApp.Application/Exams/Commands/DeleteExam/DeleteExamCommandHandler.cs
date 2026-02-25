using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Exams.Commands.DeleteExam;

public class DeleteExamCommandHandler(
    IGenericRepository<Exam> examRepository
) : IRequestHandler<DeleteExamCommand, bool>
{
    public async Task<bool> Handle(DeleteExamCommand request, CancellationToken cancellationToken)
    {
        var exam = await examRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bài thi.");

        examRepository.Delete(exam);
        await examRepository.SaveChangesAsync();
        return true;
    }
}
