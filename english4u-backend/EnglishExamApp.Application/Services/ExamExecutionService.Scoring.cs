using EnglishExamApp.Application.DTOs.Common;
using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace EnglishExamApp.Application.Services;

public sealed partial class ExamExecutionService
{
    public async Task<PracticeSessionResultDto> SubmitReadingListeningAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .AsSplitQuery()
            .Include(item => item.Exam)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.Group)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.QuestionOptions)
            .Include(item => item.ScoringResults)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (IsFinalizedStatus(session.Status))
        {
            var blueprints = await GetObjectiveQuestionBlueprintsAsync(session.ExamId, cancellationToken);
            var answers = await GetSessionAnswersAsync(sessionId, includeCorrectness: true, cancellationToken);
            return await BuildPracticeSessionResultAsync(sessionId, session.ExamId, session.Status, blueprints, answers, cancellationToken)
                ?? new PracticeSessionResultDto(sessionId, 0, 0, 0, 0, blueprints.Count, CountAnsweredQuestions(answers), 0, 0, NormalizeSessionStatus(session.Status));
        }

        var result = await GradeSessionAsync(session, cancellationToken);
        return result;
    }

    public async Task<PracticeSessionResultDto> SubmitWritingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .Include(item => item.UserAnswers)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        var writingTasks = await context.WritingTasks
            .AsNoTracking()
            .Where(task => task.Section.ExamId == session.ExamId)
            .OrderBy(task => task.TaskNumber)
            .Select(task => new { task.Id, task.TaskNumber })
            .ToListAsync(cancellationToken);

        if (writingTasks.Count == 0)
        {
            throw new InvalidOperationException("Session này không có Writing Task.");
        }

        if (NormalizeSessionStatus(session.Status) == "Completed")
        {
            return await BuildWritingSessionResultAsync(sessionId, session.ExamId, session.Status, writingTasks.Count, cancellationToken);
        }

        var answersByTaskId = session.UserAnswers
            .Where(answer => answer.WritingTaskId != null)
            .ToDictionary(answer => answer.WritingTaskId!.Value);

        var invalidTaskNumbers = writingTasks
            .Where(task =>
                !answersByTaskId.TryGetValue(task.Id, out var answer)
                || CountWords(answer.AnswerText) < WritingSubmitMinWords)
            .Select(task => task.TaskNumber?.ToString() ?? task.Id.ToString())
            .ToList();

        if (invalidTaskNumbers.Count > 0)
        {
            throw new InvalidOperationException($"Mỗi Writing Task cần tối thiểu {WritingSubmitMinWords} từ trước khi nộp. Task chưa đạt: {string.Join(", ", invalidTaskNumbers)}.");
        }

        if (NormalizeSessionStatus(session.Status) != "Submitted")
        {
            session.Status = "Submitted";
            session.EndedAt = DateTime.UtcNow;
            session.TimeRemaining = Math.Max(0, session.TimeRemaining ?? 0);
            await context.SaveChangesAsync(cancellationToken);
        }

        try
        {
            await aiIntegrationService.ScoreWritingAsync(sessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Writing AI scoring failed for session {SessionId}. Submission was saved.", sessionId);
            throw new InvalidOperationException($"Bài Writing đã được lưu nhưng chấm AI thất bại: {ex.Message}");
        }

        var result = await BuildWritingSessionResultAsync(sessionId, session.ExamId, session.Status, writingTasks.Count, cancellationToken);
        return await AttachRewardIfCompletedAsync(session, result, cancellationToken);
    }

    public async Task<PracticeSessionResultDto> SubmitSpeakingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.UserAudioRecords)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        var speakingQuestionCount = await context.SpeakingQuestions
            .AsNoTracking()
            .Where(question => question.Part.Section.ExamId == session.ExamId)
            .CountAsync(cancellationToken);

        if (speakingQuestionCount == 0)
        {
            throw new InvalidOperationException("Session này không có Speaking prompt.");
        }

        if (NormalizeSessionStatus(session.Status) == "Completed")
        {
            return await BuildSpeakingSessionResultAsync(sessionId, session.ExamId, session.Status, speakingQuestionCount, cancellationToken);
        }

        if (NormalizeSessionStatus(session.Status) != "Submitted")
        {
            session.Status = "Submitted";
            session.EndedAt = DateTime.UtcNow;
            session.TimeRemaining = Math.Max(0, session.TimeRemaining ?? 0);
            await context.SaveChangesAsync(cancellationToken);
        }

        try
        {
            await aiIntegrationService.ScoreSpeakingAsync(sessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Speaking AI scoring failed for session {SessionId}. Submission was saved.", sessionId);
            throw new InvalidOperationException($"Bài Speaking đã được lưu nhưng chấm AI thất bại: {ex.Message}");
        }

        if (NormalizeSessionStatus(session.Status) == "Submitted")
        {
            session.Status = "Completed";
            await context.SaveChangesAsync(cancellationToken);
        }

        var result = await BuildSpeakingSessionResultAsync(sessionId, session.ExamId, session.Status, speakingQuestionCount, cancellationToken);
        return await AttachRewardIfCompletedAsync(session, result, cancellationToken);
    }

    public async Task<PracticeSessionResultDto> RescoreSpeakingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        var speakingQuestionCount = await context.SpeakingQuestions
            .AsNoTracking()
            .Where(question => question.Part.Section.ExamId == session.ExamId)
            .CountAsync(cancellationToken);

        if (speakingQuestionCount == 0)
        {
            throw new InvalidOperationException("Session này không có Speaking prompt.");
        }

        if (NormalizeSessionStatus(session.Status) == "InProgress")
        {
            throw new InvalidOperationException("Cần nộp Speaking trước khi chấm lại.");
        }

        var answerIds = await context.UserAnswers
            .Where(a => a.SessionId == sessionId && a.SpeakingQuestionId != null)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        var existingFeedbacks = await context.AiFeedbacks
            .Where(f => answerIds.Contains(f.AnswerId))
            .ToListAsync(cancellationToken);

        if (existingFeedbacks.Count > 0)
        {
            context.AiFeedbacks.RemoveRange(existingFeedbacks);
            await context.SaveChangesAsync(cancellationToken);
            if (context is DbContext dbContext)
            {
                dbContext.ChangeTracker.Clear();
            }
        }

        try
        {
            await aiIntegrationService.ScoreSpeakingAsync(sessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Speaking AI rescoring failed for session {SessionId}.", sessionId);
            throw new InvalidOperationException($"Chấm lại Speaking thất bại: {ex.Message}");
        }

        if (NormalizeSessionStatus(session.Status) == "Submitted")
        {
            session.Status = "Completed";
            await context.SaveChangesAsync(cancellationToken);
        }

        return await BuildSpeakingSessionResultAsync(sessionId, session.ExamId, session.Status, speakingQuestionCount, cancellationToken);
    }

    private async Task<PracticeSessionResultDto> BuildWritingSessionResultAsync(
        Guid sessionId,
        Guid examId,
        string? status,
        int writingTaskCount,
        CancellationToken cancellationToken)
    {
        var submittedAnswerCount = await context.UserAnswers
            .AsNoTracking()
            .CountAsync(
                answer => answer.SessionId == sessionId
                    && answer.WritingTaskId != null
                    && !string.IsNullOrWhiteSpace(answer.AnswerText),
                cancellationToken);

        var scoringResult = await context.ScoringResults
            .AsNoTracking()
            .Where(result => result.SessionId == sessionId)
            .OrderByDescending(result => result.ScoredAt)
            .FirstOrDefaultAsync(cancellationToken);

        var sessionStatus = await context.ExamSessions
            .AsNoTracking()
            .Where(session => session.Id == sessionId)
            .Select(session => session.Status)
            .FirstOrDefaultAsync(cancellationToken);

        return new PracticeSessionResultDto(
            sessionId,
            null,
            null,
            0,
            0,
            writingTaskCount,
            submittedAnswerCount,
            0,
            0,
            NormalizeSessionStatus(sessionStatus ?? status),
            WritingScore: scoringResult?.WritingScore,
            OverallFeedback: scoringResult?.OverallFeedback,
            TotalBandScore: scoringResult?.TotalBandScore);
    }

    private async Task<PracticeSessionResultDto> BuildSpeakingSessionResultAsync(
        Guid sessionId,
        Guid examId,
        string? status,
        int speakingQuestionCount,
        CancellationToken cancellationToken)
    {
        var speakingAnswers = await GetSessionAnswersAsync(sessionId, includeCorrectness: false, cancellationToken);
        var filteredSpeakingAnswers = speakingAnswers
            .Where(answer => answer.SpeakingQuestionId.HasValue)
            .ToList();

        var scoringResult = await context.ScoringResults
            .AsNoTracking()
            .Where(result => result.SessionId == sessionId)
            .OrderByDescending(result => result.ScoredAt)
            .FirstOrDefaultAsync(cancellationToken);

        var sessionStatus = await context.ExamSessions
            .AsNoTracking()
            .Where(currentSession => currentSession.Id == sessionId)
            .Select(currentSession => currentSession.Status)
            .FirstOrDefaultAsync(cancellationToken);

        return new PracticeSessionResultDto(
            sessionId,
            null,
            null,
            0,
            0,
            speakingQuestionCount,
            CountAnsweredQuestions(filteredSpeakingAnswers),
            0,
            0,
            NormalizeSessionStatus(sessionStatus ?? status),
            OverallFeedback: scoringResult?.OverallFeedback,
            SpeakingScore: scoringResult?.SpeakingScore,
            TotalBandScore: scoringResult?.TotalBandScore);
    }


    private async Task<PracticeSessionResultDto> GradeSessionAsync(ExamSession session, CancellationToken cancellationToken)
    {
        var normalizedStatus = NormalizeSessionStatus(session.Status);
        if (normalizedStatus == "Completed")
        {
            throw new InvalidOperationException("Session already submitted.");
        }

        session.Status = "Submitted";
        session.EndedAt = DateTime.UtcNow;

        var objectiveQuestions = await context.Questions
            .AsNoTracking()
            .Where(question =>
                (question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == session.ExamId)
                || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == session.ExamId))
            .OrderBy(question => question.QuestionNumber)
            .Select(question => new ObjectiveQuestionBlueprint(
                question.Id,
                question.QuestionNumber,
                question.Points,
                question.Group.GroupType,
                question.Group.PassageId != null ? "READING" : "LISTENING"))
            .ToListAsync(cancellationToken);

        await ReallocateChooseNAnswersAsync(session, objectiveQuestions, cancellationToken);

        var answersByQuestionId = session.UserAnswers
            .Where(answer => answer.QuestionId != null && answer.Question is not null)
            .ToDictionary(answer => answer.QuestionId!.Value);
        var chooseNCorrectTokensByQuestionId = await GetChooseNCorrectTokensByQuestionIdAsync(session.ExamId, cancellationToken);

        double readingRawScore = 0;
        double listeningRawScore = 0;
        var correctQuestions = 0;

        foreach (var answer in answersByQuestionId.Values)
        {
            if (answer.Question is null)
            {
                continue;
            }

            var isCorrect = IsAnswerCorrect(
                answer.AnswerText,
                answer.Question,
                chooseNCorrectTokensByQuestionId.TryGetValue(answer.QuestionId!.Value, out var correctTokens)
                    ? correctTokens
                    : null);
            answer.ScoreEarned = isCorrect ? answer.Question.Points : 0;

            if (isCorrect)
            {
                correctQuestions += 1;
            }

            if (answer.Question.Group?.PassageId != null)
            {
                readingRawScore += answer.ScoreEarned;
            }
            else if (answer.Question.Group?.ListeningPartId != null)
            {
                listeningRawScore += answer.ScoreEarned;
            }
        }

        var scoringResult = session.ScoringResults
            .OrderByDescending(item => item.ScoredAt)
            .FirstOrDefault();

        if (scoringResult is null)
        {
            scoringResult = new ScoringResult
            {
                Id = Guid.NewGuid(),
                SessionId = session.Id,
            };
            context.ScoringResults.Add(scoringResult);
        }

        var readingMaxScore = CalculateMaxScore(objectiveQuestions, "READING");
        var listeningMaxScore = CalculateMaxScore(objectiveQuestions, "LISTENING");
        var isGeneralTrainingReading = IsGeneralTrainingReadingExam(
            session.Exam.ExamType,
            session.Exam.Title,
            session.Exam.Description);

        scoringResult.ReadingScore = IeltsScoringCalculator.CalculateReadingBand(
            readingRawScore,
            readingMaxScore,
            isGeneralTrainingReading);
        scoringResult.ListeningScore = IeltsScoringCalculator.CalculateListeningBand(
            listeningRawScore,
            listeningMaxScore);
        scoringResult.TotalBandScore = IeltsScoringCalculator.CalculateOverallBand(
            scoringResult.ReadingScore,
            scoringResult.ListeningScore,
            scoringResult.WritingScore,
            scoringResult.SpeakingScore);
        scoringResult.ScoredAt = DateTime.UtcNow;

        session.Status = "Completed";
        await context.SaveChangesAsync(cancellationToken);

        var answerDtos = answersByQuestionId.Values
            .Where(answer => answer.QuestionId != null)
            .Select(answer =>
            {
                var questionId = answer.QuestionId!.Value;
                var chooseNCorrectTokens = chooseNCorrectTokensByQuestionId.TryGetValue(questionId, out var tokens)
                    ? tokens
                    : null;

                return new PracticeSessionAnswerDto(
                    questionId,
                    null,
                    answer.Question?.QuestionNumber,
                    null,
                    answer.Question?.Group?.GroupType,
                    answer.AnswerText,
                    answer.Question is not null ? BuildCorrectAnswerDisplay(answer.Question, chooseNCorrectTokens) : null,
                    answer.ScoreEarned,
                    answer.Question is not null ? IsAnswerCorrect(answer.AnswerText, answer.Question, chooseNCorrectTokens) : null);
            })
            .OrderBy(answer => answer.QuestionNumber)
            .ToList();

        var result = await BuildPracticeSessionResultAsync(
            session.Id,
            session.ExamId,
            session.Status,
            objectiveQuestions,
            answerDtos,
            cancellationToken);

        if (result is null)
        {
            result = new PracticeSessionResultDto(
                session.Id,
                scoringResult.ReadingScore,
                scoringResult.ListeningScore,
                readingRawScore + listeningRawScore,
                objectiveQuestions.Sum(item => item.Points),
                objectiveQuestions.Count,
                CountAnsweredQuestions(answerDtos),
                correctQuestions,
                objectiveQuestions.Count == 0 ? 0 : Math.Round(correctQuestions * 100d / objectiveQuestions.Count, 1),
                NormalizeSessionStatus(session.Status),
                TotalBandScore: scoringResult.TotalBandScore);
        }

        return await AttachRewardIfCompletedAsync(session, result, cancellationToken);
    }


    private async Task<List<ObjectiveQuestionBlueprint>> GetObjectiveQuestionBlueprintsAsync(Guid examId, CancellationToken cancellationToken)
    {
        return await context.Questions
            .AsNoTracking()
            .Where(question =>
                (question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == examId)
                || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == examId))
            .OrderBy(question => question.QuestionNumber)
            .Select(question => new ObjectiveQuestionBlueprint(
                question.Id,
                question.QuestionNumber,
                question.Points,
                question.Group.GroupType,
                question.Group.PassageId != null ? "READING" : "LISTENING"))
            .ToListAsync(cancellationToken);
    }

    private async Task<Dictionary<Guid, List<string>>> GetChooseNCorrectTokensByQuestionIdAsync(
        Guid examId,
        CancellationToken cancellationToken)
    {
        var rows = await context.Questions
            .AsNoTracking()
            .Where(question =>
                question.Group.GroupType != null
                && question.Group.GroupType.Trim().ToUpper() == "MCQ_CHOOSE_N"
                && ((question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == examId)
                    || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == examId)))
            .Select(question => new
            {
                question.Id,
                question.GroupId,
                question.QuestionNumber,
                question.CorrectAnswer,
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(item => item.GroupId)
            .Where(group => group.Count() > 1)
            .SelectMany(group =>
            {
                var orderedQuestions = group
                    .OrderBy(item => item.QuestionNumber ?? int.MaxValue)
                    .ThenBy(item => item.Id)
                    .ToList();
                var groupTokens = orderedQuestions
                    .SelectMany(item => BuildNormalizedAnswerTokenList(item.CorrectAnswer))
                    .ToList();

                return orderedQuestions.Select((item, index) =>
                {
                    var questionTokens = BuildNormalizedAnswerTokenList(item.CorrectAnswer);
                    var resolvedTokens = questionTokens.Count > 1 && questionTokens.Count > index
                        ? new List<string> { questionTokens[index] }
                        : questionTokens.Count == 1
                            ? questionTokens
                            : groupTokens.Count > index
                                ? new List<string> { groupTokens[index] }
                                : questionTokens;

                    return new { item.Id, Tokens = resolvedTokens };
                });
            })
            .Where(item => item.Tokens.Count > 0)
            .ToDictionary(item => item.Id, item => item.Tokens);
    }


    private async Task<ExamScoringProfile?> GetExamScoringProfileAsync(Guid examId, CancellationToken cancellationToken) =>
        await context.Exams
            .AsNoTracking()
            .Where(exam => exam.Id == examId)
            .Select(exam => new ExamScoringProfile(exam.ExamType, exam.Title, exam.Description))
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<PracticeSessionResultDto?> BuildPracticeSessionResultAsync(
        Guid sessionId,
        Guid examId,
        string? status,
        IReadOnlyList<ObjectiveQuestionBlueprint> blueprints,
        IReadOnlyList<PracticeSessionAnswerDto> answers,
        CancellationToken cancellationToken)
    {
        var scoringResult = await context.ScoringResults
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId)
            .OrderByDescending(item => item.ScoredAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (scoringResult is null && answers.Count == 0)
        {
            return null;
        }

        var answeredQuestions = CountAnsweredQuestions(answers);
        var correctQuestions = answers.Count(answer => answer.IsCorrect == true);
        var totalQuestions = blueprints.Count;
        var maxAutoScore = blueprints.Sum(item => item.Points);
        var readingRawScore = CalculateRawScore(answers, blueprints, "READING");
        var listeningRawScore = CalculateRawScore(answers, blueprints, "LISTENING");
        var totalAutoScore = readingRawScore + listeningRawScore;
        var readingMaxScore = CalculateMaxScore(blueprints, "READING");
        var listeningMaxScore = CalculateMaxScore(blueprints, "LISTENING");
        var shouldCalculateBands = scoringResult is not null || NormalizeSessionStatus(status) == "Completed";
        var profile = shouldCalculateBands
            ? await GetExamScoringProfileAsync(examId, cancellationToken)
            : null;
        var readingBandScore = scoringResult?.ReadingScore
            ?? (shouldCalculateBands
                ? IeltsScoringCalculator.CalculateReadingBand(
                    readingRawScore,
                    readingMaxScore,
                    IsGeneralTrainingReadingExam(profile))
                : null);
        var listeningBandScore = scoringResult?.ListeningScore
            ?? (shouldCalculateBands
                ? IeltsScoringCalculator.CalculateListeningBand(listeningRawScore, listeningMaxScore)
                : null);
        var totalBandScore = scoringResult?.TotalBandScore
            ?? (shouldCalculateBands
                ? IeltsScoringCalculator.CalculateOverallBand(
                    readingBandScore,
                    listeningBandScore,
                    scoringResult?.WritingScore,
                    scoringResult?.SpeakingScore)
                : null);

        return new PracticeSessionResultDto(
            sessionId,
            readingBandScore,
            listeningBandScore,
            totalAutoScore,
            maxAutoScore,
            totalQuestions,
            answeredQuestions,
            correctQuestions,
            totalQuestions == 0 ? 0 : Math.Round(correctQuestions * 100d / totalQuestions, 1),
            NormalizeSessionStatus(status),
            scoringResult?.WritingScore,
            scoringResult?.OverallFeedback,
            scoringResult?.SpeakingScore,
            totalBandScore);
    }

    private static int CountAnsweredQuestions(IReadOnlyList<PracticeSessionAnswerDto> answers) =>
        answers.Count(HasAnswerContent);

    private async Task<PracticeSessionResultDto> AttachRewardIfCompletedAsync(
        ExamSession session,
        PracticeSessionResultDto result,
        CancellationToken cancellationToken)
    {
        if (NormalizeSessionStatus(result.Status) != "Completed")
        {
            return result;
        }

        var reward = await ApplyRewardAsync(session, result, cancellationToken);
        return result with { Reward = reward };
    }

    private async Task<PracticeSessionRewardDto> ApplyRewardAsync(
        ExamSession session,
        PracticeSessionResultDto result,
        CancellationToken cancellationToken)
    {
        var user = await context.Users
            .FirstOrDefaultAsync(item => item.Id == session.UserId, cancellationToken)
            ?? throw new InvalidOperationException("User not found.");

        var hasPriorCompletedAttempt = await context.ExamSessions
            .AsNoTracking()
            .AnyAsync(
                item =>
                    item.Id != session.Id
                    && item.UserId == session.UserId
                    && item.ExamId == session.ExamId
                    && (item.Status == "Completed" || item.Status == "Scored"),
                cancellationToken);

        UpdateDailyStreak(user, DateTime.UtcNow);
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);

        return new PracticeSessionRewardDto(
            0,
            !hasPriorCompletedAttempt,
            false,
            0,
            1,
            0,
            0,
            0,
            0,
            user.DailyStreakCount,
            user.LongestStreakCount);
    }

    private static void UpdateDailyStreak(User user, DateTime activityAtUtc)
    {
        var activityDate = VietnamDateTimeFormatter.ToVietnamDate(activityAtUtc);
        var lastActivityDate = VietnamDateTimeFormatter.ToVietnamDate(user.LastActivityAt);

        if (lastActivityDate == activityDate)
        {
            user.DailyStreakCount = Math.Max(1, user.DailyStreakCount);
        }
        else if (lastActivityDate.HasValue && lastActivityDate.Value.AddDays(1) == activityDate)
        {
            user.DailyStreakCount = Math.Max(1, user.DailyStreakCount) + 1;
        }
        else
        {
            user.DailyStreakCount = 1;
        }

        user.LongestStreakCount = Math.Max(user.LongestStreakCount, user.DailyStreakCount);
        user.LastActivityAt = activityAtUtc;
    }

    private static int? ComputeResumeQuestionNumber(
        IReadOnlyList<ObjectiveQuestionBlueprint> blueprints,
        IReadOnlyDictionary<Guid, string?> answerMap)
    {
        foreach (var question in blueprints)
        {
            if (!answerMap.TryGetValue(question.QuestionId, out var answerText) || string.IsNullOrWhiteSpace(answerText))
            {
                return question.QuestionNumber;
            }
        }

        return blueprints.LastOrDefault()?.QuestionNumber;
    }

    private async Task ReallocateChooseNAnswersAsync(
        ExamSession session,
        List<ObjectiveQuestionBlueprint> blueprints,
        CancellationToken cancellationToken)
    {
        var chooseNBlueprints = blueprints
            .Where(b => IsChooseNGroupType(b.GroupType))
            .ToList();

        if (chooseNBlueprints.Count == 0)
        {
            return;
        }

        var chooseNQuestionIds = chooseNBlueprints.Select(b => b.QuestionId).ToHashSet();
        var chooseNQuestions = await context.Questions
            .Include(q => q.Group)
            .Where(q => chooseNQuestionIds.Contains(q.Id))
            .ToListAsync(cancellationToken);

        var chooseNAnswers = session.UserAnswers
            .Where(ua => ua.QuestionId != null && chooseNQuestionIds.Contains(ua.QuestionId.Value))
            .ToList();

        var answersByQuestionId = chooseNAnswers.ToDictionary(ua => ua.QuestionId!.Value);

        foreach (var q in chooseNQuestions)
        {
            if (!answersByQuestionId.ContainsKey(q.Id))
            {
                var newAnswer = new UserAnswer
                {
                    Id = Guid.NewGuid(),
                    SessionId = session.Id,
                    QuestionId = q.Id,
                    Question = q,
                    AnswerText = null,
                    SubmittedAt = DateTime.UtcNow
                };
                session.UserAnswers.Add(newAnswer);
                context.UserAnswers.Add(newAnswer);
                chooseNAnswers.Add(newAnswer);
            }
            else
            {
                var existing = answersByQuestionId[q.Id];
                if (existing.Question == null)
                {
                    existing.Question = q;
                }
            }
        }

        var chooseNCorrectTokensByQuestionId = await GetChooseNCorrectTokensByQuestionIdAsync(session.ExamId, cancellationToken);
        var answersByGroupId = chooseNAnswers
            .Where(ua => ua.Question != null)
            .GroupBy(ua => ua.Question!.GroupId)
            .ToList();

        foreach (var group in answersByGroupId)
        {
            var answersInGroup = group.ToList();
            var questionsInGroup = answersInGroup
                .Select(ua => ua.Question)
                .OfType<Question>()
                .DistinctBy(q => q.Id)
                .OrderBy(q => (q.QuestionNumber ?? int.MaxValue))
                .ThenBy(q => q.Id)
                .ToList();

            if (questionsInGroup.Count == 0)
            {
                continue;
            }

            var submittedTokens = answersInGroup
                .SelectMany(a => BuildDiscreteAnswerTokenSet(a.AnswerText ?? string.Empty))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var groupCorrectTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var correctTokensByQuestion = new Dictionary<Guid, List<string>>();

            foreach (var q in questionsInGroup)
            {
                var tokens = BuildChooseNQuestionCorrectTokens(q, chooseNCorrectTokensByQuestionId.TryGetValue(q.Id, out var ct) ? ct : null);
                correctTokensByQuestion[q.Id] = tokens;
                foreach (var token in tokens)
                {
                    groupCorrectTokens.Add(token);
                }
            }

            var matchedTokens = submittedTokens
                .Intersect(groupCorrectTokens, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var unmatchedTokens = submittedTokens
                .Except(matchedTokens, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var assignedQuestionIds = new HashSet<Guid>();

            foreach (var matchedToken in matchedTokens)
            {
                var targetQuestion = questionsInGroup
                    .FirstOrDefault(q => !assignedQuestionIds.Contains(q.Id)
                        && correctTokensByQuestion.TryGetValue(q.Id, out var tokens)
                        && tokens != null
                        && tokens.Contains(matchedToken, StringComparer.OrdinalIgnoreCase));

                if (targetQuestion != null)
                {
                    var answerObj = answersInGroup.First(a => a.QuestionId == targetQuestion.Id);
                    answerObj.AnswerText = matchedToken;
                    assignedQuestionIds.Add(targetQuestion.Id);
                }
            }

            var unassignedQuestions = questionsInGroup.Where(q => !assignedQuestionIds.Contains(q.Id)).ToList();
            for (int i = 0; i < unassignedQuestions.Count; i++)
            {
                var targetQuestion = unassignedQuestions[i];
                var answerObj = answersInGroup.First(a => a.QuestionId == targetQuestion.Id);

                if (i < unmatchedTokens.Count)
                {
                    answerObj.AnswerText = unmatchedTokens[i];
                }
                else
                {
                    answerObj.AnswerText = null;
                }
            }
        }
    }
}
