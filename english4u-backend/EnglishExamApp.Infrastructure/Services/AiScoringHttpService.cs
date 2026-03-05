using System.Net.Http.Json;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class AiScoringHttpService(
    HttpClient httpClient,
    IApplicationDbContext context,
    ILogger<AiScoringHttpService> logger) : IAiIntegrationService
{
    public async Task ScoreWritingAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var writingAnswers = await context.UserAnswers
            .Where(a => a.SessionId == sessionId && a.WritingTaskId != null)
            .Include(a => a.WritingTask)
            .ToListAsync(cancellationToken);

        if (writingAnswers.Count == 0)
            return;

        double totalBand = 0;

        foreach (var answer in writingAnswers)
        {
            if (string.IsNullOrWhiteSpace(answer.AnswerText))
                continue;

            var request = new AiScoreWritingRequest(
                SessionId: sessionId.ToString(),
                AnswerId: answer.Id.ToString(),
                EssayText: answer.AnswerText,
                QuestionPrompt: answer.WritingTask?.PromptText);

            var response = await httpClient.PostAsJsonAsync("/api/ai/score-writing", request, cancellationToken);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<AiScoreResponse>(cancellationToken);
            if (result is null) continue;

            await SaveFeedbacks(answer.Id, result, "Writing", cancellationToken);

            answer.ScoreEarned = result.OverallBand;
            totalBand += result.OverallBand;

            logger.LogInformation(
                "Writing scored for answer {AnswerId}: band {Band}",
                answer.Id, result.OverallBand);
        }

        await UpdateScoringResult(sessionId, writingScore: totalBand / writingAnswers.Count, cancellationToken: cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task ScoreSpeakingAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var speakingAnswers = await context.UserAnswers
            .Where(a => a.SessionId == sessionId && a.Question != null && a.Question.Group.GroupType == "SPEAKING")
            .Include(a => a.Question)
            .Include(a => a.UserAudioRecords)
            .ToListAsync(cancellationToken);

        if (speakingAnswers.Count == 0)
            return;

        double totalBand = 0;
        int scoredCount = 0;

        foreach (var answer in speakingAnswers)
        {
            var audioRecord = answer.UserAudioRecords.FirstOrDefault();
            if (audioRecord is null || string.IsNullOrWhiteSpace(audioRecord.AudioUrl))
                continue;

            using var audioStream = await DownloadAudioAsync(audioRecord.AudioUrl, cancellationToken);
            if (audioStream is null) continue;

            using var formContent = new MultipartFormDataContent();
            var audioContent = new StreamContent(audioStream);
            audioContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/wav");
            formContent.Add(audioContent, "audio", "recording.wav");
            formContent.Add(new StringContent(sessionId.ToString()), "session_id");
            formContent.Add(new StringContent(answer.Id.ToString()), "answer_id");

            if (!string.IsNullOrWhiteSpace(answer.Question.Content))
                formContent.Add(new StringContent(answer.Question.Content), "question_prompt");

            var response = await httpClient.PostAsync("/api/ai/score-speaking", formContent, cancellationToken);
            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<AiScoreResponse>(cancellationToken);
            if (result is null) continue;

            await SaveFeedbacks(answer.Id, result, "Speaking", cancellationToken);

            answer.ScoreEarned = result.OverallBand;
            totalBand += result.OverallBand;
            scoredCount++;

            logger.LogInformation(
                "Speaking scored for answer {AnswerId}: band {Band}",
                answer.Id, result.OverallBand);
        }

        if (scoredCount > 0)
        {
            await UpdateScoringResult(sessionId, speakingScore: totalBand / scoredCount, cancellationToken: cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task SaveFeedbacks(Guid answerId, AiScoreResponse result, string skillType, CancellationToken cancellationToken)
    {
        foreach (var rubric in result.Rubrics)
        {
            var scoringRubric = await context.ScoringRubrics
                .FirstOrDefaultAsync(
                    r => r.SkillType == skillType && r.CriteriaName == rubric.Criteria,
                    cancellationToken);

            if (scoringRubric is null)
            {
                scoringRubric = new ScoringRubric
                {
                    Id = Guid.NewGuid(),
                    SkillType = skillType,
                    CriteriaName = rubric.Criteria,
                    MaxBand = 9.0
                };
                context.ScoringRubrics.Add(scoringRubric);
                await context.SaveChangesAsync(cancellationToken);
            }

            context.AiFeedbacks.Add(new AiFeedback
            {
                Id = Guid.NewGuid(),
                AnswerId = answerId,
                RubricId = scoringRubric.Id,
                BandScore = rubric.Band,
                AiComment = rubric.Comment,
                Improvements = rubric.Improvements
            });
        }
    }

    private async Task UpdateScoringResult(
        Guid sessionId,
        double? writingScore = null,
        double? speakingScore = null,
        CancellationToken cancellationToken = default)
    {
        var scoringResult = await context.ScoringResults
            .FirstOrDefaultAsync(r => r.SessionId == sessionId, cancellationToken);

        if (scoringResult is null) return;

        if (writingScore.HasValue)
            scoringResult.WritingScore = writingScore.Value;

        if (speakingScore.HasValue)
            scoringResult.SpeakingScore = speakingScore.Value;

        scoringResult.TotalBandScore =
            ((scoringResult.ReadingScore ?? 0) +
             (scoringResult.ListeningScore ?? 0) +
             (scoringResult.WritingScore ?? 0) +
             (scoringResult.SpeakingScore ?? 0)) / 4.0;

        var session = await context.ExamSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session is not null)
            session.Status = "Scored";
    }

    private async Task<Stream?> DownloadAudioAsync(string audioUrl, CancellationToken cancellationToken)
    {
        try
        {
            return await httpClient.GetStreamAsync(audioUrl, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to download audio from {Url}", audioUrl);
            return null;
        }
    }
}
