using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
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

            var questionPrompt = answer.Question?.Content;
            if (!string.IsNullOrWhiteSpace(questionPrompt))
                formContent.Add(new StringContent(questionPrompt), "question_prompt");

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
                Improvements = rubric.Improvements
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

        var availableScores = new[]
        {
            scoringResult.ReadingScore,
            scoringResult.ListeningScore,
            scoringResult.WritingScore,
            scoringResult.SpeakingScore
        }.Where(score => score.HasValue).Select(score => score!.Value).ToList();

        scoringResult.TotalBandScore = availableScores.Count == 0
            ? null
            : RoundIeltsBand(availableScores.Average());
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
