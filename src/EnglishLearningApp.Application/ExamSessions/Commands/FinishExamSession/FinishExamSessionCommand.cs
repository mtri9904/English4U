using EnglishLearningApp.Application.ExamSessions.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.ExamSessions.Commands.FinishExamSession;

public record FinishExamSessionCommand(Guid SessionId) : IRequest<ExamSessionResult>;
