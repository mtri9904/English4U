using EnglishLearningApp.Application.ExamSessions.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.ExamSessions.Commands.FinishExamSession;

public class FinishExamSessionCommandHandler(
    IGenericRepository<ExamSession> sessionRepository
) : IRequestHandler<FinishExamSessionCommand, ExamSessionResult>
{
    public async Task<ExamSessionResult> Handle(FinishExamSessionCommand request, CancellationToken cancellationToken)
    {
        var session = await sessionRepository.GetByIdAsync(request.SessionId)
            ?? throw new KeyNotFoundException("Không tìm thấy session.");

        if (session.Status == "COMPLETED")
            throw new InvalidOperationException("Session đã được hoàn thành trước đó.");

        session.Status = "COMPLETED";
        session.EndedAt = DateTime.UtcNow;

        sessionRepository.Update(session);
        await sessionRepository.SaveChangesAsync();

        return new ExamSessionResult(session.Id, session.UserId, session.ExamId, session.Status,
            session.StartedAt, session.EndedAt, session.TimeRemaining, session.DraftData, session.CreatedAt);
    }
}
