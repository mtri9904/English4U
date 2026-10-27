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
    public async Task<IReadOnlyList<AdminAttemptListItemDto>> GetAdminAttemptsAsync(
        AdminAttemptQueryDto query,
        CancellationToken cancellationToken = default)
    {
        var attemptsQuery = context.ExamSessions
            .AsNoTracking()
            .Select(item => new
            {
                item.Id,
                item.ExamId,
                item.UserId,
                ExamTitle = item.Exam.Title,
                item.Exam.ExamType,
                SkillType = item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault(),
                UserDisplayName = item.User.DisplayName ?? item.User.Email,
                UserEmail = item.User.Email,
                item.Status,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                AnsweredQuestions = item.UserAnswers
                    .Count(answer => (answer.QuestionId != null || answer.WritingTaskId != null) && answer.AnswerText != null && answer.AnswerText != ""),
                ResumeQuestionNumber = item.UserAnswers
                    .Where(answer => answer.QuestionId != null && answer.AnswerText != null && answer.AnswerText != "")
                    .Select(answer => answer.Question!.QuestionNumber)
                    .OrderByDescending(questionNumber => questionNumber)
                    .FirstOrDefault(),
                ReadingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ReadingScore)
                    .FirstOrDefault(),
                ListeningScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ListeningScore)
                    .FirstOrDefault(),
                TotalAutoScore = item.UserAnswers
                    .Where(answer => answer.QuestionId != null)
                    .Sum(answer => (double?)answer.ScoreEarned) ?? 0,
                TotalBandScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault()
            })
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLowerInvariant();
            attemptsQuery = attemptsQuery.Where(item =>
                item.ExamTitle.ToLower().Contains(search)
                || item.UserDisplayName.ToLower().Contains(search)
                || item.UserEmail.ToLower().Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var normalizedStatus = query.Status.Trim();
            attemptsQuery = normalizedStatus switch
            {
                "Completed" => attemptsQuery.Where(item => item.Status == "Completed" || item.Status == "Scored"),
                "NotStarted" => attemptsQuery.Where(_ => false),
                _ => attemptsQuery.Where(item => item.Status == normalizedStatus),
            };
        }

        var attempts = await attemptsQuery
            .OrderByDescending(item => item.StartedAt)
            .ToListAsync(cancellationToken);

        var examIds = attempts.Select(item => item.ExamId).Distinct().ToList();

        var readingCounts = examIds.Count > 0
            ? await context.Questions
                .AsNoTracking()
                .Where(q => q.Group.Passage != null && examIds.Contains(q.Group.Passage.Section.ExamId))
                .GroupBy(q => q.Group.Passage!.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var listeningCounts = examIds.Count > 0
            ? await context.Questions
                .AsNoTracking()
                .Where(q => q.Group.ListeningPart != null && examIds.Contains(q.Group.ListeningPart.Section.ExamId))
                .GroupBy(q => q.Group.ListeningPart!.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var writingCounts = examIds.Count > 0
            ? await context.WritingTasks
                .AsNoTracking()
                .Where(w => examIds.Contains(w.Section.ExamId))
                .GroupBy(w => w.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var speakingCounts = examIds.Count > 0
            ? await context.SpeakingQuestions
                .AsNoTracking()
                .Where(s => examIds.Contains(s.Part.Section.ExamId))
                .GroupBy(s => s.Part.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        return attempts
            .Select(item => new AdminAttemptListItemDto(
                item.Id,
                item.ExamId,
                item.UserId,
                item.ExamTitle,
                item.ExamType,
                NormalizeSkillType(item.SkillType),
                item.UserDisplayName,
                item.UserEmail,
                NormalizeSessionStatus(item.Status),
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                readingCounts.GetValueOrDefault(item.ExamId, 0)
                    + listeningCounts.GetValueOrDefault(item.ExamId, 0)
                    + writingCounts.GetValueOrDefault(item.ExamId, 0)
                    + speakingCounts.GetValueOrDefault(item.ExamId, 0),
                item.AnsweredQuestions,
                item.ResumeQuestionNumber,
                item.ReadingScore,
                item.ListeningScore,
                item.TotalAutoScore,
                item.TotalBandScore))
            .ToList();
    }

    public async Task<PagedResult<AdminAttemptListItemDto>> GetPagedAdminAttemptsAsync(
        AdminAttemptQueryDto query,
        CancellationToken cancellationToken = default)
    {
        var pageNumber = query.PageNumber <= 0 ? 1 : query.PageNumber;
        var pageSize = query.PageSize <= 0 ? 10 : Math.Min(query.PageSize, 100);

        var attemptsQuery = context.ExamSessions
            .AsNoTracking()
            .Select(item => new
            {
                item.Id,
                item.ExamId,
                item.UserId,
                ExamTitle = item.Exam.Title,
                item.Exam.ExamType,
                SkillType = item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault(),
                UserDisplayName = item.User.DisplayName ?? item.User.Email,
                UserEmail = item.User.Email,
                item.Status,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                AnsweredQuestions = item.UserAnswers
                    .Count(answer => (answer.QuestionId != null || answer.WritingTaskId != null) && answer.AnswerText != null && answer.AnswerText != ""),
                ResumeQuestionNumber = item.UserAnswers
                    .Where(answer => answer.QuestionId != null && answer.AnswerText != null && answer.AnswerText != "")
                    .Select(answer => answer.Question!.QuestionNumber)
                    .OrderByDescending(questionNumber => questionNumber)
                    .FirstOrDefault(),
                ReadingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ReadingScore)
                    .FirstOrDefault(),
                ListeningScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ListeningScore)
                    .FirstOrDefault(),
                TotalAutoScore = item.UserAnswers
                    .Where(answer => answer.QuestionId != null)
                    .Sum(answer => (double?)answer.ScoreEarned) ?? 0,
                TotalBandScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault()
            })
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLowerInvariant();
            attemptsQuery = attemptsQuery.Where(item =>
                item.ExamTitle.ToLower().Contains(search)
                || item.UserDisplayName.ToLower().Contains(search)
                || item.UserEmail.ToLower().Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Status) && !query.Status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var normalizedStatus = query.Status.Trim();
            attemptsQuery = normalizedStatus switch
            {
                "Completed" => attemptsQuery.Where(item => item.Status == "Completed" || item.Status == "Scored"),
                "NotStarted" => attemptsQuery.Where(_ => false),
                _ => attemptsQuery.Where(item => item.Status == normalizedStatus),
            };
        }

        var totalCount = await attemptsQuery.CountAsync(cancellationToken);
        if (totalCount == 0)
        {
            return new PagedResult<AdminAttemptListItemDto>([], 0, pageNumber, pageSize);
        }

        var attempts = await attemptsQuery
            .OrderByDescending(item => item.StartedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var examIds = attempts.Select(item => item.ExamId).Distinct().ToList();

        var readingCounts = examIds.Count > 0
            ? await context.Questions
                .AsNoTracking()
                .Where(q => q.Group.Passage != null && examIds.Contains(q.Group.Passage.Section.ExamId))
                .GroupBy(q => q.Group.Passage!.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var listeningCounts = examIds.Count > 0
            ? await context.Questions
                .AsNoTracking()
                .Where(q => q.Group.ListeningPart != null && examIds.Contains(q.Group.ListeningPart.Section.ExamId))
                .GroupBy(q => q.Group.ListeningPart!.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var writingCounts = examIds.Count > 0
            ? await context.WritingTasks
                .AsNoTracking()
                .Where(w => examIds.Contains(w.Section.ExamId))
                .GroupBy(w => w.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var speakingCounts = examIds.Count > 0
            ? await context.SpeakingQuestions
                .AsNoTracking()
                .Where(s => examIds.Contains(s.Part.Section.ExamId))
                .GroupBy(s => s.Part.Section.ExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken)
            : new Dictionary<Guid, int>();

        var items = attempts.Select(item => new AdminAttemptListItemDto(
            item.Id,
            item.ExamId,
            item.UserId,
            item.ExamTitle,
            item.ExamType,
            NormalizeSkillType(item.SkillType),
            item.UserDisplayName,
            item.UserEmail,
            NormalizeSessionStatus(item.Status),
            item.StartedAt,
            item.EndedAt,
            item.TimeRemaining,
            readingCounts.GetValueOrDefault(item.ExamId, 0)
                + listeningCounts.GetValueOrDefault(item.ExamId, 0)
                + writingCounts.GetValueOrDefault(item.ExamId, 0)
                + speakingCounts.GetValueOrDefault(item.ExamId, 0),
            item.AnsweredQuestions,
            item.ResumeQuestionNumber,
            item.ReadingScore,
            item.ListeningScore,
            item.TotalAutoScore,
            item.TotalBandScore))
        .ToList();

        return new PagedResult<AdminAttemptListItemDto>(items, totalCount, pageNumber, pageSize);
    }

    public async Task<AdminAttemptDetailDto?> GetAdminAttemptDetailAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var header = await GetSessionHeaderAsync(sessionId, cancellationToken);
        if (header is null)
        {
            return null;
        }

        var answers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.QuestionId != null)
            .Include(item => item.Question)
                .ThenInclude(question => question!.Group)
            .Include(item => item.Question)
                .ThenInclude(question => question!.QuestionOptions)
            .OrderBy(item => item.Question!.QuestionNumber)
            .ToListAsync(cancellationToken);

        var blueprints = await GetObjectiveQuestionBlueprintsAsync(header.ExamId, cancellationToken);
        var chooseNCorrectTokensByQuestionId = await GetChooseNCorrectTokensByQuestionIdAsync(header.ExamId, cancellationToken);
        var answerDtos = answers
            .Where(item => item.Question is not null)
            .Select(item =>
            {
                var questionId = item.QuestionId!.Value;
                var chooseNCorrectTokens = chooseNCorrectTokensByQuestionId.TryGetValue(questionId, out var tokens)
                    ? tokens
                    : null;

                return new AdminAttemptAnswerDto(
                    questionId,
                    item.Question!.QuestionNumber,
                    item.Question.Group?.GroupType,
                    item.Question.Content,
                    item.AnswerText,
                    item.ScoreEarned,
                    NormalizeSessionStatus(header.Status) == "Completed"
                        ? IsAnswerCorrect(item.AnswerText, item.Question, chooseNCorrectTokens)
                        : null);
            })
            .ToList();

        var practiceAnswers = answerDtos
            .Select(item => new PracticeSessionAnswerDto(
                item.QuestionId,
                null,
                item.QuestionNumber,
                null,
                item.GroupType,
                item.SubmittedAnswer,
                null,
                item.ScoreEarned,
                item.IsCorrect))
            .ToList();

        var result = await BuildPracticeSessionResultAsync(
            sessionId,
            header.ExamId,
            header.Status,
            blueprints,
            practiceAnswers,
            cancellationToken);

        var answerMap = practiceAnswers.ToDictionary(item => item.QuestionId, item => item.AnswerText);

        return new AdminAttemptDetailDto(
            header.SessionId,
            header.ExamId,
            header.UserId,
            header.ExamTitle,
            header.ExamType,
            NormalizeSkillType(header.SkillType),
            await GetUserDisplayNameAsync(header.UserId, cancellationToken),
            await GetUserEmailAsync(header.UserId, cancellationToken),
            NormalizeSessionStatus(header.Status),
            header.StartedAt,
            header.EndedAt,
            header.TimeRemaining,
            blueprints.Count,
            CountAnsweredQuestions(practiceAnswers),
            ComputeResumeQuestionNumber(blueprints, answerMap),
            result,
            answerDtos);
    }


    private async Task<SessionHeader?> GetSessionHeaderAsync(Guid sessionId, CancellationToken cancellationToken)
    {
        return await context.ExamSessions
            .AsNoTracking()
            .Where(item => item.Id == sessionId)
            .Select(item => new SessionHeader(
                item.Id,
                item.UserId,
                item.ExamId,
                item.Exam.Title,
                item.Exam.Description,
                item.Exam.ExamType,
                item.Exam.DurationMinutes,
                item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault() ?? string.Empty,
                item.Status ?? string.Empty,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                item.Exam.IsPublished))
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<string> GetUserDisplayNameAsync(Guid userId, CancellationToken cancellationToken)
    {
        var profile = await context.Users
            .AsNoTracking()
            .Where(item => item.Id == userId)
            .Select(item => new { item.DisplayName, item.Email })
            .FirstAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(profile.DisplayName) ? profile.Email : profile.DisplayName!;
    }

    private async Task<string> GetUserEmailAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await context.Users
            .AsNoTracking()
            .Where(item => item.Id == userId)
            .Select(item => item.Email)
            .FirstAsync(cancellationToken);
    }

}
