using EnglishLearningApp.Application.ExamSessions.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.ExamSessions.Commands.StartExamSession;

public record StartExamSessionCommand(
    Guid UserId,
    Guid ExamId
) : IRequest<ExamSessionResult>;
