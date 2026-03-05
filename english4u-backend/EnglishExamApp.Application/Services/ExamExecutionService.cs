using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.Application.Services;

public sealed class ExamExecutionService(
    IApplicationDbContext context,
    IAiIntegrationService aiIntegrationService) : IExamExecutionService
{
    public async Task<Guid> StartSessionAsync(Guid userId, Guid examId, CancellationToken cancellationToken = default)
    {
        var exam = await context.Exams
            .AsNoTracking()
            .Where(e => e.Id == examId)
            .Select(e => new { e.Id, e.DurationMinutes })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Exam not found.");

        var session = new ExamSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ExamId = exam.Id,
            Status = "InProgress",
            StartedAt = DateTime.UtcNow,
            TimeRemaining = exam.DurationMinutes.HasValue
                ? exam.DurationMinutes.Value * 60
                : null
        };

        context.ExamSessions.Add(session);
        await context.SaveChangesAsync(cancellationToken);

        return session.Id;
    }

    public async Task AutoSaveAnswerAsync(AutoSaveAnswerDto dto, CancellationToken cancellationToken = default)
    {
        var existingAnswer = await context.UserAnswers
            .FirstOrDefaultAsync(
                a => a.SessionId == dto.SessionId && a.QuestionId == dto.QuestionId,
                cancellationToken);

        if (existingAnswer is not null)
        {
            existingAnswer.AnswerText = dto.AnswerText;
            existingAnswer.SubmittedAt = DateTime.UtcNow;
        }
        else
        {
            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = dto.SessionId,
                QuestionId = dto.QuestionId,
                AnswerText = dto.AnswerText,
                SubmittedAt = DateTime.UtcNow
            });
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<SubmitExamResultDto> SubmitExamAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (session.Status == "Submitted" || session.Status == "Scored")
            throw new InvalidOperationException("Session already submitted.");

        session.Status = "Submitted";
        session.EndedAt = DateTime.UtcNow;

        var answers = await context.UserAnswers
            .Where(a => a.SessionId == sessionId)
            .Include(a => a.Question)
                .ThenInclude(q => q!.Group)
            .Include(a => a.WritingTask)
            .ToListAsync(cancellationToken);

        double readingScore = 0;
        double listeningScore = 0;
        bool hasWriting = false;
        bool hasSpeaking = false;

        foreach (var answer in answers)
        {
            if (answer.WritingTaskId != null)
            {
                hasWriting = true;
                continue;
            }

            if (answer.Question is null) continue;

            var groupType = answer.Question.Group?.GroupType ?? "";

            if (groupType is "SPEAKING_PART_1" or "SPEAKING_PART_2" or "SPEAKING_PART_3")
            {
                hasSpeaking = true;
                continue;
            }

            var isCorrect = string.Equals(
                answer.AnswerText?.Trim(),
                answer.Question.CorrectAnswer?.Trim(),
                StringComparison.OrdinalIgnoreCase);

            answer.ScoreEarned = isCorrect ? answer.Question.Points : 0;

            if (answer.Question.Group?.PassageId != null)
                readingScore += answer.ScoreEarned;
            else if (answer.Question.Group?.ListeningPartId != null)
                listeningScore += answer.ScoreEarned;
        }

        var scoringResult = new ScoringResult
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            ReadingScore = readingScore,
            ListeningScore = listeningScore,
            ScoredAt = DateTime.UtcNow
        };

        context.ScoringResults.Add(scoringResult);
        await context.SaveChangesAsync(cancellationToken);

        if (hasWriting)
            await aiIntegrationService.ScoreWritingAsync(sessionId, cancellationToken);

        if (hasSpeaking)
            await aiIntegrationService.ScoreSpeakingAsync(sessionId, cancellationToken);

        return new SubmitExamResultDto(
            sessionId,
            readingScore,
            listeningScore,
            readingScore + listeningScore,
            hasWriting,
            hasSpeaking,
            session.Status);
    }
}
