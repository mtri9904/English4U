using MediatR;

namespace EnglishLearningApp.Application.Exams.Commands.DeleteExam;

public record DeleteExamCommand(Guid Id) : IRequest<bool>;
