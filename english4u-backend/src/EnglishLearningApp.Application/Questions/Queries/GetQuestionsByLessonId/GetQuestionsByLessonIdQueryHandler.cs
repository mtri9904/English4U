using EnglishLearningApp.Application.Questions.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Queries.GetQuestionsByLessonId;

public class GetQuestionsByLessonIdQueryHandler(
    IGenericRepository<Question> questionRepository
) : IRequestHandler<GetQuestionsByLessonIdQuery, IEnumerable<QuestionResult>>
{
    public async Task<IEnumerable<QuestionResult>> Handle(GetQuestionsByLessonIdQuery request, CancellationToken cancellationToken)
    {
        var questions = await questionRepository.FindAsync(q => q.LessonId == request.LessonId);
        return questions
            .OrderBy(q => q.OrderIndex)
            .Select(q => new QuestionResult(q.Id, q.LessonId, q.SkillType, q.QuestionType,
                q.Content, q.AudioUrl, q.ImageUrl, q.CorrectAnswer,
                q.Options, q.Points, q.OrderIndex, q.CreatedAt));
    }
}
