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

public sealed partial class AiScoringHttpService(
    HttpClient httpClient,
    IApplicationDbContext context,
    IConfiguration configuration,
    ILogger<AiScoringHttpService> logger) : IAiIntegrationService
{
    private const int MaxWritingTaskImages = 2;
    private const int DefaultMaxImageBytes = 1_500_000;
    private const string DefaultGeminiScoringModel = "gemini-2.5-flash-lite";
    private const string StableGeminiScoringFallbackModel = "gemini-2.5-flash";
    private const string DefaultFeedbackTranslationModel = "gemma-4-26b-a4b-it";
    private const string StableFeedbackTranslationFallbackModel = "gemma-4-31b-it";
    private const int DefaultGeminiMaxAttemptsPerModel = 3;
    private const int DefaultGeminiRetryBaseDelayMs = 1_200;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly string _geminiApiKey = GeminiConfiguration.ResolveApiKey(
        configuration,
        "GeminiScoring:ApiKey");

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

    private readonly bool _reuseExistingSpeakingAnswerScores =
        configuration.GetValue<bool?>("AiScoringService:ReuseExistingSpeakingAnswerScores") ?? true;

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

            result = AiScoreResponseNormalizer.NormalizeWriting(sessionId, answer.Id, result);
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

        var weightedScore = IeltsScoringCalculator.RoundBand(
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
            .Include(a => a.AiFeedbacks)
                .ThenInclude(feedback => feedback.Rubric)
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

        var tasks = speakingQuestions.Select(async question =>
        {
            var answer = answersByQuestionId[question.Id];
            answer.SpeakingQuestion ??= question;
            var questionPartNumber = question.Part.PartNumber ?? 0;

            if (_reuseExistingSpeakingAnswerScores)
            {
                var existingResult = TryBuildExistingSpeakingResult(sessionId, answer);
                if (existingResult is not null)
                {
                    return (Answer: answer, Result: existingResult, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: true, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: (System.Net.HttpStatusCode?)null, Exception: (Exception?)null);
                }
            }

            var audioRecord = answer.UserAudioRecords
                .OrderByDescending(record => record.DurationSeconds ?? 0)
                .ThenByDescending(record => record.Id)
                .FirstOrDefault();

            if (audioRecord is null || string.IsNullOrWhiteSpace(audioRecord.AudioUrl))
            {
                var noResponseResult = NoResponseSpeakingScoreFactory.Create(sessionId, answer.Id, audioRecord?.DurationSeconds);
                return (Answer: answer, Result: noResponseResult, PartNumber: questionPartNumber, IsNoResponse: true, IsReused: false, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: (System.Net.HttpStatusCode?)null, Exception: (Exception?)null);
            }

            var formContent = new MultipartFormDataContent();
            formContent.Add(new StringContent(sessionId.ToString()), "session_id");
            formContent.Add(new StringContent(answer.Id.ToString()), "answer_id");

            var questionPrompt = answer.SpeakingQuestion?.Content;
            if (!string.IsNullOrWhiteSpace(questionPrompt))
                formContent.Add(new StringContent(questionPrompt), "question_prompt");

            if (questionPartNumber > 0)
                formContent.Add(new StringContent(questionPartNumber.ToString(CultureInfo.InvariantCulture)), "part_number");

            var promptType = SpeakingPromptMetadata.GetPromptType(questionPartNumber, answer.SpeakingQuestion);
            formContent.Add(new StringContent(promptType), "prompt_type");

            var targetDurationSeconds = SpeakingPromptMetadata.GetTargetDurationSeconds(questionPartNumber, promptType);
            if (targetDurationSeconds.HasValue)
            {
                formContent.Add(
                    new StringContent(targetDurationSeconds.Value.ToString(CultureInfo.InvariantCulture)),
                    "target_duration_seconds");
            }

            if (audioRecord.DurationSeconds is double durationSeconds)
            {
                if (!double.IsNaN(durationSeconds) && !double.IsInfinity(durationSeconds))
                {
                    formContent.Add(
                        new StringContent(durationSeconds.ToString("0.###", CultureInfo.InvariantCulture)),
                        "duration_seconds");
                }
            }

            var transcriptText = audioRecord.SpeechTranscripts
                .OrderByDescending(transcript => transcript.Id)
                .Select(transcript => transcript.TranscriptText)
                .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));

            if (!string.IsNullOrWhiteSpace(transcriptText))
            {
                formContent.Add(new StringContent(transcriptText), "transcript_text");
            }

            Stream? audioStream = null;
            try
            {
                audioStream = await DownloadAudioAsync(audioRecord.AudioUrl, cancellationToken);
                if (audioStream is not null)
                {
                    var audioContent = new StreamContent(audioStream);
                    var audioFileName = SpeakingAudioUploadMetadata.GetFileName(audioRecord.AudioUrl);
                    audioContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(
                        SpeakingAudioUploadMetadata.GetContentType(audioFileName));
                    formContent.Add(audioContent, "audio", audioFileName);
                }
                else if (string.IsNullOrWhiteSpace(transcriptText))
                {
                    return (Answer: answer, Result: (AiScoreResponse?)null, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: false, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: (System.Net.HttpStatusCode?)null, Exception: new InvalidOperationException("Failed to download audio and no transcript found."));
                }

                using var response = await httpClient.PostAsync("/api/ai/score-speaking", formContent, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                    var detail = AiServiceErrorDetailParser.Extract(errorBody);
                    if (IsRecoverableSpeakingAnswerScoringFailure(response.StatusCode, errorBody, detail))
                    {
                        var technicalResult = NoResponseSpeakingScoreFactory.Create(
                            sessionId,
                            answer.Id,
                            audioRecord.DurationSeconds,
                            string.IsNullOrWhiteSpace(detail) ? errorBody : detail);
                        return (Answer: answer, Result: (AiScoreResponse?)null, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: false, IsTechnicalFailure: true, TechnicalFailureResult: technicalResult, TechnicalFailureBody: string.IsNullOrWhiteSpace(detail) ? errorBody : detail, StatusCode: response.StatusCode, Exception: (Exception?)null);
                    }

                    return (Answer: answer, Result: (AiScoreResponse?)null, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: false, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: response.StatusCode, Exception: new InvalidOperationException(string.IsNullOrWhiteSpace(detail) ? $"AI speaking scoring failed with status {(int)response.StatusCode}." : detail));
                }

                var result = await response.Content.ReadFromJsonAsync<AiScoreResponse>(cancellationToken);
                if (result is null)
                {
                    return (Answer: answer, Result: (AiScoreResponse?)null, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: false, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: response.StatusCode, Exception: new InvalidOperationException("AI service returned empty response."));
                }
                result = AiScoreResponseNormalizer.NormalizeSpeaking(sessionId, answer.Id, result);
                return (Answer: answer, Result: result, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: false, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: response.StatusCode, Exception: (Exception?)null);
            }
            catch (Exception ex)
            {
                return (Answer: answer, Result: (AiScoreResponse?)null, PartNumber: questionPartNumber, IsNoResponse: false, IsReused: false, IsTechnicalFailure: false, TechnicalFailureResult: (AiScoreResponse?)null, TechnicalFailureBody: (string?)null, StatusCode: (System.Net.HttpStatusCode?)null, Exception: ex);
            }
            finally
            {
                audioStream?.Dispose();
                formContent.Dispose();
            }
        });

        var results = await Task.WhenAll(tasks);

        foreach (var r in results)
        {
            if (r.Exception is not null)
            {
                throw r.Exception;
            }

            var answer = r.Answer;
            var questionPartNumber = r.PartNumber;

            if (r.IsReused)
            {
                scoredItems.Add((answer, r.Result!, questionPartNumber));
                logger.LogInformation(
                    "Speaking answer {AnswerId} reused from existing complete feedback.",
                    answer.Id);
                continue;
            }

            if (r.IsNoResponse)
            {
                await SaveFeedbacks(answer.Id, r.Result!, "Speaking", cancellationToken);
                answer.ScoreEarned = r.Result!.OverallBand;
                scoredItems.Add((answer, r.Result!, questionPartNumber));
                await context.SaveChangesAsync(cancellationToken);

                logger.LogInformation(
                    "Speaking answer {AnswerId} scored as no response because no audio was submitted.",
                    answer.Id);
                continue;
            }

            if (r.IsTechnicalFailure)
            {
                var technicalResult = r.TechnicalFailureResult!;
                await SaveFeedbacks(answer.Id, technicalResult, "Speaking", cancellationToken);
                answer.ScoreEarned = technicalResult.OverallBand;
                scoredItems.Add((answer, technicalResult, questionPartNumber));
                await context.SaveChangesAsync(cancellationToken);

                logger.LogWarning(
                    "Speaking answer {AnswerId} marked as technical no-response after AI scoring status {StatusCode}: {Detail}",
                    answer.Id,
                    (int)r.StatusCode!.Value,
                    r.TechnicalFailureBody);
                continue;
            }

            var result = r.Result!;
            var audioRecord = answer.UserAudioRecords
                .OrderByDescending(record => record.DurationSeconds ?? 0)
                .ThenByDescending(record => record.Id)
                .FirstOrDefault();

            SpeechTranscript? evidenceTranscript = null;
            if (!string.IsNullOrWhiteSpace(result.TranscriptText))
            {
                var existingTranscript = audioRecord!.SpeechTranscripts
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

            if (result.SpeakingEvidence is not null && audioRecord is not null)
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
            await context.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Speaking scored for answer {AnswerId}: band {Band}",
                answer.Id, result.OverallBand);
        }

        if (scoredItems.Count > 0)
        {
            var sessionLevelResult = await TryRequestSpeakingSessionScoreAsync(
                sessionId,
                scoredItems,
                cancellationToken);

            await UpdateScoringResult(
                sessionId,
                speakingScore: sessionLevelResult?.OverallBand ?? SpeakingScoreSummaryBuilder.BuildOverallBand(scoredItems),
                overallFeedback: !string.IsNullOrWhiteSpace(sessionLevelResult?.OverallFeedback)
                    ? sessionLevelResult.OverallFeedback
                    : SpeakingScoreSummaryBuilder.BuildOverallFeedbackPayload(scoredItems),
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
                var promptType = SpeakingPromptMetadata.GetPromptType(item.PartNumber, question);
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
                    SpeakingPromptMetadata.GetTargetDurationSeconds(item.PartNumber, promptType),
                    item.Result.Rubrics,
                    SpeakingScoreSummaryBuilder.IsNoResponseResult(item.Result));
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
                var detail = AiServiceErrorDetailParser.Extract(errorBody);
                logger.LogWarning(
                    "AI speaking session aggregation failed with status {StatusCode}: {Detail}",
                    (int)response.StatusCode,
                    string.IsNullOrWhiteSpace(detail) ? errorBody : detail);
                return null;
            }

            var result = await response.Content.ReadFromJsonAsync<AiScoreResponse>(JsonOptions, cancellationToken);
            return result is null
                ? null
                : AiScoreResponseNormalizer.NormalizeSpeaking(sessionId, sessionId, result);
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
            var detail = AiServiceErrorDetailParser.Extract(errorBody);

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
            var detail = AiServiceErrorDetailParser.Extract(errorBody);
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
            var detail = AiServiceErrorDetailParser.Extract(errorBody);
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

    public async Task<ReadabilityAnalysisResponseDto?> AnalyzeReadabilityAsync(
        string text,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        try
        {
            using var response = await httpClient.PostAsJsonAsync(
                "/api/ai/analyze-readability",
                new { text = text.Trim() },
                JsonOptions,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                var detail = AiServiceErrorDetailParser.Extract(errorBody);
                logger.LogWarning(
                    "AI readability analysis failed with status {StatusCode}: {Detail}",
                    (int)response.StatusCode,
                    string.IsNullOrWhiteSpace(detail) ? errorBody : detail);
                return null;
            }

            var pythonResponse = await response.Content.ReadFromJsonAsync<PythonReadabilityResponse>(JsonOptions, cancellationToken);
            if (pythonResponse is null)
            {
                return null;
            }

            return new ReadabilityAnalysisResponseDto(
                FleschKincaidGrade: pythonResponse.FleschKincaidGrade,
                GunningFog: pythonResponse.GunningFog,
                WordCount: pythonResponse.WordCount,
                ZipfFrequency: pythonResponse.ZipfFrequency,
                AwlRatio: pythonResponse.AwlRatio);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Failed to call AI readability analysis endpoint.");
            return null;
        }
    }

    private sealed record PythonReadabilityResponse(
        [property: JsonPropertyName("flesch_kincaid_grade")] double FleschKincaidGrade,
        [property: JsonPropertyName("gunning_fog")] double GunningFog,
        [property: JsonPropertyName("word_count")] int WordCount,
        [property: JsonPropertyName("zipf_frequency")] double ZipfFrequency,
        [property: JsonPropertyName("awl_ratio")] double AwlRatio);

}
