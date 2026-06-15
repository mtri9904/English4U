using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace EnglishExamApp.Application.Services;

public sealed partial class ExamExecutionService(
    IApplicationDbContext context,
    IAiIntegrationService aiIntegrationService,
    ISpeakingMediaStorageService speakingMediaStorageService,
    ILogger<ExamExecutionService> logger) : IExamExecutionService
{
    public async Task<Guid> StartSessionAsync(Guid userId, Guid examId, CancellationToken cancellationToken = default)
    {
        var session = await StartPracticeSessionAsync(userId, examId, cancellationToken: cancellationToken);
        return session.SessionId;
    }

    public async Task AutoSaveAnswerAsync(AutoSaveAnswerDto dto, CancellationToken cancellationToken = default)
    {
        var existingAnswer = await context.UserAnswers
            .FirstOrDefaultAsync(
                answer => answer.SessionId == dto.SessionId && answer.QuestionId == dto.QuestionId,
                cancellationToken);

        var normalizedAnswer = string.IsNullOrWhiteSpace(dto.AnswerText) ? null : dto.AnswerText.Trim();
        if (existingAnswer is not null)
        {
            existingAnswer.AnswerText = normalizedAnswer;
            existingAnswer.ScoreEarned = 0;
            existingAnswer.SubmittedAt = DateTime.UtcNow;
        }
        else
        {
            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = dto.SessionId,
                QuestionId = dto.QuestionId,
                AnswerText = normalizedAnswer,
                SubmittedAt = DateTime.UtcNow
            });
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<SubmitExamResultDto> SubmitExamAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .AsSplitQuery()
            .Include(item => item.Exam)
            .Include(item => item.ScoringResults)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.Group)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.QuestionOptions)
            .FirstOrDefaultAsync(item => item.Id == sessionId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (IsFinalizedStatus(session.Status))
        {
            throw new InvalidOperationException("Session already submitted.");
        }

        var result = await GradeSessionAsync(session, cancellationToken);

        return new SubmitExamResultDto(
            sessionId,
            result.ReadingScore ?? 0,
            result.ListeningScore ?? 0,
            result.TotalAutoScore,
            false,
            false,
            result.Status,
            result.TotalBandScore);
    }

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
                TotalQuestions =
                    item.Exam.ExamSections
                        .SelectMany(section => section.ReadingPassages)
                        .SelectMany(passage => passage.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.ListeningParts)
                        .SelectMany(part => part.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.WritingTasks)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.SpeakingParts)
                        .SelectMany(part => part.SpeakingQuestions)
                        .Count(),
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
                item.TotalQuestions,
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
                TotalQuestions =
                    item.Exam.ExamSections
                        .SelectMany(section => section.ReadingPassages)
                        .SelectMany(passage => passage.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.ListeningParts)
                        .SelectMany(part => part.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.WritingTasks)
                        .Count(),
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
                item.TotalQuestions,
                item.AnsweredQuestions,
                item.ResumeQuestionNumber,
                item.ReadingScore,
                item.ListeningScore,
                item.TotalAutoScore,
                item.TotalBandScore))
            .ToList();
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

        var previousProgress = UserGamificationCalculator.BuildProgress(user.ExperiencePoints);
        var hasPriorCompletedAttempt = await context.ExamSessions
            .AsNoTracking()
            .AnyAsync(
                item =>
                    item.Id != session.Id
                    && item.UserId == session.UserId
                    && item.ExamId == session.ExamId
                    && (item.Status == "Completed" || item.Status == "Scored"),
                cancellationToken);

        var experienceAwarded = hasPriorCompletedAttempt
            ? 0
            : UserGamificationCalculator.CalculateExperienceReward(result.TotalBandScore, result.AccuracyPercent);

        if (experienceAwarded > 0)
        {
            user.ExperiencePoints += experienceAwarded;
        }

        UpdateDailyStreak(user, DateTime.UtcNow);
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);

        var currentProgress = UserGamificationCalculator.BuildProgress(user.ExperiencePoints);
        return new PracticeSessionRewardDto(
            experienceAwarded,
            !hasPriorCompletedAttempt,
            currentProgress.CurrentLevel > previousProgress.CurrentLevel,
            currentProgress.ExperiencePoints,
            currentProgress.CurrentLevel,
            currentProgress.CurrentLevelStartExperience,
            currentProgress.NextLevelExperience,
            currentProgress.ExperienceToNextLevel,
            currentProgress.LevelProgressPercent,
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
}
