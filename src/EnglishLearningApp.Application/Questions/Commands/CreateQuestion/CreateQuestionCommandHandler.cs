using EnglishLearningApp.Application.Questions.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Questions.Commands.CreateQuestion;

public class CreateQuestionCommandHandler(
    IGenericRepository<Question> questionRepository
) : IRequestHandler<CreateQuestionCommand, QuestionResult>
{
    public async Task<QuestionResult> Handle(CreateQuestionCommand request, CancellationToken cancellationToken)
    {
        var question = new Question
        {
            Id = Guid.NewGuid(),
            LessonId = request.LessonId,
            SkillType = request.SkillType,
            QuestionType = request.QuestionType,
            Content = request.Content,
            AudioUrl = request.AudioUrl,
            ImageUrl = request.ImageUrl,
            CorrectAnswer = request.CorrectAnswer,
            Options = request.Options,
            Points = request.Points,
            OrderIndex = request.OrderIndex,
            CreatedAt = DateTime.UtcNow
        };

        await questionRepository.AddAsync(question);
        await questionRepository.SaveChangesAsync();

        return new QuestionResult(question.Id, question.LessonId, question.SkillType, question.QuestionType,
            question.Content, question.AudioUrl, question.ImageUrl, question.CorrectAnswer,
            question.Options, question.Points, question.OrderIndex, question.CreatedAt);
    }
}
