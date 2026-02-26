using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.ExamSessions.Commands.SubmitAnswer;

public class SubmitAnswerCommandHandler(
    IGenericRepository<ExamSession> sessionRepository,
    IGenericRepository<UserAnswer> answerRepository
) : IRequestHandler<SubmitAnswerCommand, bool>
{
    public async Task<bool> Handle(SubmitAnswerCommand request, CancellationToken cancellationToken)
    {
        var session = await sessionRepository.GetByIdAsync(request.SessionId)
            ?? throw new KeyNotFoundException("Không tìm thấy session.");

        if (session.Status != "IN_PROGRESS")
            throw new InvalidOperationException("Session đã kết thúc, không thể nộp thêm câu trả lời.");

        var existingAnswers = await answerRepository.FindAsync(
            a => a.SessionId == request.SessionId && a.QuestionId == request.QuestionId);

        var existing = existingAnswers.FirstOrDefault();

        if (existing is not null)
        {
            existing.AnswerText = request.AnswerText;
            existing.AudioUrl = request.AudioUrl;
            existing.IsAutoSaved = true;
            existing.SubmittedAt = DateTime.UtcNow;
            answerRepository.Update(existing);
        }
        else
        {
            var answer = new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = request.SessionId,
                QuestionId = request.QuestionId,
                AnswerText = request.AnswerText,
                AudioUrl = request.AudioUrl,
                IsAutoSaved = true,
                SubmittedAt = DateTime.UtcNow
            };
            await answerRepository.AddAsync(answer);
        }

        await answerRepository.SaveChangesAsync();
        return true;
    }
}
