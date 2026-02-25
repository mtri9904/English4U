using EnglishLearningApp.Application.Questions.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Queries.GetQuestionById;

public class GetQuestionByIdQueryHandler(
    IGenericRepository<Question> questionRepository
) : IRequestHandler<GetQuestionByIdQuery, QuestionResult>
{
    public async Task<QuestionResult> Handle(GetQuestionByIdQuery request, CancellationToken cancellationToken)
    {
        var question = await questionRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy câu hỏi.");

        return new QuestionResult(question.Id, question.LessonId, question.SkillType, question.QuestionType,
            question.Content, question.AudioUrl, question.ImageUrl, question.CorrectAnswer,
            question.Options, question.Points, question.OrderIndex, question.CreatedAt);
    }
}
