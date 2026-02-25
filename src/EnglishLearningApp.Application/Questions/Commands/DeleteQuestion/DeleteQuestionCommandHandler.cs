using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Commands.DeleteQuestion;

public class DeleteQuestionCommandHandler(
    IGenericRepository<Question> questionRepository
) : IRequestHandler<DeleteQuestionCommand, bool>
{
    public async Task<bool> Handle(DeleteQuestionCommand request, CancellationToken cancellationToken)
    {
        var question = await questionRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy câu hỏi.");

        questionRepository.Delete(question);
        await questionRepository.SaveChangesAsync();
        return true;
    }
}
