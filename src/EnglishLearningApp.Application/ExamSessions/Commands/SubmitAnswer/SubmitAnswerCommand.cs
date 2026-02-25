using MediatR;

namespace EnglishLearningApp.Application.ExamSessions.Commands.SubmitAnswer;

public record SubmitAnswerCommand(
    Guid SessionId,
    Guid QuestionId,
    string? AnswerText,
    string? AudioUrl
) : IRequest<bool>;
