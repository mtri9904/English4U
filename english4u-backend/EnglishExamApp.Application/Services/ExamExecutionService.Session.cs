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
    public async Task<PracticeSessionStartDto> StartPracticeSessionAsync(
        Guid userId,
        Guid examId,
        bool forceNewAttempt = false,
        CancellationToken cancellationToken = default)
    {
        var exam = await context.Exams
            .AsNoTracking()
            .Where(item => item.Id == examId && item.IsPublished)
            .Select(item => new
            {
                item.Id,
                item.DurationMinutes,
                SkillType = item.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault()
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Practice exam not found.");

        var existingSession = await context.ExamSessions
            .Where(item => item.UserId == userId && item.ExamId == examId)
            .OrderByDescending(item => item.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (existingSession is not null && NormalizeSessionStatus(existingSession.Status) == "InProgress" && !forceNewAttempt)
        {
            return new PracticeSessionStartDto(
                existingSession.Id,
                existingSession.ExamId,
                NormalizeSkillType(exam.SkillType),
                "InProgress",
                existingSession.TimeRemaining,
                true);
        }

        if (forceNewAttempt)
        {
            var inProgressSessions = await context.ExamSessions
                .Where(item => item.UserId == userId && item.ExamId == examId && item.Status == "InProgress")
                .ToListAsync(cancellationToken);

            foreach (var inProgressSession in inProgressSessions)
            {
                inProgressSession.Status = "Abandoned";
                inProgressSession.EndedAt ??= DateTime.UtcNow;
            }
        }

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

        return new PracticeSessionStartDto(
            session.Id,
            session.ExamId,
            NormalizeSkillType(exam.SkillType),
            "InProgress",
            session.TimeRemaining,
            false);
    }

    public async Task<PracticeSessionDto?> GetPracticeSessionAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var header = await GetSessionHeaderAsync(sessionId, cancellationToken);
        if (header is null || header.UserId != userId)
        {
            return null;
        }

        var normalizedStatus = NormalizeSessionStatus(header.Status);
        var exam = await BuildPracticeSessionExamAsync(
            header.ExamId,
            requirePublished: false,
            includeCorrectAnswers: normalizedStatus == "Completed",
            cancellationToken);
        if (exam is null)
        {
            return null;
        }
        exam = AttachSpeakingPromptMedia(exam);

        var answers = await GetSessionAnswersAsync(
            sessionId,
            includeCorrectness: normalizedStatus == "Completed",
            cancellationToken);
        if (normalizedStatus == "Completed")
        {
            answers = await IncludeUnansweredObjectiveReviewAnswersAsync(header.ExamId, answers, cancellationToken);
        }
        var blueprints = FlattenObjectiveQuestions(exam);
        var writingTaskCount = CountWritingTasks(exam);
        var speakingQuestionCount = CountSpeakingQuestions(exam);
        var totalItems = blueprints.Count > 0
            ? blueprints.Count
            : writingTaskCount > 0
                ? writingTaskCount
                : speakingQuestionCount;
        PracticeSessionResultDto? result = blueprints.Count > 0
            ? await BuildPracticeSessionResultAsync(sessionId, header.ExamId, header.Status, blueprints, answers, cancellationToken)
            : writingTaskCount > 0
                ? await BuildWritingSessionResultAsync(sessionId, header.ExamId, header.Status, writingTaskCount, cancellationToken)
                : speakingQuestionCount > 0
                    ? await BuildSpeakingSessionResultAsync(sessionId, header.ExamId, header.Status, speakingQuestionCount, cancellationToken)
                    : null;
        var answerMap = answers
            .Where(answer => answer.QuestionId != Guid.Empty)
            .ToDictionary(answer => answer.QuestionId, answer => answer.AnswerText);

        return new PracticeSessionDto(
            header.SessionId,
            header.ExamId,
            header.ExamTitle,
            header.ExamDescription,
            header.ExamType,
            NormalizeSkillType(header.SkillType),
            NormalizeSessionStatus(header.Status),
            header.StartedAt,
            header.EndedAt,
            header.DurationMinutes,
            header.TimeRemaining,
            totalItems,
            CountAnsweredQuestions(answers),
            blueprints.Count > 0 ? ComputeResumeQuestionNumber(blueprints, answerMap) : null,
            exam,
            answers,
            result);
    }

    public async Task<IReadOnlyList<PracticeSessionListItemDto>> GetPracticeSessionsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var sessions = await context.ExamSessions
            .AsNoTracking()
            .Where(item => item.UserId == userId)
            .OrderByDescending(item => item.StartedAt)
            .Select(item => new
            {
                item.Id,
                item.ExamId,
                ExamTitle = item.Exam.Title,
                item.Exam.ExamType,
                SkillType = item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault(),
                item.Status,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                AnsweredQuestions = item.UserAnswers
                    .Count(answer =>
                        (answer.QuestionId != null || answer.WritingTaskId != null || answer.SpeakingQuestionId != null)
                        && ((answer.AnswerText != null && answer.AnswerText != "")
                            || answer.UserAudioRecords.Any())),
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
                WritingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.WritingScore)
                    .FirstOrDefault(),
                SpeakingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.SpeakingScore)
                    .FirstOrDefault(),
                TotalBandScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var examIds = sessions.Select(item => item.ExamId).Distinct().ToList();

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

        return sessions
            .Select(item => new PracticeSessionListItemDto(
                item.Id,
                item.ExamId,
                item.ExamTitle,
                item.ExamType,
                NormalizeSkillType(item.SkillType),
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
                item.WritingScore,
                item.SpeakingScore,
                item.TotalBandScore))
            .ToList();
    }

    public async Task<PagedResult<PracticeSessionListItemDto>> GetPagedPracticeSessionsAsync(
        Guid userId,
        PracticeSessionPagedRequest request,
        CancellationToken cancellationToken = default)
    {
        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 10 : Math.Min(request.PageSize, 50);

        var query = context.ExamSessions
            .AsNoTracking()
            .Where(item => item.UserId == userId);

        if (!string.IsNullOrWhiteSpace(request.Status) && !request.Status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var normalizedStatus = request.Status.Trim();
            query = normalizedStatus switch
            {
                "Completed" => query.Where(item => item.Status == "Completed" || item.Status == "Submitted"),
                _ => query.Where(item => item.Status == normalizedStatus),
            };
        }

        if (!string.IsNullOrWhiteSpace(request.Skill) && !request.Skill.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var normalizedSkill = request.Skill.Trim().ToUpper();
            query = query.Where(item => item.Exam.ExamSections.Any(s => s.SkillType.ToUpper() == normalizedSkill));
        }

        // Group by ExamId to get the latest StartedAt and the total attempt count per exam
        var examLatestGroupQuery = query
            .GroupBy(item => item.ExamId)
            .Select(g => new
            {
                ExamId = g.Key,
                LatestStartedAt = g.Max(item => item.StartedAt),
                AttemptCount = g.Count()
            });

        var totalCount = await examLatestGroupQuery.CountAsync(cancellationToken);
        if (totalCount == 0)
        {
            return new PagedResult<PracticeSessionListItemDto>([], 0, pageNumber, pageSize);
        }

        var pagedExamGroups = await examLatestGroupQuery
            .OrderByDescending(x => x.LatestStartedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var examIdsOnPage = pagedExamGroups.Select(x => x.ExamId).ToList();
        var attemptCountByExamId = pagedExamGroups.ToDictionary(x => x.ExamId, x => x.AttemptCount);

        var candidateSessions = await query
            .Where(item => examIdsOnPage.Contains(item.ExamId))
            .OrderByDescending(item => item.StartedAt)
            .Select(item => new
            {
                item.Id,
                item.ExamId,
                ExamTitle = item.Exam.Title,
                item.Exam.ExamType,
                SkillType = item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault(),
                item.Status,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                AnsweredQuestions = item.UserAnswers
                    .Count(answer =>
                        (answer.QuestionId != null || answer.WritingTaskId != null || answer.SpeakingQuestionId != null)
                        && ((answer.AnswerText != null && answer.AnswerText != "")
                            || answer.UserAudioRecords.Any())),
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
                WritingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.WritingScore)
                    .FirstOrDefault(),
                SpeakingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.SpeakingScore)
                    .FirstOrDefault(),
                TotalBandScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        // Deduplicate in memory to guarantee exactly 1 latest session per exam on this page
        var latestSessionByExamId = candidateSessions
            .GroupBy(item => item.ExamId)
            .ToDictionary(g => g.Key, g => g.First());

        var sessions = pagedExamGroups
            .Where(g => latestSessionByExamId.ContainsKey(g.ExamId))
            .Select(g => latestSessionByExamId[g.ExamId])
            .ToList();

        var examIds = sessions.Select(item => item.ExamId).Distinct().ToList();

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

        var items = sessions.Select(item => new PracticeSessionListItemDto(
            item.Id,
            item.ExamId,
            item.ExamTitle,
            item.ExamType,
            NormalizeSkillType(item.SkillType),
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
            item.WritingScore,
            item.SpeakingScore,
            item.TotalBandScore,
            attemptCountByExamId.GetValueOrDefault(item.ExamId, 1)))
        .ToList();

        return new PagedResult<PracticeSessionListItemDto>(items, totalCount, pageNumber, pageSize);
    }

    public async Task UpdatePracticeSessionAnswersAsync(
        Guid userId,
        Guid sessionId,
        UpdatePracticeSessionAnswersDto dto,
        CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (NormalizeSessionStatus(session.Status) != "InProgress")
        {
            throw new InvalidOperationException("Session is no longer accepting answers.");
        }

        if (dto.TimeRemaining.HasValue)
        {
            session.TimeRemaining = Math.Max(0, dto.TimeRemaining.Value);
        }

        var inputs = (dto.Answers ?? [])
            .Where(item => item.QuestionId.HasValue && item.QuestionId.Value != Guid.Empty)
            .GroupBy(item => item.QuestionId!.Value)
            .Select(group => group.Last())
            .ToList();
        var writingInputs = (dto.Answers ?? [])
            .Where(item => item.WritingTaskId.HasValue && item.WritingTaskId.Value != Guid.Empty)
            .GroupBy(item => item.WritingTaskId!.Value)
            .Select(group => group.Last())
            .ToList();
        var speakingInputs = (dto.Answers ?? [])
            .Where(item => item.SpeakingQuestionId.HasValue && item.SpeakingQuestionId.Value != Guid.Empty)
            .GroupBy(item => item.SpeakingQuestionId!.Value)
            .Select(group => group.Last())
            .ToList();

        if (inputs.Count == 0 && writingInputs.Count == 0 && speakingInputs.Count == 0)
        {
            await context.SaveChangesAsync(cancellationToken);
            return;
        }

        var questionIds = inputs.Select(item => item.QuestionId!.Value).ToList();
        var validQuestionIds = await context.Questions
            .AsNoTracking()
            .Where(question =>
                questionIds.Contains(question.Id)
                && ((question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == session.ExamId)
                    || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == session.ExamId)))
            .Select(question => question.Id)
            .ToHashSetAsync(cancellationToken);

        var writingTaskIds = writingInputs.Select(item => item.WritingTaskId!.Value).ToList();
        var validWritingTaskIds = await context.WritingTasks
            .AsNoTracking()
            .Where(task => writingTaskIds.Contains(task.Id) && task.Section.ExamId == session.ExamId)
            .Select(task => task.Id)
            .ToHashSetAsync(cancellationToken);

        var speakingQuestionIds = speakingInputs.Select(item => item.SpeakingQuestionId!.Value).ToList();
        var validSpeakingQuestionIds = await context.SpeakingQuestions
            .AsNoTracking()
            .Where(question => speakingQuestionIds.Contains(question.Id) && question.Part.Section.ExamId == session.ExamId)
            .Select(question => question.Id)
            .ToHashSetAsync(cancellationToken);

        if (validQuestionIds.Count == 0 && validWritingTaskIds.Count == 0 && validSpeakingQuestionIds.Count == 0)
        {
            await context.SaveChangesAsync(cancellationToken);
            return;
        }

        var existingAnswers = await context.UserAnswers
            .Where(answer => answer.SessionId == sessionId && answer.QuestionId != null && validQuestionIds.Contains(answer.QuestionId.Value))
            .ToDictionaryAsync(answer => answer.QuestionId!.Value, cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var input in inputs.Where(item => item.QuestionId.HasValue && validQuestionIds.Contains(item.QuestionId.Value)))
        {
            var normalizedAnswer = string.IsNullOrWhiteSpace(input.AnswerText) ? null : input.AnswerText.Trim();
            var questionId = input.QuestionId!.Value;
            if (existingAnswers.TryGetValue(questionId, out var existingAnswer))
            {
                existingAnswer.AnswerText = normalizedAnswer;
                existingAnswer.ScoreEarned = 0;
                existingAnswer.SubmittedAt = now;
                continue;
            }

            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                QuestionId = questionId,
                AnswerText = normalizedAnswer,
                ScoreEarned = 0,
                SubmittedAt = now
            });
        }

        var existingWritingAnswers = await context.UserAnswers
            .Where(answer => answer.SessionId == sessionId && answer.WritingTaskId != null && validWritingTaskIds.Contains(answer.WritingTaskId.Value))
            .ToDictionaryAsync(answer => answer.WritingTaskId!.Value, cancellationToken);

        foreach (var input in writingInputs.Where(item => item.WritingTaskId.HasValue && validWritingTaskIds.Contains(item.WritingTaskId.Value)))
        {
            var normalizedAnswer = string.IsNullOrWhiteSpace(input.AnswerText) ? null : input.AnswerText.Trim();
            var writingTaskId = input.WritingTaskId!.Value;
            if (existingWritingAnswers.TryGetValue(writingTaskId, out var existingAnswer))
            {
                existingAnswer.AnswerText = normalizedAnswer;
                existingAnswer.ScoreEarned = 0;
                existingAnswer.SubmittedAt = now;
                continue;
            }

            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                WritingTaskId = writingTaskId,
                AnswerText = normalizedAnswer,
                ScoreEarned = 0,
                SubmittedAt = now
            });
        }

        var existingSpeakingAnswers = await context.UserAnswers
            .Where(answer => answer.SessionId == sessionId && answer.SpeakingQuestionId != null && validSpeakingQuestionIds.Contains(answer.SpeakingQuestionId.Value))
            .Include(answer => answer.UserAudioRecords)
            .ToDictionaryAsync(answer => answer.SpeakingQuestionId!.Value, cancellationToken);

        foreach (var input in speakingInputs.Where(item => item.SpeakingQuestionId.HasValue && validSpeakingQuestionIds.Contains(item.SpeakingQuestionId.Value)))
        {
            var normalizedAnswer = string.IsNullOrWhiteSpace(input.AnswerText) ? null : input.AnswerText.Trim();
            var speakingQuestionId = input.SpeakingQuestionId!.Value;
            var normalizedAudioUrl = string.IsNullOrWhiteSpace(input.AudioUrl) ? null : input.AudioUrl.Trim();
            var fileSizeKb = input.FileSizeKB;

            if (!existingSpeakingAnswers.TryGetValue(speakingQuestionId, out var existingAnswer))
            {
                existingAnswer = new UserAnswer
                {
                    Id = Guid.NewGuid(),
                    SessionId = sessionId,
                    SpeakingQuestionId = speakingQuestionId,
                    AnswerText = normalizedAnswer,
                    ScoreEarned = 0,
                    SubmittedAt = now
                };
                context.UserAnswers.Add(existingAnswer);
                existingSpeakingAnswers[speakingQuestionId] = existingAnswer;
            }
            else
            {
                existingAnswer.AnswerText = normalizedAnswer;
                existingAnswer.ScoreEarned = 0;
                existingAnswer.SubmittedAt = now;
            }

            if (string.IsNullOrWhiteSpace(normalizedAudioUrl))
            {
                continue;
            }

            var audioRecord = existingAnswer.UserAudioRecords
                .OrderByDescending(record => record.DurationSeconds ?? 0)
                .ThenByDescending(record => record.Id)
                .FirstOrDefault();

            if (audioRecord is null)
            {
                audioRecord = new UserAudioRecord
                {
                    Id = Guid.NewGuid(),
                    AnswerId = existingAnswer.Id,
                };
                existingAnswer.UserAudioRecords.Add(audioRecord);
                context.UserAudioRecords.Add(audioRecord);
            }

            audioRecord.AudioUrl = normalizedAudioUrl;
            audioRecord.DurationSeconds = input.DurationSeconds;
            audioRecord.FileSizeKB = fileSizeKb;
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PracticeSessionHighlightDto>> GetPracticeSessionHighlightsAsync(
        Guid userId,
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .AsNoTracking()
            .Where(item => item.Id == sessionId && item.UserId == userId)
            .Select(item => new { item.HighlightsData })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        return NormalizePracticeSessionHighlights(ParsePracticeSessionHighlights(session.HighlightsData));
    }

    public async Task<IReadOnlyList<PracticeSessionHighlightDto>> UpdatePracticeSessionHighlightsAsync(
        Guid userId,
        Guid sessionId,
        UpdatePracticeSessionHighlightsDto dto,
        CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (NormalizeSessionStatus(session.Status) != "InProgress")
        {
            throw new InvalidOperationException("Session is no longer accepting highlights.");
        }

        var highlights = NormalizePracticeSessionHighlights(dto.Highlights);
        session.HighlightsData = highlights.Count > 0
            ? JsonSerializer.Serialize(highlights, SpeakingEvidenceJsonOptions)
            : null;

        await context.SaveChangesAsync(cancellationToken);
        return highlights;
    }

    public async Task<PracticeSessionSpeakingUploadResultDto> UploadSpeakingRecordingAsync(
        Guid userId,
        Guid sessionId,
        UploadPracticeSpeakingRecordingDto dto,
        Stream? audioStream = null,
        string? originalFileName = null,
        CancellationToken cancellationToken = default)
    {
        if (dto.SpeakingQuestionId == Guid.Empty)
        {
            throw new InvalidOperationException("SpeakingQuestionId is required.");
        }

        var session = await context.ExamSessions
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.UserAudioRecords)
                    .ThenInclude(record => record.SpeechTranscripts)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (NormalizeSessionStatus(session.Status) != "InProgress")
        {
            throw new InvalidOperationException("Session is no longer accepting speaking recordings.");
        }

        var speakingQuestion = await context.SpeakingQuestions
            .AsNoTracking()
            .Include(question => question.Part)
            .FirstOrDefaultAsync(
                question => question.Id == dto.SpeakingQuestionId && question.Part.Section.ExamId == session.ExamId,
                cancellationToken)
            ?? throw new InvalidOperationException("Speaking question not found in this session.");

        string finalAudioUrl;
        int finalFileSizeKB;

        if (!string.IsNullOrEmpty(dto.AudioUrl))
        {
            finalAudioUrl = dto.AudioUrl;
            finalFileSizeKB = dto.FileSizeKB ?? 0;
        }
        else
        {
            if (audioStream == null || string.IsNullOrEmpty(originalFileName))
            {
                throw new InvalidOperationException("Audio stream and original file name are required when audioUrl is not provided.");
            }

            var storedMedia = await speakingMediaStorageService.SaveAsync(
                sessionId,
                dto.SpeakingQuestionId,
                originalFileName,
                audioStream,
                cancellationToken);

            finalAudioUrl = storedMedia.AudioUrl;
            finalFileSizeKB = storedMedia.FileSizeKB;
        }

        var normalizedAnswer = string.IsNullOrWhiteSpace(dto.AnswerText) ? null : dto.AnswerText.Trim();
        var answer = session.UserAnswers
            .FirstOrDefault(item => item.SpeakingQuestionId == dto.SpeakingQuestionId);

        if (answer is null)
        {
            answer = new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                SpeakingQuestionId = dto.SpeakingQuestionId,
                AnswerText = normalizedAnswer,
                ScoreEarned = 0,
                SubmittedAt = DateTime.UtcNow,
            };
            context.UserAnswers.Add(answer);
            session.UserAnswers.Add(answer);
        }
        else
        {
            answer.AnswerText = normalizedAnswer;
            answer.ScoreEarned = 0;
            answer.SubmittedAt = DateTime.UtcNow;
        }

        var audioRecord = answer.UserAudioRecords
            .OrderByDescending(item => item.Id)
            .FirstOrDefault();

        if (audioRecord is null)
        {
            audioRecord = new UserAudioRecord
            {
                Id = Guid.NewGuid(),
                AnswerId = answer.Id,
            };
            answer.UserAudioRecords.Add(audioRecord);
            context.UserAudioRecords.Add(audioRecord);
        }

        audioRecord.AudioUrl = finalAudioUrl;
        audioRecord.DurationSeconds = dto.DurationSeconds;
        audioRecord.FileSizeKB = finalFileSizeKB;

        if (audioRecord.SpeechTranscripts.Count > 0)
        {
            context.SpeechTranscripts.RemoveRange(audioRecord.SpeechTranscripts);
            audioRecord.SpeechTranscripts.Clear();
        }

        string? transcriptText = null;
        var transcriptSegmentCount = 0;

        try
        {
            var transcript = await aiIntegrationService.GenerateListeningTranscriptAsync(
                new GenerateListeningTranscriptRequestDto(finalAudioUrl, "en"),
                cancellationToken);
            transcriptText = string.IsNullOrWhiteSpace(transcript.TranscriptText) ? null : transcript.TranscriptText.Trim();
            transcriptSegmentCount = transcript.SegmentCount;

            if (!string.IsNullOrWhiteSpace(transcriptText))
            {
                var speechTranscript = new SpeechTranscript
                {
                    Id = Guid.NewGuid(),
                    AudioRecordId = audioRecord.Id,
                    TranscriptText = transcriptText,
                };
                audioRecord.SpeechTranscripts.Add(speechTranscript);
                context.SpeechTranscripts.Add(speechTranscript);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Failed to generate speaking transcript for session {SessionId}, question {SpeakingQuestionId}.",
                sessionId,
                dto.SpeakingQuestionId);
        }

        var speakingAnalytics = BuildSpeakingAnalytics(
            transcriptText,
            normalizedAnswer,
            dto.DurationSeconds,
            speakingQuestion.Part.PartNumber,
            !string.IsNullOrWhiteSpace(speakingQuestion.CueCardPoints));

        await context.SaveChangesAsync(cancellationToken);

        return new PracticeSessionSpeakingUploadResultDto(
            speakingQuestion.Id,
            finalAudioUrl,
            finalFileSizeKB,
            dto.DurationSeconds,
            transcriptText,
            transcriptSegmentCount,
            normalizedAnswer,
            speakingAnalytics);
    }


    private async Task<PracticeSessionExamDto?> BuildPracticeSessionExamAsync(
        Guid examId,
        bool requirePublished,
        bool includeCorrectAnswers,
        CancellationToken cancellationToken)
    {
        return await context.Exams
            .AsNoTracking()
            .AsSplitQuery()
            .Where(item => item.Id == examId && (!requirePublished || item.IsPublished))
            .Select(item => new PracticeSessionExamDto(
                item.Id,
                item.Title,
                item.Description,
                item.DurationMinutes,
                item.ExamType,
                item.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => new PracticeSessionSectionDto(
                        section.Id,
                        section.SkillType,
                        section.Title,
                        section.OrderIndex,
                        section.ReadingPassages
                            .OrderBy(passage => passage.PassageNumber)
                            .Select(passage => new PracticeSessionReadingPassageDto(
                                passage.Id,
                                passage.PassageNumber,
                                passage.Title,
                                passage.ParagraphsData,
                                passage.AssetsData,
                                passage.QuestionGroups
                                    .OrderBy(group => group.StartQuestion ?? (group.Questions.Any() ? group.Questions.Min(question => question.QuestionNumber) : 0))
                                    .Select(group => new PracticeSessionQuestionGroupDto(
                                        group.Id,
                                        group.GroupType,
                                        group.Instruction,
                                        group.ContentData,
                                        group.AssetsData,
                                        group.StartQuestion,
                                        group.EndQuestion,
                                        group.OptionLabelType,
                                        group.Questions
                                            .OrderBy(question => question.QuestionNumber)
                                            .Select(question => new PracticeSessionQuestionDto(
                                                question.Id,
                                                question.QuestionNumber,
                                                question.Content,
                                                question.Points,
                                                includeCorrectAnswers ? BuildCorrectAnswerDisplay(question, null) : null,
                                                question.QuestionOptions
                                                    .OrderBy(option => option.OrderIndex)
                                                    .Select(option => new PracticeSessionOptionDto(
                                                        option.Id,
                                                        option.OptionText,
                                                        option.ImageUrl,
                                                        option.OrderIndex))
                                                    .ToList()))
                                            .ToList()))
                                    .ToList()))
                            .ToList(),
                        section.ListeningParts
                            .OrderBy(part => part.PartNumber)
                            .Select(part => new PracticeSessionListeningPartDto(
                                part.Id,
                                part.PartNumber,
                                part.AudioUrl,
                                part.ContextDescription,
                                part.TranscriptData,
                                part.QuestionGroups
                                    .OrderBy(group => group.StartQuestion ?? (group.Questions.Any() ? group.Questions.Min(question => question.QuestionNumber) : 0))
                                    .Select(group => new PracticeSessionQuestionGroupDto(
                                        group.Id,
                                        group.GroupType,
                                        group.Instruction,
                                        group.ContentData,
                                        group.AssetsData,
                                        group.StartQuestion,
                                        group.EndQuestion,
                                        group.OptionLabelType,
                                        group.Questions
                                            .OrderBy(question => question.QuestionNumber)
                                            .Select(question => new PracticeSessionQuestionDto(
                                                question.Id,
                                                question.QuestionNumber,
                                                question.Content,
                                                question.Points,
                                                includeCorrectAnswers ? BuildCorrectAnswerDisplay(question, null) : null,
                                                question.QuestionOptions
                                                    .OrderBy(option => option.OrderIndex)
                                                    .Select(option => new PracticeSessionOptionDto(
                                                        option.Id,
                                                        option.OptionText,
                                                        option.ImageUrl,
                                                        option.OrderIndex))
                                                    .ToList()))
                                            .ToList()))
                                    .ToList()))
                            .ToList(),
                        section.WritingTasks
                            .OrderBy(task => task.TaskNumber)
                            .Select(task => new PracticeSessionWritingTaskDto(
                                task.Id,
                                task.TaskNumber,
                                task.PromptText,
                                task.AssetsData,
                                task.MinWords))
                            .ToList(),
                        section.SpeakingParts
                            .OrderBy(part => part.PartNumber)
                            .Select(part => new PracticeSessionSpeakingPartDto(
                                part.Id,
                                part.PartNumber,
                                part.Description,
                                part.SpeakingQuestions
                                    .OrderBy(question => question.OrderIndex)
                                    .Select(question => new PracticeSessionSpeakingQuestionDto(
                                        question.Id,
                                        question.Content,
                                        question.CueCardPoints,
                                        question.AudioPromptUrl,
                                        question.OrderIndex,
                                        null,
                                        null))
                                    .ToList()))
                            .ToList()))
                    .ToList()))
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static List<ObjectiveQuestionBlueprint> FlattenObjectiveQuestions(PracticeSessionExamDto exam)
    {
        return exam.Sections
            .SelectMany(section =>
            {
                var readingQuestions = section.ReadingPassages
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions.Select(question => new ObjectiveQuestionBlueprint(
                        question.Id,
                        question.QuestionNumber,
                        question.Points,
                        group.GroupType,
                        "READING")));

                var listeningQuestions = section.ListeningParts
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions.Select(question => new ObjectiveQuestionBlueprint(
                        question.Id,
                        question.QuestionNumber,
                        question.Points,
                        group.GroupType,
                        "LISTENING")));

                return readingQuestions.Concat(listeningQuestions);
            })
            .OrderBy(question => question.QuestionNumber)
            .ThenBy(question => question.QuestionId)
            .ToList();
    }

    private static int CountWritingTasks(PracticeSessionExamDto exam) =>
        exam.Sections.SelectMany(section => section.WritingTasks).Count();

    private static int CountSpeakingQuestions(PracticeSessionExamDto exam) =>
        exam.Sections.SelectMany(section => section.SpeakingParts).SelectMany(part => part.Questions).Count();


    private async Task<List<PracticeSessionAnswerDto>> GetSessionAnswersAsync(
        Guid sessionId,
        bool includeCorrectness,
        CancellationToken cancellationToken)
    {
        var sessionExamId = await context.ExamSessions
            .AsNoTracking()
            .Where(item => item.Id == sessionId)
            .Select(item => (Guid?)item.ExamId)
            .FirstOrDefaultAsync(cancellationToken);
        var chooseNCorrectTokensByQuestionId = includeCorrectness && sessionExamId.HasValue
            ? await GetChooseNCorrectTokensByQuestionIdAsync(sessionExamId.Value, cancellationToken)
            : [];

        var answers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.QuestionId != null)
            .Include(item => item.Question)
                .ThenInclude(question => question!.Group)
            .Include(item => item.Question)
                .ThenInclude(question => question!.QuestionOptions)
            .OrderBy(item => item.Question!.QuestionNumber)
            .ToListAsync(cancellationToken);

        var objectiveAnswers = answers
            .Where(item => item.Question is not null)
            .Select(item =>
            {
                var questionId = item.QuestionId!.Value;
                var chooseNCorrectTokens = chooseNCorrectTokensByQuestionId.TryGetValue(questionId, out var tokens)
                    ? tokens
                    : null;

                return new PracticeSessionAnswerDto(
                    questionId,
                    null,
                    item.Question!.QuestionNumber,
                    null,
                    item.Question.Group?.GroupType,
                    item.AnswerText,
                    includeCorrectness ? BuildCorrectAnswerDisplay(item.Question, chooseNCorrectTokens) : null,
                    item.ScoreEarned,
                    includeCorrectness ? IsAnswerCorrect(item.AnswerText, item.Question, chooseNCorrectTokens) : null);
            })
            .ToList();

        var writingAnswers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.WritingTaskId != null)
            .Include(item => item.WritingTask)
            .Include(item => item.AiFeedbacks)
                .ThenInclude(feedback => feedback.Rubric)
            .OrderBy(item => item.WritingTask!.TaskNumber)
            .ToListAsync(cancellationToken);

        var writingAnswerDtos = writingAnswers
            .Select(item => new PracticeSessionAnswerDto(
                Guid.Empty,
                item.WritingTaskId,
                null,
                item.WritingTask!.TaskNumber,
                "WRITING_TASK",
                item.AnswerText,
                null,
                item.ScoreEarned,
                null,
                item.AiFeedbacks
                    .OrderBy(feedback => feedback.Rubric.CriteriaName)
                    .Select(feedback => new PracticeSessionFeedbackDto(
                        feedback.Rubric.CriteriaName ?? string.Empty,
                        feedback.BandScore,
                        feedback.AiComment,
                        feedback.Improvements,
                        feedback.ConfidenceScore,
                        DeserializeFeedbackEvidence(feedback.EvidenceData)))
                    .ToList()))
            .ToList();

        var speakingAnswers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.SpeakingQuestionId != null)
            .Include(item => item.SpeakingQuestion)
                .ThenInclude(question => question!.Part)
            .Include(item => item.UserAudioRecords)
                .ThenInclude(record => record.SpeechTranscripts)
            .Include(item => item.AiFeedbacks)
                .ThenInclude(feedback => feedback.Rubric)
            .OrderBy(item => item.SpeakingQuestion!.Part.PartNumber)
            .ThenBy(item => item.SpeakingQuestion!.OrderIndex)
            .ToListAsync(cancellationToken);

        var speakingAnswerDtos = speakingAnswers
            .Select(item =>
            {
                var audioRecord = item.UserAudioRecords
                    .OrderByDescending(record => record.DurationSeconds ?? 0)
                    .ThenByDescending(record => record.Id)
                    .FirstOrDefault();
                var speechTranscript = audioRecord?.SpeechTranscripts
                    .OrderByDescending(transcript => transcript.Id)
                    .FirstOrDefault(transcript => !string.IsNullOrWhiteSpace(transcript.TranscriptText))
                    ?? audioRecord?.SpeechTranscripts
                        .OrderByDescending(transcript => transcript.Id)
                        .FirstOrDefault();
                var transcriptText = speechTranscript?.TranscriptText;
                var speakingAnalytics = BuildSpeakingAnalytics(
                    transcriptText,
                    item.AnswerText,
                    audioRecord?.DurationSeconds,
                    item.SpeakingQuestion?.Part.PartNumber,
                    !string.IsNullOrWhiteSpace(item.SpeakingQuestion?.CueCardPoints),
                    speechTranscript,
                    audioRecord);

                return new PracticeSessionAnswerDto(
                    Guid.Empty,
                    null,
                    null,
                    null,
                    "SPEAKING_PROMPT",
                    item.AnswerText,
                    null,
                    item.ScoreEarned,
                    null,
                    item.AiFeedbacks
                        .OrderBy(feedback => feedback.Rubric.CriteriaName)
                        .Select(feedback => new PracticeSessionFeedbackDto(
                            feedback.Rubric.CriteriaName ?? string.Empty,
                            feedback.BandScore,
                            feedback.AiComment,
                            feedback.Improvements,
                            feedback.ConfidenceScore,
                            DeserializeFeedbackEvidence(feedback.EvidenceData)))
                        .ToList(),
                    item.SpeakingQuestionId,
                    item.SpeakingQuestion?.OrderIndex,
                    item.SpeakingQuestion?.Part.PartNumber,
                    audioRecord?.AudioUrl,
                    audioRecord?.DurationSeconds,
                    transcriptText,
                    speakingAnalytics);
            })
            .ToList();

        return objectiveAnswers.Concat(writingAnswerDtos).Concat(speakingAnswerDtos).ToList();
    }

    private async Task<List<PracticeSessionAnswerDto>> IncludeUnansweredObjectiveReviewAnswersAsync(
        Guid examId,
        List<PracticeSessionAnswerDto> answers,
        CancellationToken cancellationToken)
    {
        var existingQuestionIds = answers
            .Where(answer => answer.QuestionId != Guid.Empty)
            .Select(answer => answer.QuestionId)
            .ToHashSet();

        var unansweredQuestions = await context.Questions
            .AsNoTracking()
            .Where(question =>
                ((question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == examId)
                    || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == examId))
                && !existingQuestionIds.Contains(question.Id))
            .Include(question => question.Group)
            .Include(question => question.QuestionOptions)
            .OrderBy(question => question.QuestionNumber)
            .ToListAsync(cancellationToken);

        if (unansweredQuestions.Count == 0)
        {
            return answers;
        }

        var chooseNCorrectTokensByQuestionId = await GetChooseNCorrectTokensByQuestionIdAsync(examId, cancellationToken);
        var unansweredAnswerDtos = unansweredQuestions
            .Select(question => new PracticeSessionAnswerDto(
                question.Id,
                null,
                question.QuestionNumber,
                null,
                question.Group?.GroupType,
                null,
                BuildCorrectAnswerDisplay(
                    question,
                    chooseNCorrectTokensByQuestionId.TryGetValue(question.Id, out var correctTokens)
                        ? correctTokens
                        : null),
                0,
                false))
            .ToList();

        return answers
            .Concat(unansweredAnswerDtos)
            .OrderBy(answer => answer.QuestionNumber ?? int.MaxValue)
            .ToList();
    }

}
