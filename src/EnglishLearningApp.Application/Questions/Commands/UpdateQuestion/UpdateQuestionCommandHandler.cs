using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Commands.UpdateQuestion;

public class UpdateQuestionCommandHandler(
    IGenericRepository<Question> questionRepository
) : IRequestHandler<UpdateQuestionCommand, bool>
{
    public async Task<bool> Handle(UpdateQuestionCommand request, CancellationToken cancellationToken)
    {
        var question = await questionRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy câu hỏi.");

        question.SkillType = request.SkillType;
        question.QuestionType = request.QuestionType;
        question.Content = request.Content;
        question.AudioUrl = request.AudioUrl;
        question.ImageUrl = request.ImageUrl;
        question.CorrectAnswer = request.CorrectAnswer;
        question.Options = request.Options;
        question.Points = request.Points;
        question.OrderIndex = request.OrderIndex;

        questionRepository.Update(question);
        await questionRepository.SaveChangesAsync();
        return true;
    }
}
