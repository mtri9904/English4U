using EnglishLearningApp.Application.ExamSessions.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.ExamSessions.Commands.StartExamSession;

public class StartExamSessionCommandHandler(
    IGenericRepository<ExamSession> sessionRepository,
    IGenericRepository<Exam> examRepository
) : IRequestHandler<StartExamSessionCommand, ExamSessionResult>
{
    public async Task<ExamSessionResult> Handle(StartExamSessionCommand request, CancellationToken cancellationToken)
    {
        var exam = await examRepository.GetByIdAsync(request.ExamId)
            ?? throw new KeyNotFoundException("Không tìm thấy bài thi.");

        var existing = await sessionRepository.FindAsync(
            s => s.UserId == request.UserId && s.ExamId == request.ExamId && s.Status == "IN_PROGRESS");

        if (existing.Any())
            throw new InvalidOperationException("Người dùng đang có session chưa hoàn thành cho bài thi này.");

        var now = DateTime.UtcNow;
        var session = new ExamSession
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            ExamId = request.ExamId,
            Status = "IN_PROGRESS",
            StartedAt = now,
            TimeRemaining = exam.Duration,
            CreatedAt = now
        };

        await sessionRepository.AddAsync(session);
        await sessionRepository.SaveChangesAsync();

        return new ExamSessionResult(session.Id, session.UserId, session.ExamId, session.Status,
            session.StartedAt, session.EndedAt, session.TimeRemaining, session.DraftData, session.CreatedAt);
    }
}
