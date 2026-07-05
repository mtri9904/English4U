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

public sealed partial class AiScoringHttpService
{
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
                BandScore = IeltsScoringCalculator.ClampBand(rubric.Band),
                AiComment = rubric.Comment,
                Improvements = rubric.Improvements,
                ConfidenceScore = rubric.Confidence,
                EvidenceData = rubric.Evidence is { Count: > 0 }
                    ? JsonSerializer.Serialize(rubric.Evidence, JsonOptions)
                    : null
            });
        }
    }

    private static AiScoreResponse? TryBuildExistingSpeakingResult(Guid sessionId, UserAnswer answer)
    {
        var feedbacks = answer.AiFeedbacks
            .Where(feedback => string.Equals(feedback.Rubric.SkillType, "Speaking", StringComparison.OrdinalIgnoreCase))
            .Where(feedback => !string.IsNullOrWhiteSpace(feedback.Rubric.CriteriaName))
            .ToList();

        if (feedbacks.Count == 0
            || feedbacks.Any(feedback => feedback.EvidenceData?.Contains("technical_failure=true", StringComparison.OrdinalIgnoreCase) == true))
        {
            return null;
        }

        var rubricLookup = feedbacks
            .GroupBy(feedback => feedback.Rubric.CriteriaName!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        if (SpeakingScoreSummaryBuilder.Criteria.Any(criteria => !rubricLookup.ContainsKey(criteria)))
        {
            return null;
        }

        var rubrics = SpeakingScoreSummaryBuilder.Criteria
            .Select(criteria =>
            {
                var feedback = rubricLookup[criteria];
                return new AiRubricScore(
                    criteria,
                    IeltsScoringCalculator.RoundBand(feedback.BandScore),
                    feedback.AiComment ?? string.Empty,
                    feedback.Improvements ?? string.Empty,
                    feedback.ConfidenceScore,
                    DeserializeEvidenceLines(feedback.EvidenceData));
            })
            .ToList();

        var transcriptText = answer.UserAudioRecords
            .OrderByDescending(record => record.DurationSeconds ?? 0)
            .ThenByDescending(record => record.Id)
            .SelectMany(record => record.SpeechTranscripts)
            .OrderByDescending(transcript => transcript.Id)
            .Select(transcript => transcript.TranscriptText)
            .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));

        var overallBand = rubrics.Count > 0
            ? IeltsScoringCalculator.RoundBand(rubrics.Average(rubric => rubric.Band))
            : IeltsScoringCalculator.RoundBand(answer.ScoreEarned);

        return new AiScoreResponse(
            sessionId.ToString(),
            answer.Id.ToString(),
            overallBand,
            rubrics,
            TranscriptText: transcriptText);
    }

    private static IReadOnlyList<string>? DeserializeEvidenceLines(string? evidenceData)
    {
        if (string.IsNullOrWhiteSpace(evidenceData))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<IReadOnlyList<string>>(evidenceData, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool IsRecoverableSpeakingAnswerScoringFailure(
        HttpStatusCode statusCode,
        string? rawBody,
        string? detail)
    {
        var text = $"{rawBody} {detail}";
        if (statusCode == HttpStatusCode.UnprocessableEntity)
        {
            return true;
        }

        if (statusCode == HttpStatusCode.ServiceUnavailable)
        {
            return text.Contains("\"required_ready\":true", StringComparison.OrdinalIgnoreCase);
        }

        if (statusCode == HttpStatusCode.BadRequest)
        {
            return text.Contains("audio", StringComparison.OrdinalIgnoreCase)
                || text.Contains("transcript", StringComparison.OrdinalIgnoreCase)
                || text.Contains("normalize", StringComparison.OrdinalIgnoreCase);
        }

        return false;
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
            throw new InvalidOperationException(
                GeminiConfiguration.BuildMissingApiKeyMessage("Gemini scoring", "GeminiScoring:ApiKey"));
        }

        var parts = new List<object>
        {
            new { text = WritingScoringPromptBuilder.Build(sessionId, answer) },
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
        return GeminiGenerateContentResponseParser.DeserializeScoreResponse(responseBody, JsonOptions);
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

    private async Task<AiScoreResponse> EnsureVietnameseWritingFeedbackAsync(
        Guid sessionId,
        Guid answerId,
        AiScoreResponse result,
        CancellationToken cancellationToken)
    {
        if (!WritingFeedbackLanguageDetector.NeedsVietnameseNormalization(result))
        {
            return result;
        }

        logger.LogInformation(
            "Writing feedback for answer {AnswerId} contains English feedback. Translating feedback fields to Vietnamese before saving.",
            answerId);

        var requestData = WritingFeedbackTranslationRequestBuilder.Build(result, JsonOptions);

        try
        {
            var responseBody = await RequestGeminiGenerateContentWithFallbackAsync(
                sessionId,
                answerId,
                requestData,
                _feedbackTranslationModelCandidates,
                "feedback translation",
                cancellationToken);

            var translated = GeminiGenerateContentResponseParser.DeserializeScoreResponse(responseBody, JsonOptions);
            return translated is null
                ? result
                : AiScoreResponseNormalizer.NormalizeWriting(sessionId, answerId, translated);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to translate writing feedback to Vietnamese for answer {AnswerId}. Keeping original feedback.", answerId);
            return result;
        }
    }

    private async Task<List<object>> BuildWritingImagePartsAsync(string? assetsData, CancellationToken cancellationToken)
    {
        var parts = new List<object>();
        foreach (var asset in WritingTaskAssetData.ExtractAssetUrls(assetsData).Take(MaxWritingTaskImages))
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

            var mimeType = response.Content.Headers.ContentType?.MediaType ?? WritingTaskAssetData.InferImageMimeType(uri.AbsolutePath);
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

    private async Task<Stream?> DownloadAudioAsync(string audioUrl, CancellationToken cancellationToken)
    {
        try
        {
            var bytes = await httpClient.GetByteArrayAsync(audioUrl, cancellationToken);
            return new System.IO.MemoryStream(bytes);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to download audio from {Url}", audioUrl);
            return null;
        }
    }

}
