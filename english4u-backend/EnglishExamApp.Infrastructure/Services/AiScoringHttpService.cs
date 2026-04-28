using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class AiScoringHttpService(
    HttpClient httpClient,
    IApplicationDbContext context,
    IConfiguration configuration,
    ILogger<AiScoringHttpService> logger) : IAiIntegrationService
{
    private const int MaxWritingTaskImages = 2;
    private const int DefaultMaxImageBytes = 1_500_000;
    private const string DefaultGeminiScoringModel = "gemini-2.5-flash-lite";
    private const string StableGeminiScoringFallbackModel = "gemini-2.5-flash";
    private const string DefaultFeedbackTranslationModel = "gemma-3-4b-it";
    private const string StableFeedbackTranslationFallbackModel = "gemma-3-12b-it";
    private const int DefaultGeminiMaxAttemptsPerModel = 3;
    private const int DefaultGeminiRetryBaseDelayMs = 1_200;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static readonly string[] WritingCriteria =
    [
        "Task Achievement/Response",
        "Coherence and Cohesion",
        "Lexical Resource",
        "Grammatical Range and Accuracy"
    ];

    private static readonly string[] SpeakingCriteria =
    [
        "Fluency and Coherence",
        "Lexical Resource",
        "Grammatical Range and Accuracy",
        "Pronunciation"
    ];

    private readonly string _geminiApiKey = FirstNonEmpty(
        configuration["GeminiScoring:ApiKey"],
        configuration["GEMINI_API_KEY"],
        configuration["GemmaExamGeneration:ApiKey"]);

    private readonly string _geminiBaseUrl = FirstNonEmpty(
        configuration["GeminiScoring:BaseUrl"],
        "https://generativelanguage.googleapis.com").TrimEnd('/');

    private readonly double _geminiTemperature =
        configuration.GetValue<double?>("GeminiScoring:Temperature") ?? 0.1d;

    private readonly int _maxImageBytes =
        configuration.GetValue<int?>("GeminiScoring:MaxImageBytes") ?? DefaultMaxImageBytes;

    private readonly int _geminiMaxAttemptsPerModel = Math.Clamp(
        configuration.GetValue<int?>("GeminiScoring:MaxAttemptsPerModel") ?? DefaultGeminiMaxAttemptsPerModel,
        1,
        5);

    private readonly int _geminiRetryBaseDelayMs = Math.Clamp(
        configuration.GetValue<int?>("GeminiScoring:RetryBaseDelayMs") ?? DefaultGeminiRetryBaseDelayMs,
        250,
        10_000);

    private readonly string[] _geminiScoringModelCandidates = BuildGeminiModelCandidates(
        configuration,
        "Model",
        "FallbackModels",
        DefaultGeminiScoringModel,
        StableGeminiScoringFallbackModel);

    private readonly string[] _feedbackTranslationModelCandidates = BuildGeminiModelCandidates(
        configuration,
        "FeedbackTranslationModel",
        "FeedbackTranslationFallbackModels",
        DefaultFeedbackTranslationModel,
        StableFeedbackTranslationFallbackModel,
        StableGeminiScoringFallbackModel);

    public async Task ScoreWritingAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var writingAnswers = await context.UserAnswers
            .Where(a => a.SessionId == sessionId && a.WritingTaskId != null)
            .Include(a => a.WritingTask)
            .ToListAsync(cancellationToken);

        if (writingAnswers.Count == 0)
            return;

        var scoredItems = new List<(UserAnswer Answer, AiScoreResponse Result, int Weight)>();

        foreach (var answer in writingAnswers)
        {
            if (string.IsNullOrWhiteSpace(answer.AnswerText))
                continue;

            var result = await RequestGeminiWritingScoreAsync(sessionId, answer, cancellationToken);
            if (result is null)
                continue;

            result = NormalizeWritingScoreResponse(sessionId, answer.Id, result);
            result = await EnsureVietnameseWritingFeedbackAsync(sessionId, answer.Id, result, cancellationToken);

            await SaveFeedbacks(answer.Id, result, "Writing", cancellationToken);

            answer.ScoreEarned = result.OverallBand;
            scoredItems.Add((answer, result, answer.WritingTask?.TaskNumber == 2 ? 2 : 1));

            logger.LogInformation(
                "Writing scored for answer {AnswerId}: band {Band}",
                answer.Id, result.OverallBand);
        }

        if (scoredItems.Count == 0)
        {
            return;
        }

        var weightedScore = RoundIeltsBand(
            scoredItems.Sum(item => item.Result.OverallBand * item.Weight) /
            scoredItems.Sum(item => item.Weight));

        await UpdateScoringResult(
            sessionId,
            writingScore: weightedScore,
            overallFeedback: BuildWritingOverallFeedbackPayload(weightedScore, scoredItems),
            cancellationToken: cancellationToken);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task ScoreSpeakingAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var examId = await context.ExamSessions
            .AsNoTracking()
            .Where(session => session.Id == sessionId)
            .Select(session => (Guid?)session.ExamId)
            .FirstOrDefaultAsync(cancellationToken);

        if (examId is null)
            return;

        var speakingQuestions = await context.SpeakingQuestions
            .Where(question => question.Part.Section.ExamId == examId.Value)
            .Include(question => question.Part)
            .OrderBy(question => question.Part.PartNumber)
            .ThenBy(question => question.OrderIndex)
            .ToListAsync(cancellationToken);

        if (speakingQuestions.Count == 0)
            return;

        var speakingAnswers = await context.UserAnswers
            .Where(a => a.SessionId == sessionId && a.SpeakingQuestionId != null)
            .Include(a => a.SpeakingQuestion)
                .ThenInclude(question => question!.Part)
            .Include(a => a.UserAudioRecords)
                .ThenInclude(record => record.SpeechTranscripts)
            .ToListAsync(cancellationToken);

        var answersByQuestionId = speakingAnswers
            .Where(answer => answer.SpeakingQuestionId.HasValue)
            .GroupBy(answer => answer.SpeakingQuestionId!.Value)
            .ToDictionary(
                group => group.Key,
                group => group.OrderByDescending(answer => answer.SubmittedAt).First());

        foreach (var question in speakingQuestions)
        {
            if (answersByQuestionId.ContainsKey(question.Id))
                continue;

            var answer = new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                SpeakingQuestionId = question.Id,
                SpeakingQuestion = question,
                ScoreEarned = 0,
                SubmittedAt = DateTime.UtcNow,
            };

            context.UserAnswers.Add(answer);
            answersByQuestionId[question.Id] = answer;
        }

        var scoredItems = new List<(UserAnswer Answer, AiScoreResponse Result, int PartNumber)>();

        foreach (var question in speakingQuestions)
        {
            var answer = answersByQuestionId[question.Id];
            answer.SpeakingQuestion ??= question;
            var questionPartNumber = question.Part.PartNumber ?? 0;

            var audioRecord = answer.UserAudioRecords
                .OrderByDescending(record => record.DurationSeconds ?? 0)
                .ThenByDescending(record => record.Id)
                .FirstOrDefault();
            if (audioRecord is null || string.IsNullOrWhiteSpace(audioRecord.AudioUrl))
            {
                var noResponseResult = BuildNoResponseSpeakingScoreResponse(sessionId, answer.Id, audioRecord?.DurationSeconds);
                await SaveFeedbacks(answer.Id, noResponseResult, "Speaking", cancellationToken);
                answer.ScoreEarned = noResponseResult.OverallBand;
                scoredItems.Add((answer, noResponseResult, questionPartNumber));

                logger.LogInformation(
                    "Speaking answer {AnswerId} scored as no response because no audio was submitted.",
                    answer.Id);

                continue;
            }

            using var formContent = new MultipartFormDataContent();
            Stream? audioStream = null;
            try
            {
                formContent.Add(new StringContent(sessionId.ToString()), "session_id");
                formContent.Add(new StringContent(answer.Id.ToString()), "answer_id");

                var questionPrompt = answer.SpeakingQuestion?.Content;
                if (!string.IsNullOrWhiteSpace(questionPrompt))
                    formContent.Add(new StringContent(questionPrompt), "question_prompt");

                if (questionPartNumber > 0)
                    formContent.Add(new StringContent(questionPartNumber.ToString(CultureInfo.InvariantCulture)), "part_number");

                var promptType = GetSpeakingPromptType(questionPartNumber, answer.SpeakingQuestion);
                formContent.Add(new StringContent(promptType), "prompt_type");

                var targetDurationSeconds = GetSpeakingTargetDurationSeconds(questionPartNumber, promptType);
                if (targetDurationSeconds.HasValue)
                {
                    formContent.Add(
                        new StringContent(targetDurationSeconds.Value.ToString(CultureInfo.InvariantCulture)),
                        "target_duration_seconds");
                }

                if (audioRecord.DurationSeconds is double durationSeconds)
                {
                    formContent.Add(
                        new StringContent(durationSeconds.ToString("0.###", CultureInfo.InvariantCulture)),
                        "duration_seconds");
                }

                var transcriptText = audioRecord.SpeechTranscripts
                    .OrderByDescending(transcript => transcript.Id)
                    .Select(transcript => transcript.TranscriptText)
                    .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));

                if (!string.IsNullOrWhiteSpace(transcriptText))
                {
                    formContent.Add(new StringContent(transcriptText), "transcript_text");
                }

                audioStream = await DownloadAudioAsync(audioRecord.AudioUrl, cancellationToken);
                if (audioStream is not null)
                {
                    var audioContent = new StreamContent(audioStream);
                    var audioFileName = GetAudioFileName(audioRecord.AudioUrl);
                    audioContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(
                        GetAudioContentType(audioFileName));
                    formContent.Add(audioContent, "audio", audioFileName);
                }
                else if (string.IsNullOrWhiteSpace(transcriptText))
                {
                    continue;
                }

                using var response = await httpClient.PostAsync("/api/ai/score-speaking", formContent, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                    var detail = ExtractAiServiceErrorDetail(errorBody);
                    throw new InvalidOperationException(
                        string.IsNullOrWhiteSpace(detail)
                            ? $"AI speaking scoring failed with status {(int)response.StatusCode}."
                            : detail);
                }

                var result = await response.Content.ReadFromJsonAsync<AiScoreResponse>(cancellationToken);
                if (result is null) continue;
                result = NormalizeSpeakingScoreResponse(sessionId, answer.Id, result);

                SpeechTranscript? evidenceTranscript = null;
                if (!string.IsNullOrWhiteSpace(result.TranscriptText))
                {
                    var existingTranscript = audioRecord.SpeechTranscripts
                        .OrderByDescending(transcript => transcript.Id)
                        .FirstOrDefault();

                    if (existingTranscript is null)
                    {
                        existingTranscript = new SpeechTranscript
                        {
                            Id = Guid.NewGuid(),
                            AudioRecordId = audioRecord.Id,
                        };
                        context.SpeechTranscripts.Add(existingTranscript);
                        audioRecord.SpeechTranscripts.Add(existingTranscript);
                    }

                    existingTranscript.TranscriptText = result.TranscriptText.Trim();
                    evidenceTranscript = existingTranscript;
                }

                if (result.SpeakingEvidence is not null)
                {
                    audioRecord.SpeechRatio = result.SpeakingEvidence.SpeechRatio;
                    audioRecord.AudioQualityData = result.SpeakingEvidence.AudioQuality is not null
                        ? JsonSerializer.Serialize(result.SpeakingEvidence.AudioQuality, JsonOptions)
                        : null;

                    evidenceTranscript ??= audioRecord.SpeechTranscripts
                        .OrderByDescending(transcript => transcript.Id)
                        .FirstOrDefault();

                    if (evidenceTranscript is null)
                    {
                        evidenceTranscript = new SpeechTranscript
                        {
                            Id = Guid.NewGuid(),
                            AudioRecordId = audioRecord.Id,
                            TranscriptText = string.IsNullOrWhiteSpace(result.TranscriptText)
                                ? null
                                : result.TranscriptText.Trim(),
                        };
                        context.SpeechTranscripts.Add(evidenceTranscript);
                        audioRecord.SpeechTranscripts.Add(evidenceTranscript);
                    }

                    evidenceTranscript.ConfidenceScore = result.SpeakingEvidence.AsrConfidence;
                    evidenceTranscript.WordTimestampsData = result.SpeakingEvidence.WordTimestamps is { Count: > 0 }
                        ? JsonSerializer.Serialize(result.SpeakingEvidence.WordTimestamps, JsonOptions)
                        : null;
                    evidenceTranscript.PauseStatsData = result.SpeakingEvidence.PauseStats is not null
                        ? JsonSerializer.Serialize(result.SpeakingEvidence.PauseStats, JsonOptions)
                        : null;

                    await SavePhonemeAnalyses(
                        evidenceTranscript,
                        result.SpeakingEvidence.PronunciationAnalysis,
                        cancellationToken);
                }

                await SaveFeedbacks(answer.Id, result, "Speaking", cancellationToken);

                answer.ScoreEarned = result.OverallBand;
                scoredItems.Add((answer, result, questionPartNumber));

                logger.LogInformation(
                    "Speaking scored for answer {AnswerId}: band {Band}",
                    answer.Id, result.OverallBand);
            }
            finally
            {
                audioStream?.Dispose();
            }
        }

        if (scoredItems.Count > 0)
        {
            var sessionLevelResult = await TryRequestSpeakingSessionScoreAsync(
                sessionId,
                scoredItems,
                cancellationToken);

            await UpdateScoringResult(
                sessionId,
                speakingScore: sessionLevelResult?.OverallBand ?? BuildSpeakingOverallBand(scoredItems),
                overallFeedback: !string.IsNullOrWhiteSpace(sessionLevelResult?.OverallFeedback)
                    ? sessionLevelResult.OverallFeedback
                    : BuildSpeakingOverallFeedbackPayload(scoredItems),
                cancellationToken: cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task<AiScoreResponse?> TryRequestSpeakingSessionScoreAsync(
        Guid sessionId,
        IReadOnlyList<(UserAnswer Answer, AiScoreResponse Result, int PartNumber)> scoredItems,
        CancellationToken cancellationToken)
    {
        if (scoredItems.Count == 0)
            return null;

        var request = new AiScoreSpeakingSessionRequest(
            sessionId.ToString(),
            scoredItems.Select(item =>
            {
                var question = item.Answer.SpeakingQuestion;
                var promptType = GetSpeakingPromptType(item.PartNumber, question);
                var audioRecord = item.Answer.UserAudioRecords
                    .OrderByDescending(record => record.DurationSeconds ?? 0)
                    .ThenByDescending(record => record.Id)
                    .FirstOrDefault();
                var transcriptText = !string.IsNullOrWhiteSpace(item.Result.TranscriptText)
                    ? item.Result.TranscriptText
                    : audioRecord?.SpeechTranscripts
                        .OrderByDescending(transcript => transcript.Id)
                        .Select(transcript => transcript.TranscriptText)
                        .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));

                return new AiScoreSpeakingSessionAnswer(
                    item.Answer.Id.ToString(),
                    question?.Content,
                    transcriptText,
                    item.PartNumber > 0 ? item.PartNumber : null,
                    promptType,
                    audioRecord?.DurationSeconds,
                    GetSpeakingTargetDurationSeconds(item.PartNumber, promptType),
                    item.Result.Rubrics,
                    IsNoResponseSpeakingResult(item.Result));
            }).ToList());

        try
        {
            using var response = await httpClient.PostAsJsonAsync(
                "/api/ai/score-speaking-session",
                request,
                JsonOptions,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                var detail = ExtractAiServiceErrorDetail(errorBody);
                logger.LogWarning(
                    "AI speaking session aggregation failed with status {StatusCode}: {Detail}",
                    (int)response.StatusCode,
                    string.IsNullOrWhiteSpace(detail) ? errorBody : detail);
                return null;
            }

            var result = await response.Content.ReadFromJsonAsync<AiScoreResponse>(JsonOptions, cancellationToken);
            return result is null
                ? null
                : NormalizeSpeakingScoreResponse(sessionId, sessionId, result);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("AI speaking session aggregation timed out for session {SessionId}.", sessionId);
            return null;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException)
        {
            logger.LogWarning(ex, "AI speaking session aggregation failed for session {SessionId}.", sessionId);
            return null;
        }
    }

    public async Task<GeneratedSpeakingPromptAudioDto?> GenerateSpeakingPromptAudioAsync(
        string promptText,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(promptText))
        {
            return null;
        }

        using var response = await httpClient.PostAsJsonAsync(
            "/api/ai/generate-speaking-prompt-audio",
            new
            {
                promptText = promptText.Trim(),
            },
            JsonOptions,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            var detail = ExtractAiServiceErrorDetail(errorBody);

            logger.LogWarning(
                "AI speaking prompt TTS failed with status {StatusCode}. Detail: {Detail}",
                (int)response.StatusCode,
                string.IsNullOrWhiteSpace(detail) ? "(empty)" : detail);

            return null;
        }

        var audioBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        if (audioBytes.Length == 0)
        {
            logger.LogWarning("AI speaking prompt TTS returned an empty audio payload.");
            return null;
        }

        var mimeType = response.Content.Headers.ContentType?.MediaType?.Trim() ?? "audio/wav";
        var fileExtension = mimeType.Equals("audio/mpeg", StringComparison.OrdinalIgnoreCase)
            ? ".mp3"
            : mimeType.Equals("audio/x-wav", StringComparison.OrdinalIgnoreCase)
                ? ".wav"
                : ".wav";

        return new GeneratedSpeakingPromptAudioDto(audioBytes, mimeType, fileExtension);
    }

    public async Task<GenerateListeningTranscriptResultDto> GenerateListeningTranscriptAsync(
        GenerateListeningTranscriptRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.AudioUrl))
        {
            throw new InvalidOperationException("AudioUrl is required to generate listening transcript.");
        }

        using var response = await httpClient.PostAsJsonAsync(
            "/api/ai/generate-listening-transcript",
            new
            {
                audio_url = request.AudioUrl.Trim(),
                language = string.IsNullOrWhiteSpace(request.Language) ? "en" : request.Language.Trim(),
            },
            JsonOptions,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            var detail = ExtractAiServiceErrorDetail(errorBody);
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(detail)
                    ? $"AI transcript service failed with status {(int)response.StatusCode}."
                    : detail);
        }

        var payload = await response.Content.ReadFromJsonAsync<ListeningTranscriptServiceResponse>(JsonOptions, cancellationToken);
        if (payload?.Segments is null || payload.Segments.Count == 0)
        {
            throw new InvalidOperationException("AI transcript service returned no transcript segments.");
        }

        var segments = payload.Segments
            .Where(segment => !string.IsNullOrWhiteSpace(segment.Text))
            .Select(segment => new ListeningTranscriptSegmentDto(
                Math.Round(segment.StartTime, 2),
                segment.EndTime.HasValue ? Math.Round(segment.EndTime.Value, 2) : null,
                segment.Text.Trim(),
                null))
            .ToList();

        if (segments.Count == 0)
        {
            throw new InvalidOperationException("AI transcript service returned empty transcript text.");
        }

        var transcriptText = string.Join(" ", segments.Select(segment => segment.Text).Where(text => !string.IsNullOrWhiteSpace(text))).Trim();
        return new GenerateListeningTranscriptResultDto(segments, transcriptText, segments.Count);
    }

    public async Task<AlignListeningTranscriptResultDto> AlignListeningTranscriptAsync(
        AlignListeningTranscriptRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.TranscriptSegments is null || request.TranscriptSegments.Count == 0)
        {
            throw new InvalidOperationException("TranscriptSegments are required to align listening transcript.");
        }

        if (request.Questions is null || request.Questions.Count == 0)
        {
            throw new InvalidOperationException("Questions are required to align listening transcript.");
        }

        using var response = await httpClient.PostAsJsonAsync(
            "/api/ai/align-listening-transcript",
            new
            {
                transcript_segments = request.TranscriptSegments.Select(segment => new
                {
                    start_time = segment.StartTime,
                    end_time = segment.EndTime,
                    text = segment.Text,
                }),
                questions = request.Questions.Select(question => new
                {
                    question_number = question.QuestionNumber,
                    question_text = question.QuestionText,
                    correct_answer = question.CorrectAnswer,
                    correct_option_texts = question.CorrectOptionTexts ?? Array.Empty<string>(),
                    context_text = question.ContextText,
                    group_type = question.GroupType,
                }),
            },
            JsonOptions,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            var detail = ExtractAiServiceErrorDetail(errorBody);
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(detail)
                    ? $"AI transcript alignment service failed with status {(int)response.StatusCode}."
                    : detail);
        }

        var payload = await response.Content.ReadFromJsonAsync<ListeningTranscriptAlignmentServiceResponse>(JsonOptions, cancellationToken);
        if (payload?.Alignments is null)
        {
            throw new InvalidOperationException("AI transcript alignment service returned no alignment payload.");
        }

        return new AlignListeningTranscriptResultDto(
            payload.Alignments.Select(alignment => new ListeningTranscriptQuestionAlignmentDto(
                alignment.QuestionNumber,
                alignment.SegmentIndexes?
                    .Where(index => index >= 0)
                    .Distinct()
                    .OrderBy(index => index)
                    .ToList()
                    ?? [],
                alignment.Confidence)).ToList());
    }

    private async Task SavePhonemeAnalyses(
        SpeechTranscript transcript,
        AiSpeakingPronunciationAnalysis? pronunciationAnalysis,
        CancellationToken cancellationToken)
    {
        var existingRows = await context.PhonemeAnalyses
            .Where(item => item.TranscriptId == transcript.Id)
            .ToListAsync(cancellationToken);
        context.PhonemeAnalyses.RemoveRange(existingRows);

        var issues = pronunciationAnalysis?.Issues?
            .Where(issue => !string.IsNullOrWhiteSpace(issue.Word))
            .Take(24)
            .ToList() ?? [];

        foreach (var issue in issues)
        {
            context.PhonemeAnalyses.Add(new PhonemeAnalysis
            {
                Id = Guid.NewGuid(),
                TranscriptId = transcript.Id,
                Word = TruncateForColumn(issue.Word, 100),
                ExpectedPhoneme = TruncateForColumn(issue.ExpectedPhoneme, 100),
                ActualPhoneme = TruncateForColumn(issue.ActualPhoneme, 100),
                IsCorrect = issue.IsCorrect
            });
        }
    }

    private static string? TruncateForColumn(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private async Task SaveFeedbacks(Guid answerId, AiScoreResponse result, string skillType, CancellationToken cancellationToken)
    {
        var existingFeedbacks = await context.AiFeedbacks
            .Where(feedback => feedback.AnswerId == answerId)
            .ToListAsync(cancellationToken);
        context.AiFeedbacks.RemoveRange(existingFeedbacks);

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
            }

            context.AiFeedbacks.Add(new AiFeedback
            {
                Id = Guid.NewGuid(),
                AnswerId = answerId,
                RubricId = scoringRubric.Id,
                BandScore = ClampBand(rubric.Band),
                AiComment = rubric.Comment,
                Improvements = rubric.Improvements,
                ConfidenceScore = rubric.Confidence,
                EvidenceData = rubric.Evidence is { Count: > 0 }
                    ? JsonSerializer.Serialize(rubric.Evidence, JsonOptions)
                    : null
            });
        }
    }

    private async Task UpdateScoringResult(
        Guid sessionId,
        double? writingScore = null,
        double? speakingScore = null,
        string? overallFeedback = null,
        CancellationToken cancellationToken = default)
    {
        var scoringResult = await context.ScoringResults
            .FirstOrDefaultAsync(r => r.SessionId == sessionId, cancellationToken);

        if (scoringResult is null)
        {
            scoringResult = new ScoringResult
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId
            };
            context.ScoringResults.Add(scoringResult);
        }

        if (writingScore.HasValue)
            scoringResult.WritingScore = writingScore.Value;

        if (speakingScore.HasValue)
            scoringResult.SpeakingScore = speakingScore.Value;

        if (!string.IsNullOrWhiteSpace(overallFeedback))
            scoringResult.OverallFeedback = overallFeedback;

        scoringResult.TotalBandScore = IeltsScoringCalculator.CalculateOverallBand(
            scoringResult.ReadingScore,
            scoringResult.ListeningScore,
            scoringResult.WritingScore,
            scoringResult.SpeakingScore);
        scoringResult.ScoredAt = DateTime.UtcNow;

        var session = await context.ExamSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

        if (session is not null)
            session.Status = "Completed";
    }

    private async Task<AiScoreResponse?> RequestGeminiWritingScoreAsync(
        Guid sessionId,
        UserAnswer answer,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_geminiApiKey))
        {
            throw new InvalidOperationException("Gemini scoring API key is missing. Set GeminiScoring:ApiKey or GEMINI_API_KEY.");
        }

        var parts = new List<object>
        {
            new { text = BuildWritingScoringPrompt(sessionId, answer) },
        };

        foreach (var imagePart in await BuildWritingImagePartsAsync(answer.WritingTask?.AssetsData, cancellationToken))
        {
            parts.Add(imagePart);
        }

        parts.Add(new
        {
            text = $"""
            STUDENT_ESSAY:
            {answer.AnswerText}
            """
        });

        var requestData = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = parts.ToArray()
                }
            },
            generationConfig = new
            {
                temperature = _geminiTemperature,
                responseMimeType = "application/json"
            }
        };

        var responseBody = await RequestGeminiGenerateContentWithFallbackAsync(
            sessionId,
            answer.Id,
            requestData,
            _geminiScoringModelCandidates,
            "writing scoring",
            cancellationToken);
        return DeserializeGeminiScoreResponse(responseBody);
    }

    private async Task<string> RequestGeminiGenerateContentWithFallbackAsync(
        Guid sessionId,
        Guid answerId,
        object requestData,
        IReadOnlyList<string> modelCandidates,
        string operationName,
        CancellationToken cancellationToken)
    {
        string? lastErrorBody = null;
        HttpStatusCode? lastStatusCode = null;

        for (var modelIndex = 0; modelIndex < modelCandidates.Count; modelIndex++)
        {
            var model = modelCandidates[modelIndex];
            for (var attempt = 1; attempt <= _geminiMaxAttemptsPerModel; attempt++)
            {
                logger.LogInformation(
                    "Calling Gemini {OperationName} model {Model} for session {SessionId}, answer {AnswerId}. Attempt {Attempt}/{MaxAttempts}.",
                    operationName,
                    model,
                    sessionId,
                    answerId,
                    attempt,
                    _geminiMaxAttemptsPerModel);

                using var response = await PostGeminiGenerateContentAsync(model, requestData, cancellationToken);
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return responseBody;
                }

                lastStatusCode = response.StatusCode;
                lastErrorBody = responseBody;

                if (IsTransientGeminiStatus(response.StatusCode) && attempt < _geminiMaxAttemptsPerModel)
                {
                    var delay = ComputeGeminiRetryDelay(attempt);
                    logger.LogWarning(
                        "Gemini {OperationName} model {Model} returned transient status {StatusCode}. Retrying in {DelayMs} ms.",
                        operationName,
                        model,
                        (int)response.StatusCode,
                        (int)delay.TotalMilliseconds);
                    await Task.Delay(delay, cancellationToken);
                    continue;
                }

                if (ShouldTryNextGeminiModel(response.StatusCode) && modelIndex < modelCandidates.Count - 1)
                {
                    logger.LogWarning(
                        "Gemini {OperationName} model {Model} failed with status {StatusCode}. Trying fallback model {FallbackModel}.",
                        operationName,
                        model,
                        (int)response.StatusCode,
                        modelCandidates[modelIndex + 1]);
                    break;
                }

                throw new InvalidOperationException($"Gemini {operationName} failed with status {(int)response.StatusCode}: {responseBody}");
            }
        }

        throw new InvalidOperationException(
            $"Gemini {operationName} failed with status {(int?)lastStatusCode ?? 0}: {lastErrorBody ?? "No response body."}");
    }

    private async Task<HttpResponseMessage> PostGeminiGenerateContentAsync(
        string model,
        object requestData,
        CancellationToken cancellationToken)
    {
        var requestUrl = $"{_geminiBaseUrl}/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";
        using var request = new HttpRequestMessage(HttpMethod.Post, requestUrl)
        {
            Content = JsonContent.Create(requestData, options: JsonOptions)
        };
        request.Headers.TryAddWithoutValidation("x-goog-api-key", _geminiApiKey);

        return await httpClient.SendAsync(request, cancellationToken);
    }

    private TimeSpan ComputeGeminiRetryDelay(int attempt)
    {
        var exponentialDelayMs = _geminiRetryBaseDelayMs * Math.Pow(2, attempt - 1);
        var jitterMs = Random.Shared.Next(0, 350);
        return TimeSpan.FromMilliseconds(Math.Min(exponentialDelayMs + jitterMs, 10_000));
    }

    private static bool IsTransientGeminiStatus(HttpStatusCode statusCode) =>
        statusCode is HttpStatusCode.TooManyRequests
            or HttpStatusCode.InternalServerError
            or HttpStatusCode.BadGateway
            or HttpStatusCode.ServiceUnavailable
            or HttpStatusCode.GatewayTimeout;

    private static bool ShouldTryNextGeminiModel(HttpStatusCode statusCode) =>
        statusCode == HttpStatusCode.NotFound || IsTransientGeminiStatus(statusCode);

    private static AiScoreResponse? DeserializeGeminiScoreResponse(string responseBody)
    {
        var geminiResponse = JsonSerializer.Deserialize<GeminiGenerateContentResponse>(responseBody, JsonOptions);
        var rawText = geminiResponse?.Candidates?
            .FirstOrDefault()?.Content?.Parts?
            .FirstOrDefault(part => !string.IsNullOrWhiteSpace(part.Text))?.Text;

        if (string.IsNullOrWhiteSpace(rawText))
        {
            throw new InvalidOperationException("Gemini writing scoring returned an empty response.");
        }

        var json = ExtractJsonObject(rawText);
        return JsonSerializer.Deserialize<AiScoreResponse>(json, JsonOptions);
    }

    private async Task<AiScoreResponse> EnsureVietnameseWritingFeedbackAsync(
        Guid sessionId,
        Guid answerId,
        AiScoreResponse result,
        CancellationToken cancellationToken)
    {
        if (!NeedsVietnameseFeedbackNormalization(result))
        {
            return result;
        }

        logger.LogInformation(
            "Writing feedback for answer {AnswerId} contains English feedback. Translating feedback fields to Vietnamese before saving.",
            answerId);

        var requestData = new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new object[]
                    {
                        new
                        {
                            text = $"""
                            Translate IELTS Writing examiner feedback fields to Vietnamese.
                            Return JSON only. Keep the same JSON schema and numeric values.

                            Hard rules:
                            - Translate only: overall_feedback, each rubrics.comment, each rubrics.improvements, each detailed_corrections.explanation.
                            - Do not translate or change: session_id, answer_id, overall_band, rubrics.criteria, rubrics.band, detailed_corrections.start_index, detailed_corrections.end_index, detailed_corrections.original_text, detailed_corrections.corrected_text, detailed_corrections.criteria.
                            - Keep IELTS criterion names in English.
                            - Vietnamese feedback must be natural, specific, and useful for a Vietnamese learner.
                            - Keep English only inside quoted original/corrected essay text or unavoidable IELTS terms.

                            JSON_TO_TRANSLATE:
                            {JsonSerializer.Serialize(result, JsonOptions)}
                            """
                        }
                    }
                }
            },
            generationConfig = new
            {
                temperature = 0.0d,
                responseMimeType = "application/json"
            }
        };

        try
        {
            var responseBody = await RequestGeminiGenerateContentWithFallbackAsync(
                sessionId,
                answerId,
                requestData,
                _feedbackTranslationModelCandidates,
                "feedback translation",
                cancellationToken);

            var translated = DeserializeGeminiScoreResponse(responseBody);
            return translated is null
                ? result
                : NormalizeWritingScoreResponse(sessionId, answerId, translated);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to translate writing feedback to Vietnamese for answer {AnswerId}. Keeping original feedback.", answerId);
            return result;
        }
    }

    private static string BuildWritingScoringPrompt(Guid sessionId, UserAnswer answer)
    {
        var taskNumber = answer.WritingTask?.TaskNumber;
        var taskLabel = taskNumber == 1 ? "IELTS Writing Task 1" : taskNumber == 2 ? "IELTS Writing Task 2" : "IELTS Writing";
        var hasImage = ExtractAssetUrls(answer.WritingTask?.AssetsData).Count > 0;
        var structuredVisualData = ExtractWritingStructuredData(answer.WritingTask?.AssetsData);

        return $$"""
        You are a strict but fair certified IELTS Writing examiner.
        Score the student's {{taskLabel}} response using official IELTS-style criteria.

        Important rules:
        - If this is Task 1 and an image is provided, read the visual carefully and verify whether the essay reports key features, overview, trends, comparisons, and data accurately.
        - If STRUCTURED_VISUAL_DATA is provided, treat it as the ground truth for figures, labels, categories, units, rankings, and trends.
        - Use the image only to confirm the visual context. Do not guess exact values from chart spacing when STRUCTURED_VISUAL_DATA already provides the real values.
        - If the image appears ambiguous but STRUCTURED_VISUAL_DATA is clear, prefer STRUCTURED_VISUAL_DATA.
        - If data from the image is wrong or important key features are missing, reduce Task Achievement.
        - If this is Task 2, judge whether all parts of the prompt are answered, the position is clear, and ideas are developed with explanation/examples.
        - Judge Coherence and Cohesion by logical ordering, paragraphing, topic sentences, cohesive devices, and reference clarity.
        - Judge Lexical Resource by range, precision, paraphrasing, collocations, spelling, word formation, and natural academic style.
        - Judge Grammatical Range and Accuracy by sentence variety, error-free sentence ratio, and severity of errors.
        - Penalize overly short responses naturally. Do not invent content not present in the essay.
        - Never invent chart values, rankings, category names, percentages, or year-on-year changes that are not supported by the image or STRUCTURED_VISUAL_DATA.
        - Scores must be in 0.5 increments from 0 to 9.
        - Write all examiner feedback in Vietnamese for Vietnamese IELTS learners.
        - Fields "overall_feedback", every rubric "comment", every rubric "improvements", and every correction "explanation" must be Vietnamese.
        - Keep English only when quoting the student's original essay, writing corrected English text, naming IELTS criteria, or using unavoidable IELTS terms such as "overview", "topic sentence", "collocation".
        - Be concrete: point out what the student did well, what is wrong, and what to fix next. Avoid generic feedback.
        - Return JSON only. Do not wrap it in markdown.

        Required JSON schema:
        {
          "session_id": "{{sessionId}}",
          "answer_id": "{{answer.Id}}",
          "overall_band": 6.5,
          "overall_feedback": "Nhận xét tổng quan ngắn bằng tiếng Việt.",
          "rubrics": [
            {"criteria":"Task Achievement/Response","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."},
            {"criteria":"Coherence and Cohesion","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."},
            {"criteria":"Lexical Resource","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."},
            {"criteria":"Grammatical Range and Accuracy","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."}
          ],
          "detailed_corrections": [
            {
              "start_index": 0,
              "end_index": 12,
              "original_text": "exact English text from essay",
              "corrected_text": "corrected English version",
              "explanation": "Giải thích lỗi bằng tiếng Việt.",
              "criteria": "Grammar"
            }
          ]
        }

        PROMPT:
        {{answer.WritingTask?.PromptText ?? string.Empty}}

        IMAGE_PROVIDED: {{(hasImage ? "yes" : "no")}}

        STRUCTURED_VISUAL_DATA_PROVIDED: {{(!string.IsNullOrWhiteSpace(structuredVisualData) ? "yes" : "no")}}

        STRUCTURED_VISUAL_DATA:
        {{structuredVisualData ?? "None"}}
        """;
    }

    private async Task<List<object>> BuildWritingImagePartsAsync(string? assetsData, CancellationToken cancellationToken)
    {
        var parts = new List<object>();
        foreach (var asset in ExtractAssetUrls(assetsData).Take(MaxWritingTaskImages))
        {
            var part = await TryBuildInlineImagePartAsync(asset, cancellationToken);
            if (part is not null)
            {
                parts.Add(part);
            }
        }

        return parts;
    }

    private async Task<object?> TryBuildInlineImagePartAsync(string asset, CancellationToken cancellationToken)
    {
        if (asset.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
        {
            var commaIndex = asset.IndexOf(',', StringComparison.Ordinal);
            if (commaIndex <= 0)
                return null;

            var header = asset[..commaIndex];
            var base64Data = asset[(commaIndex + 1)..];
            var mimeType = header.Replace("data:", string.Empty, StringComparison.OrdinalIgnoreCase)
                .Split(';', StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault() ?? "image/png";

            return new
            {
                inline_data = new
                {
                    mime_type = mimeType,
                    data = base64Data
                }
            };
        }

        if (!Uri.TryCreate(asset, UriKind.Absolute, out var uri))
        {
            return null;
        }

        try
        {
            using var response = await httpClient.GetAsync(uri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Failed to download writing image {ImageUrl}. Status: {StatusCode}", asset, response.StatusCode);
                return null;
            }

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (bytes.Length == 0 || bytes.Length > _maxImageBytes)
            {
                logger.LogWarning("Skipped writing image {ImageUrl}. Size {Size} bytes exceeds allowed limit {Limit}.", asset, bytes.Length, _maxImageBytes);
                return null;
            }

            var mimeType = response.Content.Headers.ContentType?.MediaType ?? InferImageMimeType(uri.AbsolutePath);
            return new
            {
                inline_data = new
                {
                    mime_type = mimeType,
                    data = Convert.ToBase64String(bytes)
                }
            };
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to prepare writing image {ImageUrl} for Gemini scoring.", asset);
            return null;
        }
    }

    private static List<string> ExtractAssetUrls(string? assetsData)
    {
        if (string.IsNullOrWhiteSpace(assetsData))
        {
            return [];
        }

        var trimmed = assetsData.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return [trimmed];
        }

        try
        {
            using var document = JsonDocument.Parse(trimmed);
            var urls = new List<string>();
            CollectAssetUrls(document.RootElement, urls);
            return urls
                .Select(url => url.Trim())
                .Where(url => !string.IsNullOrWhiteSpace(url))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return [trimmed];
        }
    }

    private static string? ExtractWritingStructuredData(string? assetsData)
    {
        if (string.IsNullOrWhiteSpace(assetsData))
        {
            return null;
        }

        var trimmed = assetsData.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(trimmed);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            foreach (var propertyName in new[] { "hiddenDataText", "hiddenData", "chartDataText", "chartData", "sourceDataText", "sourceData", "data" })
            {
                if (!document.RootElement.TryGetProperty(propertyName, out var property))
                {
                    continue;
                }

                return property.ValueKind == JsonValueKind.String
                    ? property.GetString()?.Trim()
                    : JsonSerializer.Serialize(property, new JsonSerializerOptions { WriteIndented = true });
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static void CollectAssetUrls(JsonElement element, List<string> urls)
    {
        if (element.ValueKind == JsonValueKind.String)
        {
            var value = element.GetString();
            if (!string.IsNullOrWhiteSpace(value) &&
                (value.StartsWith("http", StringComparison.OrdinalIgnoreCase) || value.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)))
            {
                urls.Add(value);
            }

            return;
        }

        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                CollectAssetUrls(item, urls);
            }

            return;
        }

        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (property.Name is "imageUrl" or "url" or "assetUrl" or "src" or "images" or "assets")
                {
                    CollectAssetUrls(property.Value, urls);
                }
            }
        }
    }

    private static AiScoreResponse NormalizeWritingScoreResponse(Guid sessionId, Guid answerId, AiScoreResponse result)
    {
        var rubrics = (result.Rubrics ?? [])
            .Where(rubric => !string.IsNullOrWhiteSpace(rubric.Criteria))
            .Select(rubric => rubric with { Band = RoundIeltsBand(ClampBand(rubric.Band)) })
            .ToList();

        foreach (var criteria in WritingCriteria)
        {
            if (rubrics.Any(rubric => rubric.Criteria.Equals(criteria, StringComparison.OrdinalIgnoreCase)))
                continue;

            rubrics.Add(new AiRubricScore(criteria, 0, "AI không trả rubric này.", "Cần chấm lại để có nhận xét đầy đủ."));
        }

        var overallBand = rubrics.Count > 0
            ? RoundIeltsBand(rubrics.Average(rubric => rubric.Band))
            : RoundIeltsBand(ClampBand(result.OverallBand));

        return result with
        {
            SessionId = string.IsNullOrWhiteSpace(result.SessionId) ? sessionId.ToString() : result.SessionId,
            AnswerId = string.IsNullOrWhiteSpace(result.AnswerId) ? answerId.ToString() : result.AnswerId,
            OverallBand = overallBand,
            Rubrics = rubrics
        };
    }

    private static AiScoreResponse NormalizeSpeakingScoreResponse(Guid sessionId, Guid answerId, AiScoreResponse result)
    {
        var rubricLookup = (result.Rubrics ?? [])
            .Where(rubric => !string.IsNullOrWhiteSpace(rubric.Criteria))
            .GroupBy(rubric => rubric.Criteria.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(rubric => rubric with { Band = RoundIeltsBand(ClampBand(rubric.Band)) })
                    .First(),
                StringComparer.OrdinalIgnoreCase);

        var rubrics = new List<AiRubricScore>(SpeakingCriteria.Length);
        foreach (var criteria in SpeakingCriteria)
        {
            if (rubricLookup.TryGetValue(criteria, out var rubric))
            {
                rubrics.Add(rubric with { Criteria = criteria });
                continue;
            }

            rubrics.Add(new AiRubricScore(
                criteria,
                0,
                "AI chưa trả về nhận xét cho tiêu chí này.",
                "Cần chấm lại để có nhận xét đầy đủ hơn."));
        }

        var overallBand = rubrics.Count > 0
            ? RoundIeltsBand(rubrics.Average(rubric => rubric.Band))
            : RoundIeltsBand(ClampBand(result.OverallBand));

        return result with
        {
            SessionId = string.IsNullOrWhiteSpace(result.SessionId) ? sessionId.ToString() : result.SessionId,
            AnswerId = string.IsNullOrWhiteSpace(result.AnswerId) ? answerId.ToString() : result.AnswerId,
            OverallBand = overallBand,
            Rubrics = rubrics
        };
    }

    private static string GetSpeakingPromptType(int partNumber, SpeakingQuestion? question)
    {
        if (partNumber == 2 && !string.IsNullOrWhiteSpace(question?.CueCardPoints))
        {
            return "part2_long_turn";
        }

        return partNumber switch
        {
            1 => "part1_short_answer",
            2 => "part2_follow_up",
            3 => "part3_discussion",
            _ => "unknown"
        };
    }

    private static int? GetSpeakingTargetDurationSeconds(int partNumber, string promptType) =>
        promptType switch
        {
            "part2_long_turn" => 120,
            "part2_follow_up" => 35,
            "part1_short_answer" => 30,
            "part3_discussion" => 60,
            _ => partNumber switch
            {
                1 => 30,
                2 => 35,
                3 => 60,
                _ => null
            }
        };

    private static AiScoreResponse BuildNoResponseSpeakingScoreResponse(Guid sessionId, Guid answerId, double? durationSeconds)
    {
        var durationText = durationSeconds.HasValue && durationSeconds.Value > 0
            ? $" Bản ghi dài khoảng {durationSeconds.Value:0.#} giây nhưng không có câu trả lời nói đủ rõ."
            : " Prompt này không có bản ghi câu trả lời.";
        var evidence = new[]
        {
            "no_response=true",
            durationSeconds.HasValue ? $"duration_seconds={durationSeconds.Value:0.#}" : "duration_seconds=n/a",
            "audio_quality=no_audio"
        };

        return new AiScoreResponse(
            sessionId.ToString(),
            answerId.ToString(),
            1.0,
            [
                new AiRubricScore(
                    "Fluency and Coherence",
                    1.0,
                    $"Không có câu trả lời nói có thể đánh giá về độ trôi chảy hoặc mạch lạc.{durationText}",
                    "Khi bí ý, hãy nói tối thiểu 1-2 câu trực tiếp về việc bạn chưa chắc, rồi đưa một ví dụ hoặc lý do đơn giản.",
                    0.9,
                    evidence),
                new AiRubricScore(
                    "Lexical Resource",
                    1.0,
                    "Không có đủ từ vựng được nói ra để thể hiện khả năng diễn đạt.",
                    "Chuẩn bị một vài cụm mở đầu an toàn như I am not very familiar with this topic, but I think... để vẫn tạo được câu trả lời.",
                    0.9,
                    evidence),
                new AiRubricScore(
                    "Grammatical Range and Accuracy",
                    1.0,
                    "Không có ngôn ngữ đủ dài để đánh giá cấu trúc câu hoặc độ chính xác ngữ pháp.",
                    "Ưu tiên tạo câu đơn hoàn chỉnh với chủ ngữ và động từ trước, sau đó thêm because hoặc for example để mở rộng.",
                    0.9,
                    evidence),
                new AiRubricScore(
                    "Pronunciation",
                    1.0,
                    "Không có lời nói đủ rõ để đánh giá phát âm ở mức câu trả lời.",
                    "Nói rõ từng từ khóa và giữ âm lượng ổn định; nếu chưa nghĩ ra ý, vẫn nên nói một câu ngắn thay vì im lặng.",
                    0.9,
                    evidence)
            ],
            "Câu trả lời được chấm như no response. Việc không trả lời làm giảm điểm vì không có đủ bằng chứng ngôn ngữ để chấm các tiêu chí Speaking.");
    }

    private static bool NeedsVietnameseFeedbackNormalization(AiScoreResponse result)
    {
        var feedbackTexts = new List<string?>();
        feedbackTexts.Add(result.OverallFeedback);
        feedbackTexts.AddRange((result.Rubrics ?? []).SelectMany(rubric => new[] { rubric.Comment, rubric.Improvements }));
        feedbackTexts.AddRange((result.DetailedCorrections ?? []).Select(correction => correction.Explanation));

        return feedbackTexts
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Any(IsLikelyEnglishFeedback);
    }

    private static bool IsLikelyEnglishFeedback(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length < 24)
        {
            return false;
        }

        var lower = $" {value.ToLowerInvariant()} ";
        if (ContainsVietnameseSignal(lower))
        {
            return false;
        }

        var englishSignals = new[]
        {
            " the ",
            " and ",
            " response ",
            " essay ",
            " provides ",
            " demonstrates ",
            " however ",
            " ensure ",
            " improve ",
            " improvement ",
            " paragraph ",
            " vocabulary ",
            " grammar ",
            " accurate ",
            " inaccuracies ",
            " cohesive ",
            " sentence ",
            " task ",
            " graph "
        };

        return englishSignals.Count(signal => lower.Contains(signal, StringComparison.Ordinal)) >= 2;
    }

    private static bool ContainsVietnameseSignal(string lowerValue)
    {
        const string vietnameseMarks = "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ";
        if (lowerValue.Any(vietnameseMarks.Contains))
        {
            return true;
        }

        var vietnameseWords = new[]
        {
            " bài ",
            " của ",
            " và ",
            " là ",
            " có ",
            " cần ",
            " nên ",
            " tuy nhiên ",
            " cải thiện ",
            " luận điểm ",
            " ngữ pháp ",
            " từ vựng ",
            " đoạn văn ",
            " người đọc "
        };

        return vietnameseWords.Any(word => lowerValue.Contains(word, StringComparison.Ordinal));
    }

    private static string BuildWritingOverallFeedbackPayload(
        double writingScore,
        IReadOnlyList<(UserAnswer Answer, AiScoreResponse Result, int Weight)> scoredItems) =>
        JsonSerializer.Serialize(new
        {
            skill = "Writing",
            writing_score = writingScore,
            scored_at = DateTime.UtcNow,
            tasks = scoredItems.Select(item => new
            {
                answer_id = item.Answer.Id,
                writing_task_id = item.Answer.WritingTaskId,
                task_number = item.Answer.WritingTask?.TaskNumber,
                band = item.Result.OverallBand,
                weight = item.Weight,
                feedback = item.Result.OverallFeedback,
                detailed_corrections = item.Result.DetailedCorrections ?? []
            })
        }, JsonOptions);

    private static double BuildSpeakingOverallBand(
        IReadOnlyList<(UserAnswer Answer, AiScoreResponse Result, int PartNumber)> scoredItems)
    {
        var partCriterionMaps = scoredItems
            .GroupBy(item => item.PartNumber)
            .Select(partGroup => BuildSpeakingCriterionAverageMap(partGroup.Select(item => item.Result)))
            .ToList();

        if (partCriterionMaps.Count == 0)
        {
            return 0;
        }

        var overallCriterionBands = SpeakingCriteria
            .Select(criteria => partCriterionMaps.Average(map => map[criteria]))
            .ToList();

        return overallCriterionBands.Count == 0
            ? 0
            : RoundIeltsBand(overallCriterionBands.Average());
    }

    private static Dictionary<string, double> BuildSpeakingCriterionAverageMap(IEnumerable<AiScoreResponse> results)
    {
        var rubricList = results
            .SelectMany(result => result.Rubrics ?? [])
            .ToList();

        return SpeakingCriteria.ToDictionary(
            criteria => criteria,
            criteria => rubricList
                .Where(rubric => criteria.Equals(rubric.Criteria, StringComparison.OrdinalIgnoreCase))
                .Select(rubric => ClampBand(rubric.Band))
                .DefaultIfEmpty(0)
                .Average(),
            StringComparer.OrdinalIgnoreCase);
    }

    private static string BuildSpeakingOverallFeedbackPayload(
        IReadOnlyList<(UserAnswer Answer, AiScoreResponse Result, int PartNumber)> scoredItems)
    {
        var lines = new List<string>();
        var overallBand = BuildSpeakingOverallBand(scoredItems);
        lines.Add(
            $"Band Speaking tổng quan khoảng {overallBand:0.0}. "
            + "Điểm được tổng hợp theo 4 tiêu chí IELTS và cân bằng theo từng Part trong session. "
            + "Nội dung, từ vựng và ngữ pháp dựa trên transcript tự động; fluency và pronunciation dùng thêm tín hiệu ASR từ audio. "
            + "Nếu audio không tạo được transcript, backend chấm no response và không suy đoán nội dung.");

        foreach (var partGroup in scoredItems.GroupBy(item => item.PartNumber).OrderBy(group => group.Key))
        {
            var partItems = partGroup.ToList();
            var noResponseCount = partItems.Count(item => IsNoResponseSpeakingResult(item.Result));
            var ratableCount = partItems.Count - noResponseCount;
            var criterionBands = BuildSpeakingCriterionAverageMap(partItems.Select(item => item.Result));
            var partBand = RoundIeltsBand(criterionBands.Values.Average());

            if (ratableCount == 0)
            {
                lines.Add(
                    $"{FormatSpeakingPartLabel(partGroup.Key)} · Band khoảng {partBand:0.0}. "
                    + $"Không có prompt nào trong part này có câu trả lời đủ dữ liệu để đánh giá ({noResponseCount}/{partItems.Count} prompt no response). "
                    + "Không nêu điểm mạnh/yếu theo tiêu chí vì backend không có đủ bằng chứng ngôn ngữ từ audio/transcript. "
                    + "Cần trả lời tối thiểu 1-2 câu rõ tiếng Anh cho mỗi prompt để có thể chấm Fluency, Lexical Resource, Grammar và Pronunciation.");
                continue;
            }

            var strongestCriteria = criterionBands
                .OrderByDescending(item => item.Value)
                .ThenBy(item => item.Key, StringComparer.Ordinal)
                .Take(2)
                .Select(item => GetSpeakingCriteriaDisplayName(item.Key))
                .ToList();
            var weakestCriteria = criterionBands
                .OrderBy(item => item.Value)
                .ThenBy(item => item.Key, StringComparer.Ordinal)
                .Take(2)
                .Select(item => item.Key)
                .ToList();

            var responseCoverageText = noResponseCount > 0
                ? $" Có {noResponseCount}/{partItems.Count} prompt no response nên điểm part bị kéo xuống."
                : string.Empty;

            lines.Add(
                $"{FormatSpeakingPartLabel(partGroup.Key)} · Band khoảng {partBand:0.0}.{responseCoverageText} "
                + $"Dựa trên {ratableCount} prompt có transcript/audio đủ dữ liệu, điểm mạnh tương đối: {string.Join(", ", strongestCriteria)}. "
                + $"Cần ưu tiên: {string.Join(", ", weakestCriteria.Select(GetSpeakingCriteriaDisplayName))}. "
                + BuildSpeakingPartImprovementSummary(partGroup.Key, weakestCriteria));
        }

        return string.Join(Environment.NewLine + Environment.NewLine, lines);
    }

    private static bool IsNoResponseSpeakingResult(AiScoreResponse result)
    {
        var rubrics = result.Rubrics ?? [];
        return result.OverallBand <= 1.0
            && rubrics.Count >= SpeakingCriteria.Length
            && rubrics.All(rubric => rubric.Band <= 1.0)
            && (
                ContainsNoResponseSignal(result.OverallFeedback)
                || rubrics.Any(rubric => ContainsNoResponseSignal(rubric.Comment))
            );
    }

    private static bool ContainsNoResponseSignal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var normalized = value.ToLowerInvariant();
        return normalized.Contains("no response", StringComparison.Ordinal)
            || normalized.Contains("không có câu trả lời", StringComparison.Ordinal)
            || normalized.Contains("không có lời nói", StringComparison.Ordinal)
            || normalized.Contains("không có đủ", StringComparison.Ordinal);
    }

    private static string FormatSpeakingPartLabel(int partNumber) =>
        partNumber > 0 ? $"Part {partNumber}" : "Speaking";

    private static string GetSpeakingCriteriaDisplayName(string criteria) => criteria switch
    {
        "Fluency and Coherence" => "độ trôi chảy và mạch lạc",
        "Lexical Resource" => "từ vựng",
        "Grammatical Range and Accuracy" => "ngữ pháp",
        "Pronunciation" => "phát âm",
        _ => criteria
    };

    private static string BuildSpeakingPartImprovementSummary(int partNumber, IReadOnlyList<string> weakestCriteria)
    {
        var advice = new List<string>();

        var partAdvice = partNumber switch
        {
            1 => "Ở Part 1, nên trả lời trực tiếp rồi mở rộng thêm 1-2 câu thay vì dừng quá sớm.",
            2 => "Ở Part 2, nên giữ mạch mở ý → ví dụ → kết ý để nói trọn long turn ổn định hơn.",
            3 => "Ở Part 3, nên nêu quan điểm rõ rồi giải thích nguyên nhân, hệ quả hoặc so sánh sâu hơn.",
            _ => "Nên giữ câu trả lời đủ ý và có mạch phát triển rõ ràng.",
        };
        advice.Add(partAdvice);

        foreach (var criteria in weakestCriteria)
        {
            var criteriaAdvice = criteria switch
            {
                "Fluency and Coherence" => "Ưu tiên giảm hesitation dài và nối ý bằng because, however, for example khi chuyển luận điểm.",
                "Lexical Resource" => "Ưu tiên paraphrase và dùng collocation tự nhiên hơn để tránh lặp lại cùng một từ khóa.",
                "Grammatical Range and Accuracy" => "Ưu tiên đa dạng cấu trúc câu và kiểm soát lỗi chia thì, chủ-vị, mệnh đề phụ.",
                "Pronunciation" => "Ưu tiên nhấn trọng âm từ khóa, chia cụm ý rõ và tránh nuốt âm cuối.",
                _ => null,
            };

            if (!string.IsNullOrWhiteSpace(criteriaAdvice) && !advice.Contains(criteriaAdvice, StringComparer.Ordinal))
            {
                advice.Add(criteriaAdvice);
            }
        }

        return string.Join(" ", advice);
    }

    private static string ExtractJsonObject(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNewLine = trimmed.IndexOf('\n');
            if (firstNewLine >= 0)
            {
                trimmed = trimmed[(firstNewLine + 1)..].Trim();
            }

            if (trimmed.EndsWith("```", StringComparison.Ordinal))
            {
                trimmed = trimmed[..^3].Trim();
            }
        }

        var start = trimmed.IndexOf('{');
        var end = trimmed.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            throw new InvalidOperationException("Gemini writing scoring did not return valid JSON.");
        }

        return trimmed[start..(end + 1)];
    }

    private static string? ExtractAiServiceErrorDetail(string? rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(rawBody);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (document.RootElement.TryGetProperty("detail", out var detailElement)
                    && detailElement.ValueKind == JsonValueKind.String)
                {
                    return detailElement.GetString();
                }

                if (document.RootElement.TryGetProperty("message", out var messageElement)
                    && messageElement.ValueKind == JsonValueKind.String)
                {
                    return messageElement.GetString();
                }
            }
        }
        catch (JsonException)
        {
        }

        return rawBody.Trim();
    }

    private static double ClampBand(double value) => Math.Min(9, Math.Max(0, value));

    private static double RoundIeltsBand(double value) =>
        Math.Round(ClampBand(value) * 2, MidpointRounding.AwayFromZero) / 2;

    private static string FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

    private static string[] BuildGeminiModelCandidates(
        IConfiguration configuration,
        string primaryModelKey,
        string fallbackModelsKey,
        params string[] defaultModels)
    {
        var configuredModel = FirstNonEmpty(
            configuration[$"GeminiScoring:{primaryModelKey}"],
            defaultModels.FirstOrDefault());

        var configuredFallbackModels = configuration
            .GetSection($"GeminiScoring:{fallbackModelsKey}")
            .GetChildren()
            .Select(child => child.Value);

        return new[] { configuredModel }
            .Concat(configuredFallbackModels)
            .Concat(defaultModels)
            .Where(model => !string.IsNullOrWhiteSpace(model))
            .Select(model => model!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string InferImageMimeType(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/png"
        };
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

    private static string GetAudioFileName(string? audioUrl)
    {
        if (string.IsNullOrWhiteSpace(audioUrl))
        {
            return "recording.webm";
        }

        if (!Uri.TryCreate(audioUrl, UriKind.Absolute, out var uri))
        {
            return "recording.webm";
        }

        var fileName = Path.GetFileName(uri.LocalPath);
        return string.IsNullOrWhiteSpace(fileName) ? "recording.webm" : fileName;
    }

    private static string GetAudioContentType(string fileName)
    {
        return Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".webm" => "audio/webm",
            ".wav" => "audio/wav",
            ".mp3" => "audio/mpeg",
            ".m4a" => "audio/mp4",
            ".ogg" => "audio/ogg",
            _ => "application/octet-stream"
        };
    }

    private sealed record GeminiGenerateContentResponse(
        [property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate(
        [property: JsonPropertyName("content")] GeminiContent? Content);

    private sealed record GeminiContent(
        [property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private sealed record GeminiPart(
        [property: JsonPropertyName("text")] string? Text);

    private sealed record ListeningTranscriptServiceResponse(
        [property: JsonPropertyName("segments")] List<ListeningTranscriptServiceSegment>? Segments,
        [property: JsonPropertyName("transcript_text")] string? TranscriptText);

    private sealed record ListeningTranscriptServiceSegment(
        [property: JsonPropertyName("start_time")] double StartTime,
        [property: JsonPropertyName("end_time")] double? EndTime,
        [property: JsonPropertyName("text")] string Text);

    private sealed record ListeningTranscriptAlignmentServiceResponse(
        [property: JsonPropertyName("alignments")] List<ListeningTranscriptAlignmentServiceItem>? Alignments);

    private sealed record ListeningTranscriptAlignmentServiceItem(
        [property: JsonPropertyName("question_number")] int QuestionNumber,
        [property: JsonPropertyName("segment_indexes")] List<int>? SegmentIndexes,
        [property: JsonPropertyName("confidence")] string? Confidence);
}
