using MediatR;

namespace EnglishLearningApp.Application.Questions.Commands.DeleteQuestion;

public record DeleteQuestionCommand(Guid Id) : IRequest<bool>;
