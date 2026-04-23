using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Docnet.Core;
using Docnet.Core.Models;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService(
    HttpClient httpClient,
    IApplicationDbContext context,
    IExamService examService,
    IPdfGenerationProgressTracker pdfGenerationProgressTracker,
    IRealtimeEventPublisher realtimeEventPublisher,
    IConfiguration configuration,
    ILogger<GemmaPdfExamGenerationService> logger) : IExamPdfGenerationService
{
    private const int MaxJsonParseRetries = 2;
    private const int DefaultDelayBetweenPassageCallsMs = 6000;
    private const int RawReviewMaxApiRetries = 0;
    private const int MaxPassageInputCharacters = 12000;
    private const int MaxSegmentInputCharacters = 9000;
    private const int MaxSegmentSharedPassageContextCharacters = 5000;
    private const int SegmentDelayBetweenCallsMs = 1500;
    private const int RawReviewDelayBetweenAiCallsMs = 900;
    private const int MaxFallbackAnswerKeyCharacters = 14000;
    private const int MaxAiAnswerKeySourceCharacters = 26000;
    private const int MaxFallbackOptionSourceCharacters = 18000;
    private const int MinimumVerifiedAnswersToEnableStrictClearing = 20;
    private const int MaxRawReviewDiagramPreviewBytes = 6 * 1024 * 1024;
    private const int MinDiagramPreviewImageSamples = 80;
    private const int MaxVisualPreviewPagesPerGroup = 2;
    private const int MaxVisualPreviewImagesPerPage = 2;
    private const int MaxDedicatedMatchingVisualSearchPages = 3;
    private const double MinMatchingVisualPageCoverage = 0.025d;
    private const int ApiRateLimitFallbackDelayMs = 5000;
    private const int ApiTransientErrorFallbackDelayMs = 3000;
    private const string PdfGenerationProgressEventType = "exam.pdf-generation.progress";
    private const string DefaultGemmaBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/";
    private const string DefaultGemmaModel = "gemma-3-27b-it";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly string _gemmaApiKey =
        configuration["GemmaExamGeneration:ApiKey"]
        ?? configuration["GEMINI_API_KEY"]
        ?? string.Empty;
    private readonly string _gemmaModel = configuration["GemmaExamGeneration:Model"] ?? DefaultGemmaModel;
    private readonly double _gemmaTemperature = configuration.GetValue<double?>("GemmaExamGeneration:Temperature") ?? 0.1d;
    private readonly int _delayBetweenPassageCallsMs = Math.Clamp(
        configuration.GetValue<int?>("GemmaExamGeneration:DelayBetweenPassageCallsMs") ?? DefaultDelayBetweenPassageCallsMs,
        1000,
        30000);

    public async Task<GenerateExamFromPdfResultDto> GenerateFromPdfAsync(
        Stream pdfStream,
        string fileName,
        Guid uploadedBy,
        string? clientRequestId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name is required.", nameof(fileName));
        }

        var documentUpload = new DocumentUpload
        {
            Id = Guid.NewGuid(),
            UploadedBy = uploadedBy,
            FileName = fileName,
            FileUrl = BuildVirtualPdfUrl(fileName),
            ProcessStatus = "Processing",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.DocumentUploads.Add(documentUpload);
        await context.SaveChangesAsync(cancellationToken);

        var currentProgress = 2;
        await PublishProgressAsync(
            documentUpload.Id,
            uploadedBy,
            status: "processing",
            progressPercent: currentProgress,
            stage: "queued",
            message: $"Đã nhận file '{fileName}', bắt đầu xử lý.",
            clientRequestId: clientRequestId,
            cancellationToken: cancellationToken);

        try
        {
            currentProgress = 10;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "extract_text",
                message: "Đang trích xuất nội dung từ PDF.",
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var extraction = await ExtractPdfTextResultAsync(pdfStream, cancellationToken);
            var rawText = extraction.RawText;
            var normalizedRawText = rawText
                .Replace("\r\n", "\n")
                .Replace('\r', '\n');

            var answerZone = ExtractAnswerZone(normalizedRawText);
            if (string.IsNullOrWhiteSpace(answerZone))
            {
                // Một số PDF không có heading "Solution" rõ ràng; fallback sang review zone để tránh answer-zone = 0 chars.
                answerZone = ExtractReviewAndExplanationsZone(normalizedRawText);
            }

            var answerKeyMap = ExtractAnswerKeyMap(rawText);
            logger.LogInformation(
                "Extracted {AnswerCount} answer-key entries from {FileName}.",
                answerKeyMap.Count,
                fileName);
            if (answerKeyMap.Count > 0)
            {
                var answerKeyPreview = string.Join(
                    ", ",
                    answerKeyMap
                        .OrderBy(pair => pair.Key)
                        .Take(12)
                        .Select(pair => $"{pair.Key}:{pair.Value}"));
                logger.LogInformation(
                    "Deterministic answer-key preview for {FileName}: {AnswerKeyPreview}",
                    fileName,
                    answerKeyPreview);
            }
            if (answerKeyMap.Count == 0)
            {
                logger.LogWarning(
                    "No deterministic answer-key entries were extracted from {FileName}. Answer-zone preview: {AnswerZonePreview}",
                    fileName,
                    BuildTextPreview(answerZone));
            }

            if (ShouldTriggerAiAnswerKeyRecovery(answerKeyMap, answerZone))
            {
                currentProgress = Math.Max(currentProgress, 14);
                await PublishProgressAsync(
                    documentUpload.Id,
                    uploadedBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "answer_key_recovery",
                    message: "Đang dùng AI để bóc tách lại Answer Key do dữ liệu PDF bị dính chữ/lệch layout.",
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                var aiAnswerKeyMap = await TryExtractAnswerKeyWithGemmaAsync(
                    normalizedRawText,
                    cancellationToken);

                if (aiAnswerKeyMap.Count > 0)
                {
                    var deterministicNoisyEntries = CountNoisyAnswerKeyEntries(answerKeyMap);
                    var shouldForceReplaceWithAi =
                        deterministicNoisyEntries >= 3 &&
                        aiAnswerKeyMap.Count >= 20;

                    if (shouldForceReplaceWithAi)
                    {
                        answerKeyMap = new Dictionary<int, string>(aiAnswerKeyMap);

                        logger.LogInformation(
                            "Force-replaced deterministic answer-key map with AI preprocessed map for {FileName}. AI entries: {AiCount}, noisy deterministic entries: {NoisyCount}.",
                            fileName,
                            aiAnswerKeyMap.Count,
                            deterministicNoisyEntries);
                    }
                    else if (ShouldPreferAiAnswerKeyMap(answerKeyMap, aiAnswerKeyMap))
                    {
                        var strictBackfillEntries = BuildStrictDeterministicBackfill(answerKeyMap, aiAnswerKeyMap);
                        answerKeyMap = new Dictionary<int, string>(aiAnswerKeyMap);
                        foreach (var pair in strictBackfillEntries)
                        {
                            answerKeyMap[pair.Key] = pair.Value;
                        }

                        logger.LogInformation(
                            "Replaced deterministic answer-key map with AI preprocessed map for {FileName}. AI entries: {AiCount}, strict deterministic backfill: {BackfillCount}, noisy deterministic entries: {NoisyCount}.",
                            fileName,
                            aiAnswerKeyMap.Count,
                            strictBackfillEntries.Count,
                            deterministicNoisyEntries);
                    }
                    else
                    {
                        var mergedCount = 0;
                        foreach (var pair in aiAnswerKeyMap)
                        {
                            if (pair.Key is < 1 or > 40)
                            {
                                continue;
                            }

                            if (!IsStrictAnswerKeyValue(pair.Value))
                            {
                                continue;
                            }

                            answerKeyMap[pair.Key] = pair.Value;
                            mergedCount++;
                        }

                        logger.LogInformation(
                            "Merged {AiCount} AI answer-key entries into deterministic map for {FileName}. Noisy deterministic entries: {NoisyCount}.",
                            mergedCount,
                            deterministicNoisyEntries,
                            fileName);
                    }
                }
            }

            currentProgress = 20;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "chunk_passages",
                message: "Đang tách PDF thành từng Reading Passage.",
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var passages = SplitPassages(rawText);
            logger.LogInformation(
                "Passage split result for {FileName}: {PassageCount} passage(s). Lengths: {PassageLengths}",
                fileName,
                passages.Count,
                string.Join(", ", passages.Select(p => p.Length)));

            if (passages.Count == 0)
            {
                logger.LogWarning(
                    "Unable to detect reading passage markers in uploaded PDF {FileName}. Extracted preview: {Preview}",
                    fileName,
                    BuildTextPreview(rawText));

                throw new InvalidOperationException(
                    "Unable to detect any reading passage in the uploaded PDF. Expected markers: Reading Passage 1/2/3.");
            }

            if (passages.Count != 3)
            {
                throw new InvalidOperationException(
                    $"Detected {passages.Count} passage(s). IELTS Reading exam generation expects exactly 3 passages (Reading Passage 1/2/3).");
            }

            currentProgress = 25;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "chunk_ready",
                message: $"Đã nhận diện {passages.Count} passage, bắt đầu gọi Gemma.",
                totalPassages: passages.Count,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var parsedPassages = new List<GemmaPassagePayload>(passages.Count);
            for (var i = 0; i < passages.Count; i++)
            {
                var passageNumber = i + 1;
                currentProgress = Math.Clamp(
                    25 + (int)Math.Round((double)i / passages.Count * 55),
                    25,
                    85);

                await PublishProgressAsync(
                    documentUpload.Id,
                    uploadedBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "processing_passage",
                    message: $"Đang xử lý passage {passageNumber}/{passages.Count}.",
                    passageNumber: passageNumber,
                    totalPassages: passages.Count,
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                var preparedPassageText = PreparePassageInputForGemma(passages[i], allowHardTrim: false);

                var parsed = await ExtractPassageWithAdaptiveSegmentationAsync(
                    preparedPassageText,
                    passageNumber,
                    passages.Count,
                    onInvalidJson: async (attempt, maxAttempts, segmentIndex, segmentTotal) =>
                    {
                        var segmentSuffix = segmentTotal > 1
                            ? $" [segment {segmentIndex}/{segmentTotal}]"
                            : string.Empty;

                        await PublishProgressAsync(
                            documentUpload.Id,
                            uploadedBy,
                            status: "processing",
                            progressPercent: currentProgress,
                            stage: "json_retry",
                            message: $"Passage {passageNumber}{segmentSuffix}: JSON chưa hợp lệ, đang thử lại {attempt}/{maxAttempts}.",
                            passageNumber: passageNumber,
                            totalPassages: passages.Count,
                            clientRequestId: clientRequestId,
                            cancellationToken: cancellationToken);
                    },
                    onApiRetry: async (attempt, maxAttempts, retryDelay, reason, segmentIndex, segmentTotal) =>
                    {
                        var segmentSuffix = segmentTotal > 1
                            ? $" [segment {segmentIndex}/{segmentTotal}]"
                            : string.Empty;

                        await PublishProgressAsync(
                            documentUpload.Id,
                            uploadedBy,
                            status: "processing",
                            progressPercent: currentProgress,
                            stage: "api_retry",
                            message: $"Passage {passageNumber}{segmentSuffix}: {reason}. Thử lại sau {Math.Ceiling(retryDelay.TotalSeconds)}s ({attempt}/{maxAttempts}).",
                            passageNumber: passageNumber,
                            totalPassages: passages.Count,
                            clientRequestId: clientRequestId,
                            cancellationToken: cancellationToken);
                    },
                    cancellationToken: cancellationToken);

                parsedPassages.Add(parsed);

                currentProgress = Math.Clamp(
                    25 + (int)Math.Round((double)(i + 1) / passages.Count * 55),
                    30,
                    90);

                await PublishProgressAsync(
                    documentUpload.Id,
                    uploadedBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "passage_completed",
                    message: $"Đã xử lý xong passage {passageNumber}/{passages.Count}.",
                    passageNumber: passageNumber,
                    totalPassages: passages.Count,
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                if (i < passages.Count - 1)
                {
                    await PublishProgressAsync(
                        documentUpload.Id,
                        uploadedBy,
                        status: "processing",
                        progressPercent: currentProgress,
                        stage: "rate_limit_wait",
                        message: $"Chờ {_delayBetweenPassageCallsMs / 1000}s trước khi xử lý passage tiếp theo.",
                        passageNumber: passageNumber,
                        totalPassages: passages.Count,
                        clientRequestId: clientRequestId,
                        cancellationToken: cancellationToken);

                    await Task.Delay(_delayBetweenPassageCallsMs, cancellationToken);
                }
            }

            currentProgress = 92;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "build_exam",
                message: "Đang map dữ liệu passage/question thành đề thi.",
                totalPassages: parsedPassages.Count,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            NormalizeQuestionTypes(parsedPassages);

            if (!string.IsNullOrWhiteSpace(rawText))
            {
                currentProgress = Math.Max(currentProgress, 93);
                await PublishProgressAsync(
                    documentUpload.Id,
                    uploadedBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "option_reconcile",
                    message: "Đang khôi phục các lựa chọn trắc nghiệm bị thiếu từ phần Review/Solution.",
                    totalPassages: parsedPassages.Count,
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                var recoveredOptionCount = await TryRecoverMissingOptionsAsync(
                    parsedPassages,
                    rawText,
                    cancellationToken);

                logger.LogInformation(
                    "Recovered options for {RecoveredOptionCount} question(s) from raw/review text for {FileName}.",
                    recoveredOptionCount,
                    fileName);
            }

            var verifiedAnswerQuestionNumbers = ApplyAnswerKeyOverrides(parsedPassages, answerKeyMap);
            logger.LogInformation(
                "Applied answer-key overrides for {VerifiedQuestionCount} question(s) from extracted answer key for {FileName}.",
                verifiedAnswerQuestionNumbers.Count,
                fileName);

            var unresolvedAnswerCount = CountMissingOrInvalidAnswers(parsedPassages);
            if (unresolvedAnswerCount > 0 &&
                !string.IsNullOrWhiteSpace(answerZone) &&
                answerKeyMap.Count > 0)
            {
                currentProgress = Math.Max(currentProgress, 94);
                await PublishProgressAsync(
                    documentUpload.Id,
                    uploadedBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "answer_reconcile",
                    message: $"Đang đối soát đáp án theo Answer Key/Solution ({unresolvedAnswerCount} câu cần xác minh).",
                    totalPassages: parsedPassages.Count,
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                var fallbackResult = await TryApplyFallbackAnswerMappingAsync(
                    parsedPassages,
                    answerZone,
                    cancellationToken);
                verifiedAnswerQuestionNumbers.UnionWith(fallbackResult.VerifiedQuestionNumbers);

                logger.LogInformation(
                    "Applied {FallbackAppliedCount} fallback answer update(s), verified {FallbackVerifiedCount} question(s) from fallback mapping for {FileName}.",
                    fallbackResult.AppliedCount,
                    fallbackResult.VerifiedQuestionNumbers.Count,
                    fileName);
            }
            else if (unresolvedAnswerCount > 0 && answerKeyMap.Count == 0)
            {
                logger.LogWarning(
                    "Skip fallback answer mapping because deterministic answer-key extraction found 0 entries for {FileName}.",
                    fileName);
            }

            // Re-normalize question types after answer reconciliation so MCQ single/multiple can be inferred from final answers.
            NormalizeQuestionTypes(parsedPassages);

            if (!string.IsNullOrWhiteSpace(answerZone))
            {
                var explanationMap = ExtractExplanationMap(answerZone);
                var appliedExplanationCount = ApplyExplanationOverrides(parsedPassages, explanationMap);
                if (appliedExplanationCount > 0)
                {
                    logger.LogInformation(
                        "Applied explanation text for {AppliedExplanationCount} question(s) from Review/Solution for {FileName}.",
                        appliedExplanationCount,
                        fileName);
                }
            }

            var hasEnoughEvidenceToClearUnverifiedAnswers =
                answerKeyMap.Count >= MinimumVerifiedAnswersToEnableStrictClearing ||
                verifiedAnswerQuestionNumbers.Count >= MinimumVerifiedAnswersToEnableStrictClearing;

            if (hasEnoughEvidenceToClearUnverifiedAnswers)
            {
                var clearedHallucinatedAnswers = ClearAnswersWithoutEvidence(
                    parsedPassages,
                    verifiedAnswerQuestionNumbers);

                if (clearedHallucinatedAnswers > 0)
                {
                    logger.LogInformation(
                        "Cleared {ClearedHallucinatedAnswers} unverified answer(s) to prevent hallucinated outputs for {FileName}.",
                        clearedHallucinatedAnswers,
                        fileName);
                }
            }
            else if (answerKeyMap.Count == 0)
            {
                logger.LogWarning(
                    "Skip clearing unverified answers because deterministic answer-key extraction produced 0 entries for {FileName}. Existing model answers are preserved.",
                    fileName);
            }

            currentProgress = Math.Max(currentProgress, 95);
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "review_question_groups",
                message: "Đang đồng bộ instruction, dạng câu và hình minh họa theo raw preview.",
                totalPassages: parsedPassages.Count,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var reviewedQuestionGroupsByPassage = await BuildReviewedQuestionGroupPreviewsAsync(
                passages,
                extraction.Pages,
                extraction.PdfBytes,
                cancellationToken);

            var createExamDto = await BuildCreateExamDtoAsync(
                parsedPassages,
                passages,
                reviewedQuestionGroupsByPassage,
                fileName,
                cancellationToken);
            var totalQuestions = Convert.ToInt32(createExamDto.TotalPoints ?? 0d);

            currentProgress = 96;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "save_exam",
                message: "Đang lưu đề thi vào cơ sở dữ liệu.",
                totalPassages: parsedPassages.Count,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var examId = await examService.CreateExamAsync(createExamDto, uploadedBy, cancellationToken);

            var exam = await context.Exams.FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);
            if (exam is not null)
            {
                exam.SourcePdfUrl = documentUpload.FileUrl;
            }

            documentUpload.GeneratedExamId = examId;
            documentUpload.ProcessStatus = "Completed";
            documentUpload.ErrorMessage = null;
            documentUpload.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync(cancellationToken);

            currentProgress = 100;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "completed",
                progressPercent: currentProgress,
                stage: "completed",
                message: $"Tạo đề thành công: {totalQuestions} câu hỏi.",
                totalPassages: parsedPassages.Count,
                examId: examId,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            return new GenerateExamFromPdfResultDto(
                ExamId: examId,
                UploadId: documentUpload.Id,
                PassageCount: parsedPassages.Count,
                QuestionCount: totalQuestions);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to generate exam from uploaded PDF {FileName}", fileName);

            documentUpload.ProcessStatus = "Failed";
            documentUpload.ErrorMessage = ex.Message;
            documentUpload.UpdatedAt = DateTime.UtcNow;

            try
            {
                await context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception saveEx)
            {
                logger.LogError(saveEx, "Failed to persist document upload error state for {UploadId}", documentUpload.Id);
            }

            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "failed",
                progressPercent: currentProgress,
                stage: "failed",
                message: ex.Message,
                clientRequestId: clientRequestId,
                cancellationToken: CancellationToken.None);

            throw;
        }
    }

    public async Task<PdfRawExtractionPreviewDto> PreviewPdfExtractionAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        if (pdfStream is null)
        {
            throw new ArgumentNullException(nameof(pdfStream));
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name is required.", nameof(fileName));
        }

        var rawText = await ExtractPdfTextAsync(pdfStream, cancellationToken);
        var normalizedRawText = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var answerZone = ExtractAnswerZone(normalizedRawText);
        var answerKeyMap = ExtractAnswerKeyMap(rawText);
        var passages = SplitPassages(rawText);
        var questionGroupInstructionPreviews = BuildQuestionGroupInstructionPreviews(passages);

        var passagePreviews = new List<PdfRawPassagePreviewDto>(passages.Count);
        for (var index = 0; index < passages.Count; index++)
        {
            var passageNumber = index + 1;
            var original = passages[index];
            var prepared = PreparePassageInputForGemma(original, allowHardTrim: false);
            var segments = BuildPassageQuestionSegments(prepared, passageNumber);
            var segmentPreviews = segments.Select((segment, segmentIndex) =>
                    new PdfRawQuestionSegmentPreviewDto(
                        SegmentIndex: segmentIndex + 1,
                        StartQuestion: segment.StartQuestion,
                        EndQuestion: segment.EndQuestion,
                        SegmentTextLength: segment.Text.Length,
                        SegmentText: segment.Text))
                .ToList();

            passagePreviews.Add(new PdfRawPassagePreviewDto(
                PassageNumber: passageNumber,
                OriginalLength: original.Length,
                PreparedLength: prepared.Length,
                OriginalText: original,
                PreparedText: prepared,
                QuestionSegments: segmentPreviews));
        }

        return new PdfRawExtractionPreviewDto(
            FileName: fileName.Trim(),
            RawTextLength: normalizedRawText.Length,
            RawText: normalizedRawText,
            AnswerZoneLength: answerZone?.Length ?? 0,
            AnswerZone: answerZone ?? string.Empty,
            AnswerKeyEntryCount: answerKeyMap.Count,
            AnswerKeyEntries: answerKeyMap,
            QuestionGroupInstructions: questionGroupInstructionPreviews,
            Passages: passagePreviews);
    }

    public async Task<PdfQuestionGroupPreviewDto> PreviewPdfQuestionGroupsAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        if (pdfStream is null)
        {
            throw new ArgumentNullException(nameof(pdfStream));
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name is required.", nameof(fileName));
        }

        var rawText = await ExtractPdfTextAsync(pdfStream, cancellationToken);
        var passages = SplitPassages(rawText);

        return new PdfQuestionGroupPreviewDto(
            FileName: fileName.Trim(),
            PassageCount: passages.Count,
            QuestionGroups: BuildQuestionGroupInstructionPreviews(passages));
    }

    public async Task<PdfRawReviewDto> ReviewPdfRawAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        if (pdfStream is null)
        {
            throw new ArgumentNullException(nameof(pdfStream));
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name is required.", nameof(fileName));
        }

        var extraction = await ExtractPdfTextResultAsync(pdfStream, cancellationToken);
        var rawText = extraction.RawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var deterministicPassages = SplitPassages(rawText);
        var solutionZone = ExtractSolutionOnlyZone(rawText);
        var reviewZone = ExtractReviewAndExplanationsZone(rawText);
        var deterministicAnswerKey = ExtractAnswerKeyMap(rawText);
        var trace = new List<PdfRawReviewRequestTraceDto>
        {
            new(
                StepName: "extract_pdf_text",
                InputLength: 0,
                OutputLength: rawText.Length,
                Status: "completed",
                Notes: extraction.Engine)
        };

        var structure = await ReviewRawDocumentStructureAsync(
            rawText,
            deterministicPassages,
            solutionZone,
            reviewZone,
            trace,
            cancellationToken);

        var passageReviews = new List<PdfRawReviewPassageDto>(structure.Passages.Count);
        for (var index = 0; index < structure.Passages.Count; index++)
        {
            var passage = structure.Passages[index];
            var questionGroups = await ReviewPassageQuestionGroupsAsync(
                passage,
                trace,
                cancellationToken);
            questionGroups = AttachDiagramPreviewImages(questionGroups, extraction.Pages, extraction.PdfBytes);

            passageReviews.Add(new PdfRawReviewPassageDto(
                PassageNumber: passage.PassageNumber,
                Title: passage.Title,
                QuestionRange: passage.QuestionRange,
                RawText: passage.RawText,
                QuestionGroups: questionGroups));

            if (index < structure.Passages.Count - 1)
            {
                await Task.Delay(RawReviewDelayBetweenAiCallsMs, cancellationToken);
            }
        }

        var solutionSectionRaw = NormalizeSolutionSectionRaw(
            structure.SolutionSectionRaw,
            solutionZone,
            deterministicAnswerKey);
        var reviewSectionRaw = !string.IsNullOrWhiteSpace(structure.ReviewSectionRaw)
            ? structure.ReviewSectionRaw
            : reviewZone;

        var solutionSection = await ReviewAnswerSectionAsync(
            solutionSectionRaw,
            deterministicAnswerKey,
            trace,
            cancellationToken);

        if (solutionSection is not null && !string.IsNullOrWhiteSpace(reviewSectionRaw))
        {
            await Task.Delay(RawReviewDelayBetweenAiCallsMs, cancellationToken);
        }

        var explanationSection = await ReviewExplanationSectionAsync(
            reviewSectionRaw,
            trace,
            cancellationToken);

        return new PdfRawReviewDto(
            FileName: fileName.Trim(),
            ExtractionEngine: extraction.Engine,
            PageCount: extraction.PageCount,
            RawTextLength: rawText.Length,
            RawText: rawText,
            Structure: structure,
            Passages: passageReviews,
            SolutionSection: solutionSection,
            ReviewSection: explanationSection,
            RequestTrace: trace);
    }

    private async Task<PdfRawReviewStructureDto> ReviewRawDocumentStructureAsync(
        string rawText,
        IReadOnlyList<string> deterministicPassages,
        string answerZone,
        string reviewZone,
        List<PdfRawReviewRequestTraceDto> trace,
        CancellationToken cancellationToken)
    {
        var prompt = BuildRawReviewStructurePrompt(rawText, deterministicPassages, answerZone, reviewZone);
        var stepName = "ai_document_structure";

        try
        {
            var rawResponse = await RequestGemmaJsonCompletionBestEffortAsync(prompt, cancellationToken);
            if (TryDeserializeAiReviewResponse<RawReviewStructureResponse>(rawResponse, out var payload, out var parseError) &&
                payload is not null)
            {
                var passages = NormalizeStructurePassages(payload.Passages, deterministicPassages);
                if (passages.Count > 0)
                {
                    trace.Add(new PdfRawReviewRequestTraceDto(
                        StepName: stepName,
                        InputLength: prompt.Length,
                        OutputLength: rawResponse.Length,
                        Status: "completed",
                        Notes: $"passages={passages.Count}"));

                    return new PdfRawReviewStructureDto(
                        Passages: passages,
                        SolutionSectionRaw: string.IsNullOrWhiteSpace(payload.SolutionSectionRaw) ? answerZone : payload.SolutionSectionRaw.Trim(),
                        ReviewSectionRaw: string.IsNullOrWhiteSpace(payload.ReviewSectionRaw) ? reviewZone : payload.ReviewSectionRaw.Trim());
                }
            }
            else
            {
                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "Invalid structure response"));
            }
        }
        catch (Exception ex)
        {
            trace.Add(new PdfRawReviewRequestTraceDto(
                StepName: stepName,
                InputLength: prompt.Length,
                OutputLength: 0,
                Status: "fallback",
                Notes: ex.Message));
        }

        return BuildDeterministicReviewStructure(deterministicPassages, answerZone, reviewZone);
    }

    private async Task<List<PdfRawQuestionInstructionPreviewDto>> ReviewPassageQuestionGroupsAsync(
        PdfRawReviewPassageSeedDto passage,
        List<PdfRawReviewRequestTraceDto> trace,
        CancellationToken cancellationToken)
    {
        var reviewBlocks = BuildQuestionGroupReviewBlocks(passage.RawText);
        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);
        var prompt = BuildPassageQuestionGroupReviewPrompt(passage, reviewBlocks);
        var stepName = $"ai_passage_{passage.PassageNumber}_question_groups";

        try
        {
            var rawResponse = await RequestGemmaJsonCompletionBestEffortAsync(prompt, cancellationToken);
            if (TryDeserializeAiReviewResponse<RawReviewQuestionGroupsResponse>(rawResponse, out var payload, out var parseError) &&
                payload?.QuestionGroups is { Count: > 0 })
            {
                var groups = payload.QuestionGroups
                    .Select(item =>
                    {
                        reviewBlockMap.TryGetValue((item.StartQuestion, item.EndQuestion), out var block);
                        var instruction = ResolveQuestionGroupInstruction(
                                item.Instruction ?? block?.Instruction,
                                block?.BlockText,
                                passage.RawText,
                                item.StartQuestion,
                                item.EndQuestion)
                            ?? string.Empty;
                        var questionPreview = ResolveQuestionPreview(item.QuestionPreview, block?.QuestionPreview);
                        var tags = string.IsNullOrWhiteSpace(item.Tags)
                            ? BuildQuestionRangeLabel(item.StartQuestion, item.EndQuestion)
                            : item.Tags.Trim();
                        var (groupType, typeEvidence) = InferQuestionGroupTypeAndEvidence(
                            instruction,
                            questionPreview,
                            block?.BlockText,
                            NormalizeGroupType(item.GroupType) ?? block?.HeuristicGroupType,
                            item.StartQuestion,
                            item.EndQuestion);
                        var resolvedTypeEvidence = typeEvidence;
                        if (string.IsNullOrWhiteSpace(resolvedTypeEvidence) ||
                            resolvedTypeEvidence.StartsWith("Fallback to parser/AI", StringComparison.Ordinal))
                        {
                            resolvedTypeEvidence = string.IsNullOrWhiteSpace(item.TypeEvidence)
                                ? block?.TypeEvidence
                                : item.TypeEvidence.Trim();
                        }

                        return new PdfRawQuestionInstructionPreviewDto(
                            PassageNumber: passage.PassageNumber,
                            StartQuestion: item.StartQuestion,
                            EndQuestion: item.EndQuestion,
                            Tags: tags,
                            GroupType: groupType,
                            Instruction: instruction,
                            QuestionPreview: questionPreview,
                            TypeEvidence: resolvedTypeEvidence);
                    })
                    .Where(item => item.StartQuestion > 0 && item.EndQuestion >= item.StartQuestion)
                    .GroupBy(item => (item.StartQuestion, item.EndQuestion))
                    .Select(group => group.First())
                    .OrderBy(item => item.StartQuestion)
                    .ToList();

                var fallbackMissingGroups = ReadingQuestionGroupOutlineParser.Extract(passage.RawText)
                    .Where(outline => groups.All(group =>
                        group.StartQuestion != outline.StartQuestion ||
                        group.EndQuestion != outline.EndQuestion))
                    .Select(outline =>
                    {
                        reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
                        var instruction = ResolveQuestionGroupInstruction(
                                outline.Instruction,
                                block?.BlockText,
                                passage.RawText,
                                outline.StartQuestion,
                                outline.EndQuestion)
                            ?? string.Empty;
                        var questionPreview = ResolveQuestionPreview(null, block?.QuestionPreview);
                        var (groupType, typeEvidence) = InferQuestionGroupTypeAndEvidence(
                            instruction,
                            questionPreview,
                            block?.BlockText,
                            outline.GroupType ?? block?.HeuristicGroupType,
                            outline.StartQuestion,
                            outline.EndQuestion);

                        return new PdfRawQuestionInstructionPreviewDto(
                            PassageNumber: passage.PassageNumber,
                            StartQuestion: outline.StartQuestion,
                            EndQuestion: outline.EndQuestion,
                            Tags: outline.Tags,
                            GroupType: groupType,
                            Instruction: instruction,
                            QuestionPreview: questionPreview,
                            TypeEvidence: typeEvidence);
                    })
                    .ToList();

                if (fallbackMissingGroups.Count > 0)
                {
                    groups = groups
                        .Concat(fallbackMissingGroups)
                        .GroupBy(item => (item.StartQuestion, item.EndQuestion))
                        .Select(group => group.First())
                        .OrderBy(item => item.StartQuestion)
                        .ToList();
                }

                if (groups.Count > 0)
                {
                    trace.Add(new PdfRawReviewRequestTraceDto(
                        StepName: stepName,
                        InputLength: prompt.Length,
                        OutputLength: rawResponse.Length,
                        Status: "completed",
                        Notes: $"groups={groups.Count}"));

                    return groups;
                }

                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "No valid question groups"));
            }
            else
            {
                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "Invalid question-group response"));
            }
        }
        catch (Exception ex)
        {
            trace.Add(new PdfRawReviewRequestTraceDto(
                StepName: stepName,
                InputLength: prompt.Length,
                OutputLength: 0,
                Status: "fallback",
                Notes: ex.Message));
        }

        return ReadingQuestionGroupOutlineParser.Extract(passage.RawText)
            .Select(outline =>
            {
                reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
                var instruction = ResolveQuestionGroupInstruction(
                        outline.Instruction,
                        block?.BlockText,
                        passage.RawText,
                        outline.StartQuestion,
                        outline.EndQuestion)
                    ?? string.Empty;
                var questionPreview = ResolveQuestionPreview(null, block?.QuestionPreview);
                var (groupType, typeEvidence) = InferQuestionGroupTypeAndEvidence(
                    instruction,
                    questionPreview,
                    block?.BlockText,
                    outline.GroupType ?? block?.HeuristicGroupType,
                    outline.StartQuestion,
                    outline.EndQuestion);

                return new PdfRawQuestionInstructionPreviewDto(
                    PassageNumber: passage.PassageNumber,
                    StartQuestion: outline.StartQuestion,
                    EndQuestion: outline.EndQuestion,
                    Tags: outline.Tags,
                    GroupType: groupType,
                    Instruction: instruction,
                    QuestionPreview: questionPreview,
                    TypeEvidence: typeEvidence);
            })
            .ToList();
    }

    private async Task<PdfRawReviewAnswerSectionDto?> ReviewAnswerSectionAsync(
        string solutionSectionRaw,
        IReadOnlyDictionary<int, string> deterministicAnswerKey,
        List<PdfRawReviewRequestTraceDto> trace,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(solutionSectionRaw))
        {
            trace.Add(new PdfRawReviewRequestTraceDto(
                StepName: "ai_solution_section",
                InputLength: 0,
                OutputLength: 0,
                Status: "skipped",
                Notes: "Solution section is empty"));
            return null;
        }

        var prompt = BuildAnswerSectionReviewPrompt(solutionSectionRaw);
        var stepName = "ai_solution_section";

        try
        {
            var rawResponse = await RequestGemmaJsonCompletionBestEffortAsync(prompt, cancellationToken);
            if (TryDeserializeAiReviewResponse<RawReviewAnswersResponse>(rawResponse, out var payload, out var parseError) &&
                payload?.Answers is { Count: > 0 })
            {
                var mergedAnswers = deterministicAnswerKey.ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value,
                    EqualityComparer<int>.Default);

                foreach (var item in payload.Answers
                    .Where(item => item.QuestionNumber > 0 && !string.IsNullOrWhiteSpace(item.Answer))
                    .GroupBy(item => item.QuestionNumber)
                    .Select(group => group.First())
                    .OrderBy(item => item.QuestionNumber))
                {
                    if (!mergedAnswers.ContainsKey(item.QuestionNumber))
                    {
                        mergedAnswers[item.QuestionNumber] = item.Answer!.Trim();
                    }
                }

                var answers = mergedAnswers
                    .OrderBy(pair => pair.Key)
                    .Select(pair => new PdfRawReviewAnswerItemDto(
                        QuestionNumber: pair.Key,
                        Answer: pair.Value))
                    .ToList();

                if (answers.Count > 0)
                {
                    trace.Add(new PdfRawReviewRequestTraceDto(
                        StepName: stepName,
                        InputLength: prompt.Length,
                        OutputLength: rawResponse.Length,
                        Status: "completed",
                        Notes: $"answers={answers.Count}"));

                    return new PdfRawReviewAnswerSectionDto(
                        RawText: NormalizeSolutionSectionRaw(solutionSectionRaw, solutionSectionRaw, mergedAnswers),
                        Answers: answers);
                }

                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "No valid answers"));
            }
            else
            {
                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "Invalid answer response"));
            }
        }
        catch (Exception ex)
        {
            trace.Add(new PdfRawReviewRequestTraceDto(
                StepName: stepName,
                InputLength: prompt.Length,
                OutputLength: 0,
                Status: "fallback",
                Notes: ex.Message));
        }

        if (deterministicAnswerKey.Count == 0)
        {
            return new PdfRawReviewAnswerSectionDto(
                RawText: solutionSectionRaw,
                Answers: []);
        }

        return new PdfRawReviewAnswerSectionDto(
            RawText: NormalizeSolutionSectionRaw(solutionSectionRaw, solutionSectionRaw, deterministicAnswerKey),
            Answers: deterministicAnswerKey
                .OrderBy(pair => pair.Key)
                .Select(pair => new PdfRawReviewAnswerItemDto(pair.Key, pair.Value))
                .ToList());
    }

    private async Task<PdfRawReviewExplanationSectionDto?> ReviewExplanationSectionAsync(
        string reviewSectionRaw,
        List<PdfRawReviewRequestTraceDto> trace,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(reviewSectionRaw))
        {
            trace.Add(new PdfRawReviewRequestTraceDto(
                StepName: "ai_review_explanations",
                InputLength: 0,
                OutputLength: 0,
                Status: "skipped",
                Notes: "Review section is empty"));
            return null;
        }

        var prompt = BuildExplanationSectionReviewPrompt(reviewSectionRaw);
        var stepName = "ai_review_explanations";

        try
        {
            var rawResponse = await RequestGemmaJsonCompletionBestEffortAsync(prompt, cancellationToken);
            if (TryDeserializeAiReviewResponse<RawReviewExplanationsResponse>(rawResponse, out var payload, out var parseError) &&
                payload?.Explanations is { Count: > 0 })
            {
                var explanations = payload.Explanations
                    .Where(item => item.QuestionNumber > 0 &&
                                   (!string.IsNullOrWhiteSpace(item.Answer) || !string.IsNullOrWhiteSpace(item.Explanation)))
                    .GroupBy(item => item.QuestionNumber)
                    .Select(group => group.First())
                    .OrderBy(item => item.QuestionNumber)
                    .Select(item => new PdfRawReviewExplanationItemDto(
                        QuestionNumber: item.QuestionNumber,
                        Answer: item.Answer?.Trim() ?? string.Empty,
                        Explanation: item.Explanation?.Trim() ?? string.Empty))
                    .ToList();

                if (explanations.Count > 0)
                {
                    trace.Add(new PdfRawReviewRequestTraceDto(
                        StepName: stepName,
                        InputLength: prompt.Length,
                        OutputLength: rawResponse.Length,
                        Status: "completed",
                        Notes: $"explanations={explanations.Count}"));

                    return new PdfRawReviewExplanationSectionDto(
                        RawText: reviewSectionRaw,
                        Explanations: explanations);
                }

                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "No valid explanations"));
            }
            else
            {
                trace.Add(new PdfRawReviewRequestTraceDto(
                    StepName: stepName,
                    InputLength: prompt.Length,
                    OutputLength: rawResponse.Length,
                    Status: "fallback",
                    Notes: parseError ?? "Invalid explanation response"));
            }
        }
        catch (Exception ex)
        {
            trace.Add(new PdfRawReviewRequestTraceDto(
                StepName: stepName,
                InputLength: prompt.Length,
                OutputLength: 0,
                Status: "fallback",
                Notes: ex.Message));
        }

        return new PdfRawReviewExplanationSectionDto(
            RawText: reviewSectionRaw,
            Explanations: []);
    }

    private static async Task<string> ExtractPdfTextAsync(Stream pdfStream, CancellationToken cancellationToken)
    {
        var extraction = await ExtractPdfTextResultAsync(pdfStream, cancellationToken);
        return extraction.RawText;
    }

    private static async Task<PdfTextExtractionResult> ExtractPdfTextResultAsync(Stream pdfStream, CancellationToken cancellationToken)
    {
        await using var memoryStream = new MemoryStream();
        await pdfStream.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;
        var pdfBytes = memoryStream.ToArray();

        using var document = PdfDocument.Open(memoryStream);
        var stringBuilder = new StringBuilder();
        var pageCount = 0;
        var pages = new List<PdfExtractedPage>();

        foreach (var page in document.GetPages().OrderBy(p => p.Number))
        {
            cancellationToken.ThrowIfCancellationRequested();
            pageCount++;

            var pageWords = ExtractPageWords(page);
            var pageText = ExtractPageText(pageWords, page.Text);
            pages.Add(new PdfExtractedPage(
                PageNumber: page.Number,
                RawText: pageText,
                PageHeight: page.Height,
                Words: pageWords,
                Images: ExtractPreviewablePageImages(page, page.Height)));

            if (string.IsNullOrWhiteSpace(pageText))
            {
                continue;
            }

            stringBuilder.AppendLine(pageText.TrimEnd());
            stringBuilder.AppendLine();
        }

        return new PdfTextExtractionResult(
            RawText: stringBuilder.ToString(),
            PageCount: pageCount,
            Engine: "PdfPig.Page.GetWords",
            Pages: pages,
            PdfBytes: pdfBytes);
    }

    private static List<PdfExtractedWord> ExtractPageWords(Page page)
    {
        var words = page.GetWords().ToList();
        if (words.Count == 0)
        {
            return [];
        }

        return words
            .Select(word =>
            {
                var bounds = word.BoundingBox;
                return new PdfExtractedWord(
                    Text: word.Text,
                    TopFromPageTop: Math.Max(0d, page.Height - bounds.Top),
                    BottomFromPageTop: Math.Max(0d, page.Height - bounds.Bottom),
                    Left: bounds.Left,
                    Right: bounds.Right);
            })
            .ToList();
    }

    private static string ExtractPageText(IReadOnlyList<PdfExtractedWord> words, string? fallbackText)
    {
        if (words.Count == 0)
        {
            return fallbackText ?? string.Empty;
        }

        return string.Join(" ", words.Select(word => word.Text));
    }

    private static IReadOnlyList<PdfExtractedPageImage> ExtractPreviewablePageImages(Page page, double pageHeight)
    {
        var pageArea = Math.Max(1d, page.Width * page.Height);

        return page.GetImages()
            .Select(image => TryBuildPreviewablePageImage(image, pageArea, pageHeight))
            .Where(image => image is not null)
            .Select(image => image!)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .Take(3)
            .ToList();
    }

    private static PdfExtractedPageImage? TryBuildPreviewablePageImage(IPdfImage image, double pageArea, double pageHeight)
    {
        if (image.IsImageMask)
        {
            return null;
        }

        if (image.WidthInSamples < MinDiagramPreviewImageSamples || image.HeightInSamples < MinDiagramPreviewImageSamples)
        {
            return null;
        }

        var dataUrl = TryBuildImageDataUrl(image);
        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            return null;
        }

        var bounds = image.Bounds;
        var pageCoverage = Math.Max(0d, Math.Abs(bounds.Width) * Math.Abs(bounds.Height)) / pageArea;
        var pixelArea = Math.Max(1, image.WidthInSamples) * Math.Max(1, image.HeightInSamples);

        return new PdfExtractedPageImage(
            DataUrl: dataUrl,
            PageCoverage: pageCoverage,
            PixelArea: pixelArea,
            WidthInSamples: image.WidthInSamples,
            HeightInSamples: image.HeightInSamples,
            TopFromPageTop: Math.Max(0d, pageHeight - bounds.Top),
            BottomFromPageTop: Math.Max(0d, pageHeight - bounds.Bottom),
            Left: bounds.Left,
            Right: bounds.Right);
    }

    private static string? TryBuildImageDataUrl(IPdfImage image)
    {
        if (image.TryGetPng(out var pngBytes) &&
            pngBytes is { Length: > 0 } &&
            pngBytes.Length <= MaxRawReviewDiagramPreviewBytes)
        {
            return $"data:image/png;base64,{Convert.ToBase64String(pngBytes)}";
        }

        var rawBytes = image.RawBytes;
        if (rawBytes is not { Count: > 0 } ||
            rawBytes.Count > MaxRawReviewDiagramPreviewBytes ||
            !TryGetSupportedImageMimeType(rawBytes, out var mimeType))
        {
            return null;
        }

        return $"data:{mimeType};base64,{Convert.ToBase64String(rawBytes.ToArray())}";
    }

    private static bool TryGetSupportedImageMimeType(IReadOnlyList<byte> rawBytes, out string mimeType)
    {
        mimeType = string.Empty;
        if (rawBytes.Count >= 8 &&
            rawBytes[0] == 0x89 &&
            rawBytes[1] == 0x50 &&
            rawBytes[2] == 0x4E &&
            rawBytes[3] == 0x47 &&
            rawBytes[4] == 0x0D &&
            rawBytes[5] == 0x0A &&
            rawBytes[6] == 0x1A &&
            rawBytes[7] == 0x0A)
        {
            mimeType = "image/png";
            return true;
        }

        if (rawBytes.Count >= 3 &&
            rawBytes[0] == 0xFF &&
            rawBytes[1] == 0xD8 &&
            rawBytes[2] == 0xFF)
        {
            mimeType = "image/jpeg";
            return true;
        }

        return false;
    }

    private static List<PdfRawQuestionInstructionPreviewDto> AttachDiagramPreviewImages(
        IReadOnlyList<PdfRawQuestionInstructionPreviewDto> questionGroups,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes)
    {
        if (questionGroups.Count == 0 || pages.Count == 0)
        {
            return questionGroups.ToList();
        }

        return questionGroups
            .Select(group => AttachGroupVisualPreview(group, pages, pdfBytes))
            .ToList();
    }

    private static PdfRawQuestionInstructionPreviewDto AttachGroupVisualPreview(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes)
    {
        if (string.Equals(group.GroupType, "MAP_LABELLING", StringComparison.Ordinal) ||
            string.Equals(group.GroupType, "FLOWCHART_COMPLETION", StringComparison.Ordinal))
        {
            return AttachDiagramPreviewImage(group, pages, pdfBytes);
        }

        return ShouldAttachMatchingVisualPreview(group)
            ? AttachMatchingVisualPreviewImages(group, pages)
            : group;
    }

    private static bool ShouldAttachMatchingVisualPreview(PdfRawQuestionInstructionPreviewDto group)
    {
        if (!string.Equals(group.GroupType, "MATCHING_VISUALS", StringComparison.Ordinal))
        {
            return false;
        }

        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);
        return Regex.IsMatch(
            combined,
            @"(?i)\b(drawings?|diagrams?|figures?|maps?|plans?|pictures?|photos?|images?|illustrations?|projections?)\b");
    }

    private static PdfRawQuestionInstructionPreviewDto AttachDiagramPreviewImage(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes)
    {
        var candidates = FindDiagramPreviewCandidates(group, pages);
        if (candidates.Count == 0)
        {
            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this diagram.",
                DiagramPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this diagram."
            };
        }

        foreach (var candidate in candidates)
        {
            var renderedPreviewDataUrl = TryRenderDiagramPreviewDataUrl(pdfBytes, candidate.Page.PageNumber, candidate.CropBounds);
            if (!string.IsNullOrWhiteSpace(renderedPreviewDataUrl))
            {
                return group with
                {
                    VisualPreviewItems =
                    [
                        new PdfRawVisualPreviewItemDto(
                            ImageDataUrl: renderedPreviewDataUrl,
                            PageNumber: candidate.Page.PageNumber)
                    ],
                    VisualPreviewNote = $"Preview rendered from page {candidate.Page.PageNumber}.",
                    DiagramPreviewImageDataUrl = renderedPreviewDataUrl,
                    DiagramPreviewPageNumber = candidate.Page.PageNumber,
                    DiagramPreviewNote = $"Preview rendered from page {candidate.Page.PageNumber}."
                };
            }
        }

        foreach (var candidate in candidates)
        {
            var relevantImages = GetImagesRelevantToQuestionBlock(group, candidate.Page);
            if (relevantImages.Count == 0)
            {
                continue;
            }

            var previewImage = relevantImages[0];
            return group with
            {
                VisualPreviewItems =
                [
                    new PdfRawVisualPreviewItemDto(
                        ImageDataUrl: previewImage.DataUrl,
                        PageNumber: candidate.Page.PageNumber)
                ],
                VisualPreviewNote = relevantImages.Count > 1
                    ? $"Best-effort preview from the largest extractable image on page {candidate.Page.PageNumber}."
                    : $"Preview extracted from page {candidate.Page.PageNumber}.",
                DiagramPreviewImageDataUrl = previewImage.DataUrl,
                DiagramPreviewPageNumber = candidate.Page.PageNumber,
                DiagramPreviewNote = relevantImages.Count > 1
                    ? $"Best-effort preview from the largest extractable image on page {candidate.Page.PageNumber}."
                    : $"Preview extracted from page {candidate.Page.PageNumber}."
            };
        }

        var firstCandidatePage = candidates[0].Page.PageNumber;

        return group with
        {
            VisualPreviewNote = $"Preview unavailable: detected page {firstCandidatePage}, but no extractable image was found there.",
            DiagramPreviewPageNumber = firstCandidatePage,
            DiagramPreviewNote = $"Preview unavailable: detected page {firstCandidatePage}, but no extractable image was found there."
        };
    }

    private static List<(PdfExtractedPage Page, DiagramPreviewCropBounds CropBounds, int Score)> FindDiagramPreviewCandidates(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var anchorPage = FindBestDiagramPreviewPage(group, pages);
        if (anchorPage is null)
        {
            return [];
        }

        var anchorIndex = pages
            .Select((page, index) => new { page.PageNumber, Index = index })
            .FirstOrDefault(item => item.PageNumber == anchorPage.PageNumber)?
            .Index ?? -1;
        if (anchorIndex < 0)
        {
            return [];
        }

        return pages
            .Skip(anchorIndex)
            .Take(3)
            .Select((page, offset) => new
            {
                Page = page,
                Offset = offset,
                CropBounds = TryBuildDiagramPreviewCrop(group, page)
                    ?? TryBuildContinuationDiagramPreviewCrop(group, page)
            })
            .Where(item => item.CropBounds is not null)
            .Select(item => (
                Page: item.Page,
                CropBounds: item.CropBounds!,
                Score: ScoreDiagramPreviewCandidate(group, item.Page, item.CropBounds!, item.Offset)))
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();
    }

    private static int ScoreDiagramPreviewCandidate(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds,
        int pageOffsetFromAnchor)
    {
        var score = 0;
        var cropWordCount = CountWordsInsideDiagramCrop(page, cropBounds);
        var cropLineCount = CountLinesInsideDiagramCrop(page, cropBounds);
        var cropComparableText = BuildDiagramCropComparableText(page, cropBounds);
        var questionTokenMatches = CountComparableTokenMatches(
            cropComparableText,
            BuildComparableSearchTokens(group.QuestionPreview));
        var expectedQuestionNumberCount = CountExpectedQuestionNumbersInsideDiagramCrop(group, page, cropBounds);
        var foreignQuestionNumberCount = CountForeignQuestionNumbersInsideDiagramCrop(group, page, cropBounds);

        if (cropBounds.HasExplicitBottomBoundary)
        {
            score += 80;
        }

        if (cropBounds.HasExplicitInstructionBoundary)
        {
            score += 35;
        }

        score += Math.Min(50, cropWordCount * 2);
        score += Math.Min(18, cropLineCount * 3);
        score += Math.Max(0, 20 - (pageOffsetFromAnchor * 5));
        score += Math.Min(10, page.Images.Count * 2);
        score += Math.Min(40, questionTokenMatches * 4);
        score += Math.Min(70, expectedQuestionNumberCount * 18);

        if (foreignQuestionNumberCount > 0)
        {
            score -= Math.Min(120, foreignQuestionNumberCount * 24);
        }

        if (!cropBounds.HasExplicitBottomBoundary && cropWordCount <= 8)
        {
            score -= 40;
        }

        if (!cropBounds.HasExplicitBottomBoundary && cropLineCount <= 2)
        {
            score -= 20;
        }

        if (pageOffsetFromAnchor > 0 &&
            !cropBounds.HasExplicitInstructionBoundary &&
            expectedQuestionNumberCount == 0)
        {
            score -= 70;
        }

        if (pageOffsetFromAnchor > 0 && foreignQuestionNumberCount > expectedQuestionNumberCount)
        {
            score -= 50;
        }

        return score;
    }

    private static int CountWordsInsideDiagramCrop(PdfExtractedPage page, DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return page.Words.Count(word =>
        {
            var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
            return center >= top && center <= bottom;
        });
    }

    private static int CountLinesInsideDiagramCrop(PdfExtractedPage page, DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return BuildPdfWordLines(page.Words)
            .Count(line =>
            {
                var center = (line.TopFromPageTop + line.BottomFromPageTop) / 2d;
                return center >= top && center <= bottom;
            });
    }

    private static string BuildDiagramCropComparableText(
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        var cropText = string.Join(
            ' ',
            page.Words
                .Where(word =>
                {
                    var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
                    return center >= top && center <= bottom;
                })
                .Select(word => word.Text));

        return NormalizeComparableText(cropText);
    }

    private static int CountExpectedQuestionNumbersInsideDiagramCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return ExtractQuestionNumbersInsideDiagramCrop(page, cropBounds)
            .Count(number => expectedNumbers.Contains(number));
    }

    private static int CountForeignQuestionNumbersInsideDiagramCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return ExtractQuestionNumbersInsideDiagramCrop(page, cropBounds)
            .Count(number => !expectedNumbers.Contains(number));
    }

    private static HashSet<string> ExtractQuestionNumbersInsideDiagramCrop(
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return page.Words
            .Where(word =>
            {
                var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
                return center >= top && center <= bottom;
            })
            .Select(word => word.Text.Trim())
            .Where(text => Regex.IsMatch(text, @"^\d{1,2}$"))
            .ToHashSet(StringComparer.Ordinal);
    }

    private static PdfRawQuestionInstructionPreviewDto AttachMatchingVisualPreviewImages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        if (string.Equals(group.GroupType, "MATCHING_VISUALS", StringComparison.Ordinal))
        {
            return AttachDedicatedMatchingVisualPreviewImages(group, pages);
        }

        var matchedPages = FindBestMatchingVisualPreviewPages(group, pages);
        if (matchedPages.Count == 0)
        {
            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF pages for this visual matching set."
            };
        }

        var previewItems = matchedPages
            .SelectMany(page => page.Images
                .OrderByDescending(image => image.PageCoverage)
                .ThenByDescending(image => image.PixelArea)
                .Take(MaxVisualPreviewImagesPerPage)
                .Select(image => new PdfRawVisualPreviewItemDto(
                    ImageDataUrl: image.DataUrl,
                    PageNumber: page.PageNumber)))
            .Take(MaxVisualPreviewPagesPerGroup * MaxVisualPreviewImagesPerPage)
            .ToList();

        if (previewItems.Count == 0)
        {
            var pageNumbers = string.Join(", ", matchedPages.Select(page => page.PageNumber));
            return group with
            {
                VisualPreviewNote = $"Preview unavailable: detected page(s) {pageNumbers}, but no extractable image was found there."
            };
        }

        var previewNote = matchedPages.Count > 1
            ? $"Best-effort preview collected from pages {string.Join(", ", matchedPages.Select(page => page.PageNumber))}."
            : $"Preview extracted from page {matchedPages[0].PageNumber}.";

        return group with
        {
            VisualPreviewItems = previewItems,
            VisualPreviewNote = previewNote
        };
    }

    private static PdfRawQuestionInstructionPreviewDto AttachDedicatedMatchingVisualPreviewImages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var anchorPage = FindDedicatedMatchingVisualAnchorPage(group, pages);
        if (anchorPage is null)
        {
            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this visual matching set."
            };
        }

        var expectedImageCount = EstimateExpectedMatchingVisualOptionCount(group);
        var anchorPageIndex = pages
            .Select((page, index) => new { page.PageNumber, Index = index })
            .FirstOrDefault(item => item.PageNumber == anchorPage.PageNumber)?
            .Index ?? -1;
        if (anchorPageIndex < 0)
        {
            return group with
            {
                VisualPreviewNote = $"Preview unavailable: located anchor page {anchorPage.PageNumber}, but it could not be resolved in the extracted page list."
            };
        }

        var candidatePages = pages
            .Skip(anchorPageIndex)
            .Take(MaxDedicatedMatchingVisualSearchPages)
            .OrderBy(page => page.PageNumber)
            .ToList();

        var previewItems = new List<PdfRawVisualPreviewItemDto>(expectedImageCount);
        var nextOptionLabel = 'A';
        foreach (var page in candidatePages)
        {
            var candidateImages = GetLikelyMatchingVisualImages(
                page,
                page.PageNumber == anchorPage.PageNumber
                    ? group
                    : null);
            if (candidateImages.Count == 0)
            {
                continue;
            }

            var remaining = Math.Max(0, expectedImageCount - previewItems.Count);
            if (remaining == 0)
            {
                break;
            }

            foreach (var image in candidateImages.Take(MaxVisualPreviewImagesPerPage))
            {
                var splitItems = TrySplitMatchingVisualPreviewItems(
                    image,
                    page.PageNumber,
                    remaining,
                    ref nextOptionLabel);
                if (splitItems.Count == 0)
                {
                    continue;
                }

                previewItems.AddRange(splitItems);
                remaining = Math.Max(0, expectedImageCount - previewItems.Count);
                if (remaining == 0)
                {
                    break;
                }
            }

            if (previewItems.Count >= expectedImageCount)
            {
                break;
            }
        }

        if (previewItems.Count == 0)
        {
            return group with
            {
                VisualPreviewNote = $"Preview unavailable: located anchor page {anchorPage.PageNumber}, but no extractable visual options were found nearby."
            };
        }

        var previewPageNumbers = previewItems
            .Select(item => item.PageNumber)
            .Distinct()
            .OrderBy(pageNumber => pageNumber)
            .ToList();

        var previewNote = previewItems.Count < expectedImageCount
            ? $"Partial preview extracted from page(s) {string.Join(", ", previewPageNumbers)}: found {previewItems.Count} visual item(s), expected about {expectedImageCount}."
            : previewPageNumbers.Count > 1
                ? $"Preview extracted from the visual option pages {string.Join(", ", previewPageNumbers)}."
                : $"Preview extracted from page {previewPageNumbers[0]}.";

        return group with
        {
            VisualPreviewItems = previewItems,
            VisualPreviewNote = previewNote
        };
    }

    private static PdfExtractedPage? FindBestDiagramPreviewPage(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);

        var exactRangePage = pages
            .Where(page => rangeRegex.IsMatch(page.RawText))
            .OrderBy(page => page.PageNumber)
            .FirstOrDefault();
        if (exactRangePage is not null)
        {
            return exactRangePage;
        }

        var anchorTokens = BuildDiagramAnchorTokens(group);
        var scoredPages = pages
            .Select(page => (
                Page: page,
                Score: ScoreDiagramAnchorPage(page, anchorTokens, group.StartQuestion, group.EndQuestion)))
            .Where(item =>
                item.Score >= 10 &&
                CountQuestionNumbersOnPage(item.Page, group.StartQuestion, group.EndQuestion) >= 2)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();

        return scoredPages.Count == 0
            ? null
            : scoredPages[0].Page;
    }

    private static IReadOnlyList<string> BuildDiagramAnchorTokens(PdfRawQuestionInstructionPreviewDto group)
    {
        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);

        return Regex.Matches(combined, @"[A-Za-z][A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length >= 4)
            .Select(token => token.ToUpperInvariant())
            .Where(token =>
                token is not "QUESTIONS" and
                not "QUESTION" and
                not "WRITE" and
                not "WORDS" and
                not "PASSAGE" and
                not "PRACTICES" and
                not "ACCESS")
            .Distinct()
            .Take(10)
            .ToList();
    }

    private static int ScoreDiagramAnchorPage(
        PdfExtractedPage page,
        IReadOnlyList<string> anchorTokens,
        int startQuestion,
        int endQuestion)
    {
        var comparableText = NormalizeComparableText(page.RawText);
        var score = 0;
        var questionNumberCount = CountQuestionNumbersOnPage(page, startQuestion, endQuestion);

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{startQuestion}\b"))
        {
            score += 3;
        }

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{endQuestion}\b"))
        {
            score += 2;
        }

        var tokenMatches = CountComparableTokenMatches(comparableText, anchorTokens);
        if (tokenMatches > 0)
        {
            score += tokenMatches * 3;
        }

        score += Math.Min(8, questionNumberCount * 2);

        if (page.Images.Count > 0)
        {
            score += 1;
        }

        return score;
    }

    private static int CountQuestionNumbersOnPage(PdfExtractedPage page, int startQuestion, int endQuestion)
    {
        if (page.Words.Count == 0 || endQuestion < startQuestion)
        {
            return 0;
        }

        var expected = Enumerable.Range(startQuestion, endQuestion - startQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return page.Words
            .Select(word => word.Text.Trim())
            .Where(expected.Contains)
            .Distinct(StringComparer.Ordinal)
            .Count();
    }

    private static PdfExtractedPage? FindDedicatedMatchingVisualAnchorPage(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);

        var exactRangePage = pages
            .Where(page => rangeRegex.IsMatch(page.RawText))
            .OrderBy(page => page.PageNumber)
            .FirstOrDefault();
        if (exactRangePage is not null)
        {
            return exactRangePage;
        }

        var anchorTokens = BuildMatchingVisualAnchorTokens(group);
        var scoredPages = pages
            .Select(page => (
                Page: page,
                Score: ScoreDedicatedMatchingVisualAnchorPage(page, anchorTokens, group.StartQuestion, group.EndQuestion)))
            .Where(item =>
                item.Score >= 8 &&
                Regex.IsMatch(item.Page.RawText, $@"(?i)\b{group.StartQuestion}\b") &&
                Regex.IsMatch(item.Page.RawText, $@"(?i)\b{group.EndQuestion}\b"))
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();

        return scoredPages.Count == 0
            ? null
            : scoredPages[0].Page;
    }

    private static int EstimateExpectedMatchingVisualOptionCount(PdfRawQuestionInstructionPreviewDto group)
    {
        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);
        var rangeMatch = Regex.Match(
            combined,
            @"(?i)\b(?:list|lists?|drawing|drawings|diagram|diagrams|figure|figures|image|images|picture|pictures|projection|projections)\s*\(?\s*([A-Z])\s*[-–]\s*([A-Z])\s*\)?");

        if (rangeMatch.Success)
        {
            var start = char.ToUpperInvariant(rangeMatch.Groups[1].Value[0]);
            var end = char.ToUpperInvariant(rangeMatch.Groups[2].Value[0]);
            if (end >= start)
            {
                return Math.Clamp(end - start + 1, 1, MaxVisualPreviewPagesPerGroup * MaxVisualPreviewImagesPerPage);
            }
        }

        return MaxVisualPreviewPagesPerGroup * MaxVisualPreviewImagesPerPage;
    }

    private static IReadOnlyList<string> BuildMatchingVisualAnchorTokens(PdfRawQuestionInstructionPreviewDto group)
    {
        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);

        return Regex.Matches(combined, @"[A-Za-z][A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length >= 5)
            .Select(token => token.ToUpperInvariant())
            .Where(token =>
                token is not "QUESTIONS" and
                not "QUESTION" and
                not "CHOOSE" and
                not "DRAWING" and
                not "DRAWINGS" and
                not "MATCH" and
                not "PROJECTION" and
                not "PROJECTIONS" and
                not "PRACTICES" and
                not "ACCESS")
            .Distinct()
            .Take(10)
            .ToList();
    }

    private static int ScoreDedicatedMatchingVisualAnchorPage(
        PdfExtractedPage page,
        IReadOnlyList<string> anchorTokens,
        int startQuestion,
        int endQuestion)
    {
        var comparableText = NormalizeComparableText(page.RawText);
        var score = 0;

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{startQuestion}\b"))
        {
            score += 2;
        }

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{endQuestion}\b"))
        {
            score += 2;
        }

        var tokenMatches = CountComparableTokenMatches(comparableText, anchorTokens);
        if (tokenMatches > 0)
        {
            score += tokenMatches * 3;
        }

        if (page.Images.Any(image => image.PageCoverage >= MinMatchingVisualPageCoverage))
        {
            score += 2;
        }

        return score;
    }

    private static List<PdfExtractedPage> FindBestMatchingVisualPreviewPages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rankedPages = RankVisualPreviewPages(group, pages);
        if (rankedPages.Count == 0)
        {
            return [];
        }

        return rankedPages
            .Where(item => item.Score >= 2)
            .Take(MaxVisualPreviewPagesPerGroup)
            .OrderBy(item => item.Page.PageNumber)
            .Select(item => item.Page)
            .ToList();
    }

    private static List<PdfExtractedPageImage> GetImagesRelevantToQuestionBlock(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Images.Count == 0)
        {
            return [];
        }

        var headerBottom = TryGetQuestionHeaderBottomFromPageTop(group, page);
        if (headerBottom is null)
        {
            return GetQuestionRegionFallbackImages(page);
        }

        var margin = Math.Max(8d, page.PageHeight * 0.015d);
        var filtered = page.Images
            .Where(image => image.TopFromPageTop >= headerBottom.Value - margin)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .ToList();

        return filtered.Count > 0
            ? filtered
            : GetQuestionRegionFallbackImages(page);
    }

    private static List<PdfExtractedPageImage> GetQuestionRegionFallbackImages(PdfExtractedPage page)
    {
        var minTop = Math.Max(48d, page.PageHeight * 0.12d);
        var filtered = page.Images
            .Where(image =>
                image.TopFromPageTop >= minTop &&
                image.PageCoverage <= 0.92d)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .ToList();

        return filtered.Count > 0
            ? filtered
            : page.Images
                .Where(image => image.PageCoverage <= 0.92d)
                .OrderByDescending(image => image.PageCoverage)
                .ThenByDescending(image => image.PixelArea)
                .ToList();
    }

    private static string? TryRenderDiagramPreviewDataUrl(
        byte[] pdfBytes,
        int pageNumber,
        DiagramPreviewCropBounds cropBounds)
    {
        if (!OperatingSystem.IsWindows() || pdfBytes.Length == 0 || pageNumber <= 0)
        {
            return null;
        }

        try
        {
            using var docReader = DocLib.Instance.GetDocReader(
                pdfBytes,
                new PageDimensions(2200, 3200));
            if (pageNumber > docReader.GetPageCount())
            {
                return null;
            }

            using var pageReader = docReader.GetPageReader(pageNumber - 1);
            var rawBytes = pageReader.GetImage();
            var width = pageReader.GetPageWidth();
            var height = pageReader.GetPageHeight();
            if (rawBytes is null || rawBytes.Length == 0 || width <= 0 || height <= 0)
            {
                return null;
            }

            using var bitmap = CreateBitmapFromRawBgra(width, height, rawBytes);
            var cropRectangle = BuildDiagramCropRectangle(bitmap.Width, bitmap.Height, cropBounds);
            if (cropRectangle.Width <= 0 || cropRectangle.Height <= 0)
            {
                return null;
            }

            using var croppedBitmap = bitmap.Clone(cropRectangle, PixelFormat.Format32bppArgb);
            var tightenedRectangle = cropBounds.HasExplicitBottomBoundary
                ? null
                : DetectPrimaryDiagramRectangle(croppedBitmap);
            using var preliminaryBitmap = tightenedRectangle is null
                ? (Bitmap)croppedBitmap.Clone()
                : croppedBitmap.Clone(tightenedRectangle.Value, PixelFormat.Format32bppArgb);
            var topNoiseTrimmedRectangle = DetectLeadingTopNoiseTrimRectangle(preliminaryBitmap);
            using var intermediateBitmap = topNoiseTrimmedRectangle is null
                ? (Bitmap)preliminaryBitmap.Clone()
                : preliminaryBitmap.Clone(topNoiseTrimmedRectangle.Value, PixelFormat.Format32bppArgb);
            var finalTopTrimmedRectangle = DetectTopWhitespaceTrimRectangle(intermediateBitmap);
            using var finalBitmap = finalTopTrimmedRectangle is null
                ? (Bitmap)intermediateBitmap.Clone()
                : intermediateBitmap.Clone(finalTopTrimmedRectangle.Value, PixelFormat.Format32bppArgb);

            return ConvertBitmapToDataUrl(finalBitmap);
        }
        catch
        {
            return null;
        }
    }

    [SupportedOSPlatform("windows")]
    private static Bitmap CreateBitmapFromRawBgra(int width, int height, byte[] rawBytes)
    {
        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        var bitmapData = bitmap.LockBits(
            new Rectangle(0, 0, width, height),
            ImageLockMode.WriteOnly,
            PixelFormat.Format32bppArgb);

        try
        {
            Marshal.Copy(rawBytes, 0, bitmapData.Scan0, Math.Min(rawBytes.Length, Math.Abs(bitmapData.Stride) * height));
        }
        finally
        {
            bitmap.UnlockBits(bitmapData);
        }

        return bitmap;
    }

    private static Rectangle BuildDiagramCropRectangle(int width, int height, DiagramPreviewCropBounds cropBounds)
    {
        var top = Math.Clamp((int)Math.Floor(height * cropBounds.TopRatio), 0, Math.Max(0, height - 1));
        var bottom = Math.Clamp((int)Math.Ceiling(height * cropBounds.BottomRatio), top + 1, height);
        return new Rectangle(0, top, width, Math.Max(1, bottom - top));
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle? DetectPrimaryDiagramRectangle(Bitmap bitmap)
    {
        var verticalBands = FindForegroundBands(
            length: bitmap.Height,
            sampleAt: index => CountForegroundPixelsInRow(bitmap, index),
            activationThreshold: Math.Max(8, bitmap.Width / 90),
            minBandSize: Math.Max(80, bitmap.Height / 10),
            gapTolerance: Math.Max(12, bitmap.Height / 45));

        if (verticalBands.Count == 0)
        {
            return null;
        }

        var candidateRectangles = verticalBands
            .Select(band => BuildTightCropRectangle(bitmap, band, splitVertically: true))
            .Where(rectangle => rectangle.Width >= bitmap.Width * 0.35 && rectangle.Height >= bitmap.Height * 0.08)
            .ToList();

        if (candidateRectangles.Count == 0)
        {
            return null;
        }

        var dominantDiagramCandidates = candidateRectangles
            .Where(rectangle =>
                rectangle.Width >= bitmap.Width * 0.52d &&
                rectangle.Height >= bitmap.Height * 0.18d &&
                GetRectangleAreaRatio(rectangle, bitmap) >= 0.12d)
            .OrderByDescending(rectangle => ScoreDiagramRectangle(bitmap, rectangle))
            .ThenBy(rectangle => rectangle.Y)
            .ToList();

        if (dominantDiagramCandidates.Count > 0)
        {
            return dominantDiagramCandidates[0];
        }

        var relaxedDiagramCandidates = candidateRectangles
            .Where(rectangle =>
                rectangle.Width >= bitmap.Width * 0.45d &&
                rectangle.Height >= bitmap.Height * 0.14d &&
                GetRectangleAreaRatio(rectangle, bitmap) >= 0.08d &&
                ComputeForegroundDensity(bitmap, rectangle) >= 0.012d)
            .Where(rectangle => !(rectangle.Y <= bitmap.Height * 0.14d && rectangle.Height <= bitmap.Height * 0.14d))
            .OrderByDescending(rectangle => ScoreDiagramRectangle(bitmap, rectangle))
            .ThenBy(rectangle => rectangle.Y)
            .ToList();

        if (relaxedDiagramCandidates.Count > 0)
        {
            return relaxedDiagramCandidates[0];
        }

        return null;
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle? DetectLeadingTopNoiseTrimRectangle(Bitmap bitmap)
    {
        if (bitmap.Height < 120 || bitmap.Width < 160)
        {
            return null;
        }

        var verticalBands = FindForegroundBands(
            length: bitmap.Height,
            sampleAt: index => CountForegroundPixelsInRow(bitmap, index),
            activationThreshold: Math.Max(5, bitmap.Width / 140),
            minBandSize: Math.Max(10, bitmap.Height / 80),
            gapTolerance: Math.Max(6, bitmap.Height / 90));

        if (verticalBands.Count < 2)
        {
            return null;
        }

        var firstRectangle = BuildTightCropRectangle(bitmap, verticalBands[0], splitVertically: true);
        var secondRectangle = BuildTightCropRectangle(bitmap, verticalBands[1], splitVertically: true);
        if (firstRectangle == Rectangle.Empty || secondRectangle == Rectangle.Empty)
        {
            return null;
        }

        var firstAreaRatio = GetRectangleAreaRatio(firstRectangle, bitmap);
        var secondAreaRatio = GetRectangleAreaRatio(secondRectangle, bitmap);
        var firstHeightRatio = (double)firstRectangle.Height / bitmap.Height;
        var secondHeightRatio = (double)secondRectangle.Height / bitmap.Height;
        var verticalGap = secondRectangle.Y - firstRectangle.Bottom;

        var looksLikeTopNoise =
            firstRectangle.Y <= bitmap.Height * 0.08d &&
            firstHeightRatio <= 0.07d &&
            firstAreaRatio <= 0.03d &&
            secondHeightRatio >= 0.18d &&
            secondAreaRatio >= 0.12d &&
            verticalGap >= bitmap.Height * 0.015d;

        if (!looksLikeTopNoise)
        {
            return null;
        }

        var trimTop = Math.Max(0, secondRectangle.Y - Math.Max(6, bitmap.Height / 100));
        if (trimTop <= 4)
        {
            return null;
        }

        return new Rectangle(
            0,
            trimTop,
            bitmap.Width,
            Math.Max(1, bitmap.Height - trimTop));
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle? DetectTopWhitespaceTrimRectangle(Bitmap bitmap)
    {
        if (bitmap.Height < 80 || bitmap.Width < 120)
        {
            return null;
        }

        var activationThreshold = Math.Max(10, bitmap.Width / 55);
        var stableBandRowsNeeded = Math.Max(8, bitmap.Height / 80);
        var trimTop = -1;
        var stableRows = 0;

        for (var y = 0; y < Math.Min(bitmap.Height / 4, bitmap.Height - 1); y++)
        {
            var foregroundCount = CountForegroundPixelsInRow(bitmap, y);
            if (foregroundCount >= activationThreshold)
            {
                stableRows++;
                if (stableRows >= stableBandRowsNeeded)
                {
                    trimTop = Math.Max(0, y - stableBandRowsNeeded + 1);
                    break;
                }
            }
            else
            {
                stableRows = 0;
            }
        }

        if (trimTop <= 2)
        {
            return null;
        }

        return new Rectangle(
            0,
            trimTop,
            bitmap.Width,
            Math.Max(1, bitmap.Height - trimTop));
    }

    [SupportedOSPlatform("windows")]
    private static string? ConvertBitmapToDataUrl(Bitmap bitmap)
    {
        using var output = new MemoryStream();
        bitmap.Save(output, ImageFormat.Png);
        var base64 = Convert.ToBase64String(output.ToArray());
        return $"data:image/png;base64,{base64}";
    }

    private static DiagramPreviewCropBounds? TryBuildDiagramPreviewCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Words.Count == 0 || page.PageHeight <= 0)
        {
            return null;
        }

        var lines = BuildPdfWordLines(page.Words);
        if (lines.Count == 0)
        {
            return null;
        }

        var headerBottom = FindDiagramInstructionBottom(group, page, lines);
        if (headerBottom is null)
        {
            return null;
        }

        var cropTop = Math.Max(0d, Math.Min(page.PageHeight - 1, headerBottom.Value + Math.Max(16d, page.PageHeight * 0.018d)));
        var answerListTop = FindDiagramAnswerListTop(group, page, lines, cropTop);
        var hasExplicitInstructionBoundary = HasExplicitDiagramInstructionBoundary(lines, page);
        var cropBottom = answerListTop
            ?? Math.Min(page.PageHeight, cropTop + page.PageHeight * 0.58d);

        cropBottom = Math.Min(page.PageHeight, cropBottom);
        if (cropBottom <= cropTop + page.PageHeight * 0.1d)
        {
            cropBottom = Math.Min(page.PageHeight, cropTop + page.PageHeight * 0.55d);
        }

        if (cropBottom <= cropTop + 40d)
        {
            return null;
        }

        return new DiagramPreviewCropBounds(
            TopRatio: Math.Clamp(cropTop / page.PageHeight, 0d, 0.98d),
            BottomRatio: Math.Clamp(cropBottom / page.PageHeight, 0.02d, 1d),
            HasExplicitBottomBoundary: answerListTop is not null,
            HasExplicitInstructionBoundary: hasExplicitInstructionBoundary);
    }

    private static DiagramPreviewCropBounds? TryBuildContinuationDiagramPreviewCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Words.Count == 0 || page.PageHeight <= 0)
        {
            return null;
        }

        var lines = BuildPdfWordLines(page.Words);
        if (lines.Count == 0)
        {
            return null;
        }

        var instructionBottom = FindContinuationInstructionBottom(page, lines);
        var cropTop = instructionBottom is not null
            ? Math.Max(0d, Math.Min(page.PageHeight - 1, instructionBottom.Value + Math.Max(14d, page.PageHeight * 0.016d)))
            : Math.Max(0d, page.PageHeight * 0.08d);
        var answerListTop = FindDiagramAnswerListTop(group, page, lines, cropTop);
        var cropBottom = answerListTop
            ?? Math.Min(page.PageHeight, cropTop + page.PageHeight * 0.72d);

        if (cropBottom <= cropTop + 60d)
        {
            return null;
        }

        return new DiagramPreviewCropBounds(
            TopRatio: Math.Clamp(cropTop / page.PageHeight, 0d, 0.98d),
            BottomRatio: Math.Clamp(cropBottom / page.PageHeight, 0.02d, 1d),
            HasExplicitBottomBoundary: answerListTop is not null,
            HasExplicitInstructionBoundary: instructionBottom is not null);
    }

    private static bool HasExplicitDiagramInstructionBoundary(
        IReadOnlyList<PdfExtractedWordLine> lines,
        PdfExtractedPage page) =>
        lines.Any(line =>
            line.TopFromPageTop <= page.PageHeight * 0.82d &&
            line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) &&
            (line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("PASSAGE", StringComparison.Ordinal)));

    private static double? FindContinuationInstructionBottom(
        PdfExtractedPage page,
        IReadOnlyList<PdfExtractedWordLine> lines)
    {
        var candidates = lines
            .Select((line, index) => new
            {
                Line = line,
                Index = index,
                Score =
                    (line.NormalizedText.Contains("COMPLETE", StringComparison.Ordinal) ? 10 : 0) +
                    (line.NormalizedText.Contains("FLOW", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("CHART", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("DIAGRAM", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("MAP", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) || line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ? 6 : 0) +
                    (line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) || line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ? 6 : 0)
            })
            .Where(item => item.Line.TopFromPageTop <= page.PageHeight * 0.45d)
            .Where(item => item.Score >= 12)
            .OrderBy(item => item.Index)
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        var anchorIndex = candidates[0].Index;
        var maxGap = Math.Max(26d, page.PageHeight * 0.03d);
        var scanLimit = Math.Min(lines.Count - 1, anchorIndex + 8);
        var lowestBottom = lines[anchorIndex].BottomFromPageTop;

        for (var index = anchorIndex + 1; index <= scanLimit; index++)
        {
            var gap = lines[index].TopFromPageTop - lines[index - 1].BottomFromPageTop;
            if (gap > maxGap)
            {
                break;
            }

            lowestBottom = Math.Max(lowestBottom, lines[index].BottomFromPageTop);
        }

        return lowestBottom;
    }

    private static List<PdfExtractedWordLine> BuildPdfWordLines(IReadOnlyList<PdfExtractedWord> words)
    {
        if (words.Count == 0)
        {
            return [];
        }

        var orderedWords = words
            .OrderBy(word => word.TopFromPageTop)
            .ThenBy(word => word.Left)
            .ToList();

        var groupedLines = new List<List<PdfExtractedWord>>();
        foreach (var word in orderedWords)
        {
            if (string.IsNullOrWhiteSpace(word.Text))
            {
                continue;
            }

            if (groupedLines.Count == 0)
            {
                groupedLines.Add([word]);
                continue;
            }

            var lastLine = groupedLines[^1];
            var lastLineTop = lastLine.Min(item => item.TopFromPageTop);
            var lastLineBottom = lastLine.Max(item => item.BottomFromPageTop);
            var lastLineHeight = Math.Max(1d, lastLineBottom - lastLineTop);
            var wordCenter = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
            var lineCenter = (lastLineTop + lastLineBottom) / 2d;
            var tolerance = Math.Max(6d, lastLineHeight * 0.65d);

            if (Math.Abs(wordCenter - lineCenter) > tolerance)
            {
                groupedLines.Add([word]);
                continue;
            }

            lastLine.Add(word);
        }

        return groupedLines
            .Select(lineWords =>
            {
                var orderedLineWords = lineWords.OrderBy(word => word.Left).ToList();
                var text = string.Join(" ", orderedLineWords.Select(word => word.Text)).Trim();
                return new PdfExtractedWordLine(
                    Text: text,
                    NormalizedText: NormalizeComparableText(text),
                    TopFromPageTop: orderedLineWords.Min(word => word.TopFromPageTop),
                    BottomFromPageTop: orderedLineWords.Max(word => word.BottomFromPageTop),
                    Left: orderedLineWords.Min(word => word.Left),
                    Right: orderedLineWords.Max(word => word.Right));
            })
            .Where(line => !string.IsNullOrWhiteSpace(line.Text))
            .OrderBy(line => line.TopFromPageTop)
            .ThenBy(line => line.Left)
            .ToList();
    }

    private static double? FindDiagramInstructionBottom(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        IReadOnlyList<PdfExtractedWordLine> lines)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);

        var instructionTokens = BuildComparableSearchTokens(group.Instruction)
            .Where(token => token is not "QUESTIONS" and not "QUESTION" and not "ACCESS" and not "PRACTICES")
            .Take(10)
            .ToHashSet(StringComparer.Ordinal);

        var headerCandidates = lines
            .Select((line, index) => new
            {
                Index = index,
                Score = ScoreDiagramInstructionLine(line, group, rangeRegex, instructionTokens)
            })
            .Where(entry => entry.Score >= 18)
            .OrderByDescending(entry => entry.Score)
            .ThenBy(entry => entry.Index)
            .ToList();

        if (headerCandidates.Count == 0)
        {
            return null;
        }

        var anchorIndex = headerCandidates[0].Index;
        var maxGap = Math.Max(26d, page.PageHeight * 0.03d);
        var scanLimit = Math.Min(lines.Count - 1, anchorIndex + 10);
        var lowestBottom = lines[anchorIndex].BottomFromPageTop;

        for (var index = anchorIndex + 1; index <= scanLimit; index++)
        {
            var gap = lines[index].TopFromPageTop - lines[index - 1].BottomFromPageTop;
            if (gap > maxGap)
            {
                break;
            }

            lowestBottom = Math.Max(lowestBottom, lines[index].BottomFromPageTop);
        }

        var strongTokens = new HashSet<string>(instructionTokens, StringComparer.Ordinal)
        {
            "WRITE",
            "WORDS",
            "WORD",
            "ANSWER",
            "ANSWERS",
            "LABEL",
            "DIAGRAM",
            "MAP",
            "PASSAGE"
        };

        var explicitAnswerInstructionBottom = lines
            .Skip(anchorIndex)
            .Take(20)
            .Where(line => line.TopFromPageTop <= page.PageHeight * 0.82d)
            .Where(line =>
                line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("PASSAGE", StringComparison.Ordinal))
            .Select(line => (double?)line.BottomFromPageTop)
            .Max();

        if (explicitAnswerInstructionBottom is not null)
        {
            return explicitAnswerInstructionBottom;
        }

        var fallbackInstructionCandidates = lines
            .Select((line, index) => new
            {
                Line = line,
                Index = index,
                Score =
                    (line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) ? 10 : 0) +
                    (line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) || line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) || line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("PASSAGE", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("LABEL", StringComparison.Ordinal) || line.NormalizedText.Contains("DIAGRAM", StringComparison.Ordinal) || line.NormalizedText.Contains("MAP", StringComparison.Ordinal) ? 6 : 0)
            })
            .Where(item => item.Line.TopFromPageTop <= page.PageHeight * 0.82d)
            .Where(item => item.Score >= 16)
            .OrderBy(item => item.Index)
            .ToList();

        if (fallbackInstructionCandidates.Count > 0)
        {
            var fallbackAnchorIndex = fallbackInstructionCandidates[0].Index;
            var fallbackBottom = lines
                .Skip(fallbackAnchorIndex)
                .Take(4)
                .Where(line => line.TopFromPageTop <= page.PageHeight * 0.82d)
                .Select(line => (double?)line.BottomFromPageTop)
                .Max();

            if (fallbackBottom is not null)
            {
                return fallbackBottom;
            }
        }

        var instructionBottom = lines
            .Skip(anchorIndex)
            .Take(20)
            .Where(line => line.TopFromPageTop <= page.PageHeight * 0.82d)
            .Where(line => strongTokens.Any(token => line.NormalizedText.Contains(token, StringComparison.Ordinal)))
            .Select(line => (double?)line.BottomFromPageTop)
            .Max();

        return instructionBottom ?? lowestBottom;
    }

    private static int ScoreDiagramInstructionLine(
        PdfExtractedWordLine line,
        PdfRawQuestionInstructionPreviewDto group,
        Regex rangeRegex,
        IReadOnlySet<string> instructionTokens)
    {
        var score = 0;
        if (rangeRegex.IsMatch(line.Text))
        {
            score += 80;
        }

        if (line.NormalizedText.Contains("QUESTIONS", StringComparison.Ordinal))
        {
            score += 12;
        }

        if (line.NormalizedText.Contains(group.StartQuestion.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
        {
            score += 8;
        }

        if (line.NormalizedText.Contains(group.EndQuestion.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
        {
            score += 8;
        }

        if (line.NormalizedText.Contains("LABEL", StringComparison.Ordinal) ||
            line.NormalizedText.Contains("DIAGRAM", StringComparison.Ordinal) ||
            line.NormalizedText.Contains("MAP", StringComparison.Ordinal))
        {
            score += 10;
        }

        foreach (var token in instructionTokens)
        {
            if (line.NormalizedText.Contains(token, StringComparison.Ordinal))
            {
                score += 3;
            }
        }

        return score;
    }

    private static double? FindDiagramAnswerListTop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        IReadOnlyList<PdfExtractedWordLine> lines,
        double cropTop)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);
        if (expectedNumbers.Count == 0)
        {
            return null;
        }

        var minTop = cropTop + page.PageHeight * 0.08d;
        var minLeft = lines.Min(line => line.Left);
        var maxRight = lines.Max(line => line.Right);
        var leftThreshold = minLeft + Math.Max(72d, (maxRight - minLeft) * 0.16d);
        var candidateLines = lines
            .Where(line => line.TopFromPageTop >= minTop)
            .Where(line => line.Left <= leftThreshold)
            .Select(line => new
            {
                Line = line,
                QuestionNumber = TryExtractStandaloneAnswerNumber(line.Text, expectedNumbers)
            })
            .Where(item => item.QuestionNumber is not null)
            .OrderBy(item => item.Line.TopFromPageTop)
            .ToList();

        if (candidateLines.Count == 0)
        {
            return null;
        }

        var gapTolerance = Math.Max(24d, page.PageHeight * 0.035d);
        var clusters = new List<List<(PdfExtractedWordLine Line, string QuestionNumber)>>();
        foreach (var candidateLine in candidateLines)
        {
            var typedCandidate = (candidateLine.Line, candidateLine.QuestionNumber!);
            if (clusters.Count == 0)
            {
                clusters.Add([typedCandidate]);
                continue;
            }

            var lastCluster = clusters[^1];
            var lastLine = lastCluster[^1];
            if (typedCandidate.Line.TopFromPageTop - lastLine.Line.BottomFromPageTop > gapTolerance)
            {
                clusters.Add([typedCandidate]);
                continue;
            }

            lastCluster.Add(typedCandidate);
        }

        var answerCluster = clusters
            .Where(cluster => cluster
                .Select(item => item.QuestionNumber)
                .Distinct(StringComparer.Ordinal)
                .Count() >= 2)
            .OrderByDescending(cluster => cluster.Average(item => item.Line.TopFromPageTop))
            .FirstOrDefault();

        return answerCluster is not null
            ? Math.Max(cropTop + 20d, answerCluster[0].Line.TopFromPageTop - Math.Max(12d, page.PageHeight * 0.018d))
            : null;
    }

    private static string? TryExtractStandaloneAnswerNumber(string lineText, IReadOnlySet<string> expectedNumbers)
    {
        var normalizedLine = Regex.Replace(lineText, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalizedLine))
        {
            return null;
        }

        if (normalizedLine.Contains("QUESTIONS", StringComparison.OrdinalIgnoreCase) ||
            normalizedLine.Contains("QUESTION", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var leadingNumberMatch = Regex.Match(normalizedLine, @"^(\d{1,3})(?=\s|[.):\-]|$)");
        if (!leadingNumberMatch.Success)
        {
            return null;
        }

        var questionNumber = leadingNumberMatch.Groups[1].Value;
        if (!expectedNumbers.Contains(questionNumber))
        {
            return null;
        }

        var trailing = normalizedLine[leadingNumberMatch.Length..].Trim();
        if (trailing.Length == 0)
        {
            return questionNumber;
        }

        var compactTrailing = Regex.Replace(trailing, @"[\s._\-–—…]+", string.Empty);
        if (compactTrailing.Length == 0)
        {
            return questionNumber;
        }

        if (Regex.IsMatch(trailing, @"^[A-Za-z<\[]"))
        {
            return questionNumber;
        }

        return null;
    }

    [SupportedOSPlatform("windows")]
    [SupportedOSPlatform("windows")]
    private static double ScoreDiagramRectangle(Bitmap bitmap, Rectangle rectangle)
    {
        var areaRatio = GetRectangleAreaRatio(rectangle, bitmap);
        var density = ComputeForegroundDensity(bitmap, rectangle);
        return areaRatio * 100d + density * 40d;
    }

    [SupportedOSPlatform("windows")]
    private static double GetRectangleAreaRatio(Rectangle rectangle, Bitmap bitmap) =>
        (double)(rectangle.Width * rectangle.Height) / Math.Max(1d, bitmap.Width * bitmap.Height);

    [SupportedOSPlatform("windows")]
    private static double ComputeForegroundDensity(Bitmap bitmap, Rectangle rectangle)
    {
        if (rectangle.Width <= 0 || rectangle.Height <= 0)
        {
            return 0d;
        }

        var stepX = Math.Max(1, rectangle.Width / 120);
        var stepY = Math.Max(1, rectangle.Height / 120);
        var samples = 0;
        var foreground = 0;

        for (var y = rectangle.Top; y < rectangle.Bottom; y += stepY)
        {
            for (var x = rectangle.Left; x < rectangle.Right; x += stepX)
            {
                samples++;
                if (IsForegroundPixel(bitmap.GetPixel(x, y)))
                {
                    foreground++;
                }
            }
        }

        return samples == 0 ? 0d : (double)foreground / samples;
    }

    private static double? TryGetQuestionHeaderBottomFromPageTop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Words.Count == 0)
        {
            return null;
        }

        var anchorTokens = BuildQuestionAreaAnchorTokens(group);
        if (anchorTokens.Count == 0)
        {
            return null;
        }

        var matchedWords = page.Words
            .Where(word =>
            {
                var normalizedWord = NormalizeComparableText(word.Text);
                return anchorTokens.Contains(normalizedWord);
            })
            .ToList();

        if (matchedWords.Count < 2)
        {
            return null;
        }

        return matchedWords.Max(word => word.BottomFromPageTop);
    }

    private static HashSet<string> BuildQuestionAreaAnchorTokens(PdfRawQuestionInstructionPreviewDto group)
    {
        var tokens = new HashSet<string>(StringComparer.Ordinal);

        tokens.Add("QUESTIONS");
        tokens.Add("QUESTION");
        tokens.Add(group.StartQuestion.ToString(CultureInfo.InvariantCulture));
        tokens.Add(group.EndQuestion.ToString(CultureInfo.InvariantCulture));

        foreach (var token in BuildComparableSearchTokens(group.Instruction)
                     .Concat(BuildComparableSearchTokens(group.QuestionPreview))
                     .Take(8))
        {
            tokens.Add(token);
        }

        return tokens;
    }

    private static List<PdfExtractedPageImage> GetLikelyMatchingVisualImages(
        PdfExtractedPage page,
        PdfRawQuestionInstructionPreviewDto? anchorGroup = null)
    {
        var sourceImages = anchorGroup is null
            ? page.Images
            : GetImagesRelevantToQuestionBlock(anchorGroup, page);

        var filtered = sourceImages
            .Where(image => image.PageCoverage >= MinMatchingVisualPageCoverage)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .ToList();

        if (filtered.Count > 0)
        {
            return filtered;
        }

        return sourceImages
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .Take(1)
            .ToList();
    }

    private static List<PdfRawVisualPreviewItemDto> TrySplitMatchingVisualPreviewItems(
        PdfExtractedPageImage image,
        int pageNumber,
        int maxItems,
        ref char nextOptionLabel)
    {
        if (maxItems <= 0)
        {
            return [];
        }

        if (!OperatingSystem.IsWindows())
        {
            return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
        }

        try
        {
            var imageBytes = TryDecodeDataUrlBytes(image.DataUrl);
            if (imageBytes is null || imageBytes.Length == 0)
            {
                return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
            }

            using var inputStream = new MemoryStream(imageBytes, writable: false);
            using var bitmap = CreateBitmap(inputStream);

            var cropRectangles = DetectMatchingVisualCropRectangles(bitmap)
                .Take(maxItems)
                .ToList();
            if (cropRectangles.Count <= 1)
            {
                return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, cropRectangles.Count == 0 ? 1 : cropRectangles.Count, maxItems, ref nextOptionLabel);
            }

            var previewItems = new List<PdfRawVisualPreviewItemDto>(cropRectangles.Count);
            foreach (var cropRectangle in cropRectangles)
            {
                var croppedDataUrl = TryCropBitmapToDataUrl(bitmap, cropRectangle);
                if (string.IsNullOrWhiteSpace(croppedDataUrl))
                {
                    continue;
                }

                var label = nextOptionLabel <= 'Z' ? nextOptionLabel.ToString(CultureInfo.InvariantCulture) : "?";
                previewItems.Add(new PdfRawVisualPreviewItemDto(
                    ImageDataUrl: croppedDataUrl,
                    PageNumber: pageNumber,
                    Note: $"Option {label} candidate from page {pageNumber}."));
                if (nextOptionLabel < 'Z')
                {
                    nextOptionLabel++;
                }
            }

            return previewItems.Count > 0
                ? previewItems
                : BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
        }
        catch
        {
            return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
        }
    }

    private static List<PdfRawVisualPreviewItemDto> BuildFallbackMatchingVisualPreviewItems(
        string imageDataUrl,
        int pageNumber,
        int detectedItemCount,
        int maxItems,
        ref char nextOptionLabel)
    {
        if (maxItems <= 0 || string.IsNullOrWhiteSpace(imageDataUrl))
        {
            return [];
        }

        var label = nextOptionLabel <= 'Z' ? nextOptionLabel.ToString(CultureInfo.InvariantCulture) : "?";
        if (nextOptionLabel < 'Z')
        {
            nextOptionLabel++;
        }

        var note = detectedItemCount > 1
            ? $"Combined visual candidates from page {pageNumber}; expected split into {detectedItemCount} item(s)."
            : $"Option {label} candidate from page {pageNumber}.";

        return
        [
            new PdfRawVisualPreviewItemDto(
                ImageDataUrl: imageDataUrl,
                PageNumber: pageNumber,
                Note: note)
        ];
    }

    private static byte[]? TryDecodeDataUrlBytes(string? dataUrl)
    {
        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            return null;
        }

        var commaIndex = dataUrl.IndexOf(',');
        if (commaIndex < 0 || commaIndex >= dataUrl.Length - 1)
        {
            return null;
        }

        try
        {
            return Convert.FromBase64String(dataUrl[(commaIndex + 1)..]);
        }
        catch
        {
            return null;
        }
    }

    [SupportedOSPlatform("windows")]
    private static Bitmap CreateBitmap(Stream inputStream) => new(inputStream);

    [SupportedOSPlatform("windows")]
    private static List<Rectangle> DetectMatchingVisualCropRectangles(Bitmap bitmap)
    {
        var verticalBands = FindForegroundBands(
            length: bitmap.Height,
            sampleAt: index => CountForegroundPixelsInRow(bitmap, index),
            activationThreshold: Math.Max(8, bitmap.Width / 80),
            minBandSize: Math.Max(60, bitmap.Height / 8),
            gapTolerance: Math.Max(12, bitmap.Height / 40));

        if (verticalBands.Count >= 2)
        {
            return verticalBands
                .Select(band => BuildTightCropRectangle(bitmap, band, splitVertically: true))
                .Where(rectangle => rectangle.Width >= 80 && rectangle.Height >= 80)
                .ToList();
        }

        var horizontalBands = FindForegroundBands(
            length: bitmap.Width,
            sampleAt: index => CountForegroundPixelsInColumn(bitmap, index),
            activationThreshold: Math.Max(8, bitmap.Height / 80),
            minBandSize: Math.Max(60, bitmap.Width / 8),
            gapTolerance: Math.Max(12, bitmap.Width / 40));

        if (horizontalBands.Count >= 2)
        {
            return horizontalBands
                .Select(band => BuildTightCropRectangle(bitmap, band, splitVertically: false))
                .Where(rectangle => rectangle.Width >= 80 && rectangle.Height >= 80)
                .ToList();
        }

        return [];
    }

    private static List<(int Start, int End)> FindForegroundBands(
        int length,
        Func<int, int> sampleAt,
        int activationThreshold,
        int minBandSize,
        int gapTolerance)
    {
        var bands = new List<(int Start, int End)>();
        var inBand = false;
        var bandStart = 0;
        var lastForeground = -1;

        for (var index = 0; index < length; index++)
        {
            var foregroundCount = sampleAt(index);
            if (foregroundCount >= activationThreshold)
            {
                if (!inBand)
                {
                    bandStart = index;
                    inBand = true;
                }

                lastForeground = index;
                continue;
            }

            if (!inBand || lastForeground < 0 || index - lastForeground <= gapTolerance)
            {
                continue;
            }

            if (lastForeground - bandStart + 1 >= minBandSize)
            {
                bands.Add((bandStart, lastForeground));
            }

            inBand = false;
            lastForeground = -1;
        }

        if (inBand && lastForeground >= bandStart && lastForeground - bandStart + 1 >= minBandSize)
        {
            bands.Add((bandStart, lastForeground));
        }

        return bands;
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle BuildTightCropRectangle(Bitmap bitmap, (int Start, int End) band, bool splitVertically)
    {
        const int margin = 8;

        if (splitVertically)
        {
            var left = bitmap.Width - 1;
            var right = 0;
            for (var x = 0; x < bitmap.Width; x++)
            {
                var count = 0;
                for (var y = band.Start; y <= band.End; y++)
                {
                    if (IsForegroundPixel(bitmap.GetPixel(x, y)))
                    {
                        count++;
                    }
                }

                if (count < Math.Max(4, (band.End - band.Start + 1) / 80))
                {
                    continue;
                }

                left = Math.Min(left, x);
                right = Math.Max(right, x);
            }

            if (right <= left)
            {
                return Rectangle.Empty;
            }

            var xStart = Math.Max(0, left - margin);
            var yStart = Math.Max(0, band.Start - margin);
            var xEnd = Math.Min(bitmap.Width - 1, right + margin);
            var yEnd = Math.Min(bitmap.Height - 1, band.End + margin);
            return Rectangle.FromLTRB(xStart, yStart, xEnd + 1, yEnd + 1);
        }

        var top = bitmap.Height - 1;
        var bottom = 0;
        for (var y = 0; y < bitmap.Height; y++)
        {
            var count = 0;
            for (var x = band.Start; x <= band.End; x++)
            {
                if (IsForegroundPixel(bitmap.GetPixel(x, y)))
                {
                    count++;
                }
            }

            if (count < Math.Max(4, (band.End - band.Start + 1) / 80))
            {
                continue;
            }

            top = Math.Min(top, y);
            bottom = Math.Max(bottom, y);
        }

        if (bottom <= top)
        {
            return Rectangle.Empty;
        }

        var xStartHorizontal = Math.Max(0, band.Start - margin);
        var yStartHorizontal = Math.Max(0, top - margin);
        var xEndHorizontal = Math.Min(bitmap.Width - 1, band.End + margin);
        var yEndHorizontal = Math.Min(bitmap.Height - 1, bottom + margin);
        return Rectangle.FromLTRB(xStartHorizontal, yStartHorizontal, xEndHorizontal + 1, yEndHorizontal + 1);
    }

    [SupportedOSPlatform("windows")]
    private static int CountForegroundPixelsInRow(Bitmap bitmap, int y)
    {
        var count = 0;
        for (var x = 0; x < bitmap.Width; x++)
        {
            if (IsForegroundPixel(bitmap.GetPixel(x, y)))
            {
                count++;
            }
        }

        return count;
    }

    [SupportedOSPlatform("windows")]
    private static int CountForegroundPixelsInColumn(Bitmap bitmap, int x)
    {
        var count = 0;
        for (var y = 0; y < bitmap.Height; y++)
        {
            if (IsForegroundPixel(bitmap.GetPixel(x, y)))
            {
                count++;
            }
        }

        return count;
    }

    private static bool IsForegroundPixel(Color pixel) =>
        pixel.A > 0 && (pixel.R < 245 || pixel.G < 245 || pixel.B < 245);

    [SupportedOSPlatform("windows")]
    private static string? TryCropBitmapToDataUrl(Bitmap source, Rectangle cropRectangle)
    {
        if (cropRectangle == Rectangle.Empty ||
            cropRectangle.Width <= 0 ||
            cropRectangle.Height <= 0 ||
            cropRectangle.Right > source.Width ||
            cropRectangle.Bottom > source.Height)
        {
            return null;
        }

        using var cropped = new Bitmap(cropRectangle.Width, cropRectangle.Height);
        using (var graphics = Graphics.FromImage(cropped))
        {
            graphics.Clear(Color.White);
            graphics.DrawImage(
                source,
                new Rectangle(0, 0, cropRectangle.Width, cropRectangle.Height),
                cropRectangle,
                GraphicsUnit.Pixel);
        }

        using var outputStream = new MemoryStream();
        cropped.Save(outputStream, ImageFormat.Png);
        return $"data:image/png;base64,{Convert.ToBase64String(outputStream.ToArray())}";
    }

    private static List<(PdfExtractedPage Page, int Score)> RankVisualPreviewPages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);
        var instructionTokens = BuildComparableSearchTokens(group.Instruction);
        var questionTokens = BuildComparableSearchTokens(group.QuestionPreview);

        return pages
            .Select(page => (
                Page: page,
                Score: ScoreVisualPreviewPage(page, rangeRegex, instructionTokens, questionTokens)))
            .Where(item => item.Score > 0 && item.Page.Images.Count > 0)
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Page.Images.Count)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();
    }

    private static int ScoreVisualPreviewPage(
        PdfExtractedPage page,
        Regex rangeRegex,
        IReadOnlyList<string> instructionTokens,
        IReadOnlyList<string> questionTokens)
    {
        var comparableText = NormalizeComparableText(page.RawText);
        var score = 0;

        if (rangeRegex.IsMatch(page.RawText))
        {
            score += 8;
        }

        var instructionMatchCount = CountComparableTokenMatches(comparableText, instructionTokens);
        if (instructionMatchCount > 0)
        {
            score += Math.Min(6, instructionMatchCount * 2);
        }

        var questionMatchCount = CountComparableTokenMatches(comparableText, questionTokens);
        if (questionMatchCount > 0)
        {
            score += Math.Min(6, questionMatchCount * 2);
        }

        if (page.Images.Count > 0)
        {
            score += 1;
        }

        return score;
    }

    private static int CountComparableTokenMatches(string comparableText, IReadOnlyList<string> tokens)
    {
        if (string.IsNullOrWhiteSpace(comparableText) || tokens.Count == 0)
        {
            return 0;
        }

        return tokens.Count(token => comparableText.Contains(token, StringComparison.Ordinal));
    }

    private static IReadOnlyList<string> BuildComparableSearchTokens(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return [];
        }

        return Regex.Matches(source, @"[A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length >= 3)
            .Select(token => token.ToUpperInvariant())
            .Where(token =>
                token is not "ACCESS" and
                not "PAGE" and
                not "QUESTIONS" and
                not "QUESTION" and
                not "PRACTICES")
            .Distinct()
            .Take(12)
            .ToList();
    }

    private static string NormalizeComparableText(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return string.Empty;
        }

        var tokens = Regex.Matches(source, @"[A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length > 0)
            .Select(token => token.ToUpperInvariant());

        return string.Join(' ', tokens);
    }

    private static List<string> SplitPassages(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return [];
        }

        var normalizedText = rawText
            .Replace("\r\n", "\n")
            .Replace('\u00A0', ' ')
            .Replace('\u2007', ' ')
            .Replace('\u202F', ' ');

        var passageCandidates = ExtractPassageMarkers(normalizedText, ReadingPassageRegex());
        if (passageCandidates.Count < 3)
        {
            passageCandidates.AddRange(ExtractPassageMarkers(normalizedText, InlineReadingPassageRegex()));
        }

        if (passageCandidates.Count < 3)
        {
            // Fallback when PDF text extraction drops the "Reading" prefix.
            passageCandidates.AddRange(ExtractPassageMarkers(normalizedText, FallbackPassageRegex()));
        }

        if (passageCandidates.Count < 3)
        {
            passageCandidates.AddRange(ExtractPassageMarkers(normalizedText, InlineFallbackPassageRegex()));
        }

        var passageMarkers = passageCandidates
            .GroupBy(x => x.Number)
            .Select(group => group.OrderBy(x => x.StartIndex).First())
            .OrderBy(x => x.StartIndex)
            .ToList();

        if (passageMarkers.Count is 1 or 2)
        {
            passageMarkers = BuildPassageMarkersWithQuestionFallback(normalizedText, passageMarkers);
        }

        if (passageMarkers.Count == 3)
        {
            var markerSplitPassages = SplitByPassageMarkers(normalizedText, passageMarkers);
            if (markerSplitPassages.Count == 3)
            {
                var fallbackByQuestionRange = SplitByQuestionRangeBoundaries(normalizedText);
                if (fallbackByQuestionRange.Count == 3 &&
                    markerSplitPassages[0].Length < Math.Min(1200, fallbackByQuestionRange[0].Length))
                {
                    return fallbackByQuestionRange;
                }

                return markerSplitPassages;
            }
        }

        // Fallback for PDFs where passage titles are OCR-broken or missing.
        var questionRangeFallbackPassages = SplitByQuestionRangeBoundaries(normalizedText);
        if (questionRangeFallbackPassages.Count == 3)
        {
            return questionRangeFallbackPassages;
        }

        if (passageMarkers.Count == 0)
        {
            return [];
        }

        var passages = new List<string>(passageMarkers.Count);
        for (var i = 0; i < passageMarkers.Count; i++)
        {
            var start = passageMarkers[i].StartIndex;
            var end = i == passageMarkers.Count - 1
                ? normalizedText.Length
                : passageMarkers[i + 1].StartIndex;

            if (end <= start)
            {
                continue;
            }

            var rawChunk = normalizedText[start..end].Trim();
            if (i == passageMarkers.Count - 1)
            {
                rawChunk = StripTrailingAnswerAndExplanationBlock(rawChunk);
            }

            var chunk = CleanPassageChunk(rawChunk);
            if (!string.IsNullOrWhiteSpace(chunk))
            {
                passages.Add(chunk);
            }
        }

        return passages;
    }

    private static List<string> SplitByPassageMarkers(string normalizedText, List<PassageMarker> passageMarkers)
    {
        var passages = new List<string>(passageMarkers.Count);
        for (var i = 0; i < passageMarkers.Count; i++)
        {
            var start = passageMarkers[i].StartIndex;
            var end = i == passageMarkers.Count - 1
                ? normalizedText.Length
                : passageMarkers[i + 1].StartIndex;

            if (end <= start)
            {
                continue;
            }

            var rawChunk = normalizedText[start..end].Trim();
            if (i == passageMarkers.Count - 1)
            {
                rawChunk = StripTrailingAnswerAndExplanationBlock(rawChunk);
            }

            var chunk = CleanPassageChunk(rawChunk);
            if (!string.IsNullOrWhiteSpace(chunk))
            {
                passages.Add(chunk);
            }
        }

        return passages;
    }

    private static List<PassageMarker> BuildPassageMarkersWithQuestionFallback(
        string normalizedText,
        List<PassageMarker> initialMarkers)
    {
        var markers = initialMarkers
            .GroupBy(x => x.Number)
            .Select(group => group.OrderBy(x => x.StartIndex).First())
            .ToList();

        var questionRangeStarts = ExtractQuestionRangeStarts(normalizedText);

        if (!markers.Any(x => x.Number == 1))
        {
            markers.Add(new PassageMarker(1, 0));
        }

        if (!markers.Any(x => x.Number == 2) &&
            questionRangeStarts.TryGetValue(14, out var start14))
        {
            markers.Add(new PassageMarker(2, start14));
        }

        if (!markers.Any(x => x.Number == 3) &&
            questionRangeStarts.TryGetValue(27, out var start27))
        {
            markers.Add(new PassageMarker(3, start27));
        }

        return markers
            .GroupBy(x => x.Number)
            .Select(group => group.OrderBy(x => x.StartIndex).First())
            .OrderBy(x => x.StartIndex)
            .ToList();
    }

    private static Dictionary<int, int> ExtractQuestionRangeStarts(string normalizedText) =>
        QuestionRangeBoundaryRegex()
            .Matches(normalizedText)
            .Select(match => new
            {
                StartQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value),
                StartIndex = match.Index
            })
            .Where(x => x.StartQuestion is 1 or 14 or 27)
            .GroupBy(x => x.StartQuestion)
            .ToDictionary(group => group.Key, group => group.Min(x => x.StartIndex));

    private static int ParseOcrQuestionNumber(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var normalized = value
            .Trim()
            .Replace('O', '0')
            .Replace('o', '0')
            .Replace('I', '1')
            .Replace('l', '1')
            .Replace('|', '1');

        return int.TryParse(normalized, out var parsed) ? parsed : -1;
    }

    private static List<PassageMarker> ExtractPassageMarkers(string normalizedText, Regex regex) =>
        regex
            .Matches(normalizedText)
            .Select(match => new
            {
                Number = ParsePassageNumber(match.Groups["number"].Value),
                StartIndex = match.Index
            })
            .Where(x => x.Number is not null)
            .Select(x => new PassageMarker(x.Number!.Value, x.StartIndex))
            .ToList();

    private static int? ParsePassageNumber(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        var normalized = token.Trim().ToUpperInvariant();
        return normalized switch
        {
            "1" or "ONE" => 1,
            "2" or "TWO" => 2,
            "3" or "THREE" => 3,
            _ => null
        };
    }

    private static List<string> SplitByQuestionRangeBoundaries(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return [];
        }

        var rangeMarkers = ExtractQuestionRangeStarts(normalizedText);

        if (!rangeMarkers.TryGetValue(14, out var start14) ||
            !rangeMarkers.TryGetValue(27, out var start27) ||
            start14 <= 0 ||
            start27 <= start14)
        {
            return [];
        }

        var boundaries = new[] { 0, start14, start27, normalizedText.Length };
        var passages = new List<string>(3);
        for (var i = 0; i < 3; i++)
        {
            var start = boundaries[i];
            var end = boundaries[i + 1];
            if (end <= start)
            {
                return [];
            }

            var rawChunk = normalizedText[start..end].Trim();
            if (i == 2)
            {
                rawChunk = StripTrailingAnswerAndExplanationBlock(rawChunk);
            }

            var cleanedChunk = CleanPassageChunk(rawChunk);
            if (string.IsNullOrWhiteSpace(cleanedChunk))
            {
                return [];
            }

            passages.Add(cleanedChunk);
        }

        return passages;
    }

    private static string StripTrailingAnswerAndExplanationBlock(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return normalizedText;
        }

        var answerSectionMatch = AnswerSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .FirstOrDefault(match =>
            {
                if (match.Index <= 0)
                {
                    return false;
                }

                var lookAheadLength = Math.Min(2500, normalizedText.Length - match.Index);
                if (lookAheadLength <= 0)
                {
                    return false;
                }

                var trailingBlock = normalizedText.Substring(match.Index, lookAheadLength);
                var answerLineCount = AnswerEntryLineRegex().Matches(trailingBlock).Count;
                return answerLineCount >= 3;
            });

        if (answerSectionMatch is null || !answerSectionMatch.Success || answerSectionMatch.Index <= 0)
        {
            return normalizedText;
        }

        var trimmed = normalizedText[..answerSectionMatch.Index].TrimEnd();
        return string.IsNullOrWhiteSpace(trimmed) ? normalizedText : trimmed;
    }

    private static string CleanPassageChunk(string chunk)
    {
        if (string.IsNullOrWhiteSpace(chunk))
        {
            return chunk;
        }

        var cleaned = PassageNoiseLineRegex().Replace(chunk, string.Empty);
        cleaned = Regex.Replace(cleaned, @"\n{3,}", "\n\n");
        return cleaned.Trim();
    }

    private static string PreparePassageInputForGemma(string passageText, bool allowHardTrim = true)
    {
        if (string.IsNullOrWhiteSpace(passageText))
        {
            return passageText;
        }

        var prepared = StripTrailingAnswerAndExplanationBlock(passageText);
        prepared = CleanPassageChunk(prepared);
        prepared = NormalizeExtractedSpacing(prepared);
        prepared = RemoveSelectionMarkers(prepared);

        if (!allowHardTrim || prepared.Length <= MaxPassageInputCharacters)
        {
            return prepared;
        }

        var looseAnswerHeading = LooseAnswerSectionHeadingRegex().Match(prepared);
        if (looseAnswerHeading.Success && looseAnswerHeading.Index > 1000)
        {
            prepared = prepared[..looseAnswerHeading.Index].TrimEnd();
        }

        if (prepared.Length <= MaxPassageInputCharacters)
        {
            return prepared;
        }

        var explanationHeadingMatch = ExplanationQuestionHeadingRegex()
            .Matches(prepared)
            .Cast<Match>()
            .FirstOrDefault(match =>
            {
                if (!match.Success || match.Index < prepared.Length * 0.55d)
                {
                    return false;
                }

                var lookAheadLength = Math.Min(1800, prepared.Length - match.Index);
                if (lookAheadLength <= 0)
                {
                    return false;
                }

                var lookAheadChunk = prepared.Substring(match.Index, lookAheadLength);
                return ExplanationQuestionHeadingRegex().Matches(lookAheadChunk).Count >= 2;
            });

        if (explanationHeadingMatch is not null && explanationHeadingMatch.Success && explanationHeadingMatch.Index > 1000)
        {
            prepared = prepared[..explanationHeadingMatch.Index].TrimEnd();
        }

        if (prepared.Length <= MaxPassageInputCharacters)
        {
            return prepared;
        }

        return prepared[..MaxPassageInputCharacters].TrimEnd();
    }

    private static Dictionary<int, string> ExtractAnswerKeyMap(string rawText)
    {
        var result = new Dictionary<int, string>();
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return result;
        }

        var normalized = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var reviewZone = ExtractReviewAndExplanationsZone(normalized);
        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            MergeReviewAnswerEntries(reviewZone, result);
        }

        var answerZone = ExtractAnswerZone(normalized);
        if (string.IsNullOrWhiteSpace(answerZone))
        {
            MergeSupplementalCompactAnswerPairs(normalized, result);
            MergeSupplementalUltraCompactAnswerPairs(normalized, result);
            MergeReviewAnswerEntries(normalized, result);
            NormalizeAndExpandAnswerKeyMap(result);
            return result;
        }

        var lines = answerZone.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var line in lines)
        {
            if (line.Length < 2)
            {
                continue;
            }

            if (ShouldSkipAnswerLine(line))
            {
                continue;
            }

            var compactMatches = CompactAnswerPairRegex().Matches(line);
            if (compactMatches.Count >= 2)
            {
                foreach (Match compactMatch in compactMatches)
                {
                    if (!int.TryParse(compactMatch.Groups["number"].Value, out var compactNumber))
                    {
                        continue;
                    }

                    var compactAnswer = SanitizeAnswerValue(compactMatch.Groups["answer"].Value);
                    if (string.IsNullOrWhiteSpace(compactAnswer))
                    {
                        continue;
                    }

                    if (!IsLikelyDirectAnswerToken(compactAnswer))
                    {
                        continue;
                    }

                    if (result.ContainsKey(compactNumber))
                    {
                        continue;
                    }

                    result[compactNumber] = compactAnswer;
                }

                continue;
            }

            if (TryExtractSingleAnswerLine(line, out var number, out var answer))
            {
                if (!result.ContainsKey(number))
                {
                    result[number] = answer;
                }
                continue;
            }

            foreach (Match pairMatch in AnswerPairInLineRegex().Matches(line))
            {
                if (!int.TryParse(pairMatch.Groups["number"].Value, out var pairNumber))
                {
                    continue;
                }

                var pairAnswer = SanitizeAnswerValue(pairMatch.Groups["answer"].Value);
                if (string.IsNullOrWhiteSpace(pairAnswer))
                {
                    continue;
                }

                if (!IsLikelyDirectAnswerToken(pairAnswer))
                {
                    continue;
                }

                if (result.ContainsKey(pairNumber))
                {
                    continue;
                }

                result[pairNumber] = pairAnswer;
            }
        }

        if (result.Count < 30)
        {
            var trailingStart = (int)(normalized.Length * 0.50d);
            trailingStart = Math.Clamp(trailingStart, 0, Math.Max(0, normalized.Length - 1));
            MergeSupplementalCompactAnswerPairs(normalized[trailingStart..], result);
            MergeSupplementalUltraCompactAnswerPairs(normalized[trailingStart..], result);
        }

        // Review/Explanations thường có định dạng "X Answer: Y" ổn định hơn Solution bị dính chữ.
        MergeReviewAnswerEntries(answerZone, result);
        if (result.Count < 30)
        {
            MergeReviewAnswerEntries(normalized, result);
        }

        NormalizeAndExpandAnswerKeyMap(result);
        return result;
    }

    private static void NormalizeAndExpandAnswerKeyMap(IDictionary<int, string> result)
    {
        if (result.Count == 0)
        {
            return;
        }

        var questionNumbers = result.Keys
            .Where(number => number is >= 1 and <= 40)
            .Distinct()
            .OrderBy(number => number)
            .ToList();

        // 1) Clean toàn bộ answer đã parse: bỏ page/footer/url, normalize token.
        foreach (var questionNumber in questionNumbers)
        {
            if (!result.TryGetValue(questionNumber, out var rawAnswer))
            {
                continue;
            }

            var cleaned = NormalizeFallbackAnswer(rawAnswer);
            if (string.IsNullOrWhiteSpace(cleaned))
            {
                continue;
            }

            result[questionNumber] = cleaned;
        }

        // 2) Fallback expansion: nếu bị dồn range thành 1 dòng kiểu "18. A,C,D,E,H",
        // tự tách ra 18..22 khi khoảng trống key khớp với số token.
        var ordered = result.Keys
            .Where(number => number is >= 1 and <= 40)
            .Distinct()
            .OrderBy(number => number)
            .ToList();

        foreach (var startQuestion in ordered)
        {
            if (!result.TryGetValue(startQuestion, out var answer) || string.IsNullOrWhiteSpace(answer))
            {
                continue;
            }

            var letterTokens = SplitAnswerTokensOrdered(answer)
                .Where(IsSingleLetterAnswerToken)
                .ToList();
            if (letterTokens.Count < 3)
            {
                continue;
            }

            var nextExistingQuestion = ordered.FirstOrDefault(number => number > startQuestion);
            if (nextExistingQuestion <= startQuestion)
            {
                continue;
            }

            var expectedEndQuestion = startQuestion + letterTokens.Count - 1;
            if (expectedEndQuestion > 40)
            {
                continue;
            }

            if (nextExistingQuestion != expectedEndQuestion + 1)
            {
                continue;
            }

            var allIntermediateMissing = true;
            for (var questionNumber = startQuestion + 1; questionNumber <= expectedEndQuestion; questionNumber++)
            {
                if (result.ContainsKey(questionNumber))
                {
                    allIntermediateMissing = false;
                    break;
                }
            }

            if (!allIntermediateMissing)
            {
                continue;
            }

            for (var offset = 0; offset < letterTokens.Count; offset++)
            {
                result[startQuestion + offset] = letterTokens[offset];
            }
        }
    }

    private static string ExtractReviewAndExplanationsZone(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        var headingMatches = ReviewSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        if (headingMatches.Count == 0)
        {
            return string.Empty;
        }

        var preferredHeading = headingMatches
            .FirstOrDefault(match => match.Index >= normalizedText.Length * 0.45d)
            ?? headingMatches[^1];
        if (preferredHeading.Index < 0 || preferredHeading.Index >= normalizedText.Length)
        {
            return string.Empty;
        }

        return normalizedText[preferredHeading.Index..].Trim();
    }

    private static void MergeSupplementalCompactAnswerPairs(
        string text,
        IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = CompactAnswerPairRegex().Matches(text);
        if (matches.Count < 12)
        {
            return;
        }

        foreach (Match match in matches)
        {
            if (!int.TryParse(match.Groups["number"].Value, out var number))
            {
                continue;
            }

            if (number is < 1 or > 40 || result.ContainsKey(number))
            {
                continue;
            }

            var answer = SanitizeAnswerValue(match.Groups["answer"].Value);
            if (!IsLikelyAnswerToken(answer))
            {
                continue;
            }

            result[number] = answer;
        }
    }

    private static void MergeSupplementalUltraCompactAnswerPairs(
        string text,
        IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = UltraCompactAnswerPairRegex().Matches(text);
        if (matches.Count < 20)
        {
            return;
        }

        var candidatePairs = new List<(int Number, string Answer)>(matches.Count);
        foreach (Match match in matches)
        {
            if (!int.TryParse(match.Groups["number"].Value, out var number) ||
                number is < 1 or > 40)
            {
                continue;
            }

            var answer = SanitizeAnswerValue(match.Groups["answer"].Value);
            if (!IsLikelyAnswerToken(answer))
            {
                continue;
            }

            candidatePairs.Add((number, answer));
        }

        var distinctQuestionCount = candidatePairs
            .Select(pair => pair.Number)
            .Distinct()
            .Count();
        if (distinctQuestionCount < 20)
        {
            return;
        }

        foreach (var pair in candidatePairs)
        {
            if (result.ContainsKey(pair.Number))
            {
                continue;
            }

            result[pair.Number] = pair.Answer;
        }
    }

    private static void MergeReviewAnswerEntries(string text, IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = ReviewAnswerEntryRegex().Matches(text);
        if (matches.Count == 0)
        {
            return;
        }

        foreach (Match match in matches)
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var startQuestion, out var endQuestion))
            {
                continue;
            }

            var rawEntryBlock = match.Groups["raw"].Value;
            var normalizedAnswer = ExtractAnswerFromReviewEntryRaw(rawEntryBlock);
            if (string.IsNullOrWhiteSpace(normalizedAnswer))
            {
                continue;
            }

            if (endQuestion > startQuestion)
            {
                var orderedTokens = SplitAnswerTokensOrdered(normalizedAnswer)
                    .Where(IsSingleLetterAnswerToken)
                    .ToList();
                var expectedTokenCount = endQuestion - startQuestion + 1;

                if (orderedTokens.Count == expectedTokenCount)
                {
                    for (var offset = 0; offset < expectedTokenCount; offset++)
                    {
                        result[startQuestion + offset] = orderedTokens[offset];
                    }

                    continue;
                }
            }

            result[startQuestion] = normalizedAnswer;
        }
    }

    private static List<string> SplitAnswerTokensOrdered(string? answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return [];
        }

        return Regex.Split(answer, @"\s*(?:\||,|/|;|&|\band\b)\s*", RegexOptions.IgnoreCase)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(NormalizeToken)
            .ToList();
    }

    private static string ExtractAnswerFromReviewEntryRaw(string rawEntryBlock)
    {
        if (string.IsNullOrWhiteSpace(rawEntryBlock))
        {
            return string.Empty;
        }

        var normalizedRaw = NormalizeReviewEntryRawText(rawEntryBlock);
        if (string.IsNullOrWhiteSpace(normalizedRaw))
        {
            return string.Empty;
        }

        var explanationMarkerIndex = FindReviewExplanationMarkerIndex(normalizedRaw);
        var answerCandidate = explanationMarkerIndex > 0
            ? normalizedRaw[..explanationMarkerIndex]
            : normalizedRaw;

        answerCandidate = answerCandidate.Trim().Trim('.', ',', ';', ':', '-', '–', '—');
        return NormalizeFallbackAnswer(answerCandidate);
    }

    private static string ExtractExplanationFromReviewEntryRaw(string rawEntryBlock)
    {
        if (string.IsNullOrWhiteSpace(rawEntryBlock))
        {
            return string.Empty;
        }

        var normalizedRaw = NormalizeReviewEntryRawText(rawEntryBlock);
        if (string.IsNullOrWhiteSpace(normalizedRaw))
        {
            return string.Empty;
        }

        var explanationMarkerIndex = FindReviewExplanationMarkerIndex(normalizedRaw);
        if (explanationMarkerIndex < 0 || explanationMarkerIndex >= normalizedRaw.Length)
        {
            return string.Empty;
        }

        var explanationCandidate = normalizedRaw[explanationMarkerIndex..].Trim();
        return NormalizeExplanationText(explanationCandidate);
    }

    private static string NormalizeReviewEntryRawText(string rawEntryBlock)
    {
        var normalized = rawEntryBlock
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        // OCR/PDF thường làm dính chữ đáp án với marker giải thích: "ADHDThe keywords", "ADHDpage 18".
        normalized = GluedReviewMarkerRegex().Replace(normalized, " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        return normalized;
    }

    private static int FindReviewExplanationMarkerIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var markerMatch = ReviewExplanationMarkerRegex().Match(value);
        return markerMatch.Success ? markerMatch.Index : -1;
    }

    private static bool TryParseReviewQuestionRange(string? rangeToken, out int startQuestion, out int endQuestion)
    {
        startQuestion = -1;
        endQuestion = -1;

        if (string.IsNullOrWhiteSpace(rangeToken))
        {
            return false;
        }

        var normalized = Regex.Replace(rangeToken, @"(?i)\bquestions?\b", string.Empty);
        normalized = Regex.Replace(normalized, @"(?i)\bq\b", string.Empty);
        normalized = Regex.Replace(normalized, @"(?i)\bto\b", "-");
        normalized = Regex.Replace(normalized, @"\s+", string.Empty);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var explicitRangeMatch = Regex.Match(normalized, @"^(?<start>\d{1,2})[-–—](?<end>\d{1,2})$");
        if (explicitRangeMatch.Success)
        {
            startQuestion = ParseOcrQuestionNumber(explicitRangeMatch.Groups["start"].Value);
            endQuestion = ParseOcrQuestionNumber(explicitRangeMatch.Groups["end"].Value);

            return startQuestion is >= 1 and <= 40 &&
                   endQuestion >= startQuestion &&
                   endQuestion <= 40;
        }

        // OCR fallback: "18-22" có thể bị dính thành "1822".
        if (normalized.Length == 4 &&
            int.TryParse(normalized[..2], out var firstTwoDigits) &&
            int.TryParse(normalized[2..], out var lastTwoDigits) &&
            firstTwoDigits is >= 1 and <= 40 &&
            lastTwoDigits >= firstTwoDigits &&
            lastTwoDigits <= 40)
        {
            startQuestion = firstTwoDigits;
            endQuestion = lastTwoDigits;
            return true;
        }

        // OCR fallback: "9-13" có thể bị dính thành "913".
        if (normalized.Length == 3 &&
            int.TryParse(normalized[..1], out var firstOneDigit) &&
            int.TryParse(normalized[1..], out var lastTwoDigitsFromThree) &&
            firstOneDigit is >= 1 and <= 40 &&
            lastTwoDigitsFromThree >= firstOneDigit &&
            lastTwoDigitsFromThree <= 40)
        {
            startQuestion = firstOneDigit;
            endQuestion = lastTwoDigitsFromThree;
            return true;
        }

        var parsedSingle = ParseOcrQuestionNumber(normalized);
        if (parsedSingle is >= 1 and <= 40)
        {
            startQuestion = parsedSingle;
            endQuestion = parsedSingle;
            return true;
        }

        return false;
    }

    private static Dictionary<int, string> ExtractExplanationMap(string answerZone)
    {
        var result = new Dictionary<int, string>();
        if (string.IsNullOrWhiteSpace(answerZone))
        {
            return result;
        }

        var normalized = answerZone
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        MergeReviewExplanationEntries(normalized, result);

        var headingMatches = ExplanationBlockStartRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        if (headingMatches.Count == 0)
        {
            return result;
        }

        for (var i = 0; i < headingMatches.Count; i++)
        {
            var heading = headingMatches[i];
            if (!int.TryParse(heading.Groups["number"].Value, out var questionNumber) ||
                questionNumber is < 1 or > 40)
            {
                continue;
            }

            var blockStart = heading.Index + heading.Length;
            var blockEnd = i == headingMatches.Count - 1
                ? normalized.Length
                : headingMatches[i + 1].Index;
            if (blockEnd <= blockStart)
            {
                continue;
            }

            var rawExplanation = normalized[blockStart..blockEnd].Trim();
            var normalizedExplanation = NormalizeExplanationText(rawExplanation);
            if (string.IsNullOrWhiteSpace(normalizedExplanation))
            {
                continue;
            }

            result[questionNumber] = normalizedExplanation;
        }

        return result;
    }

    private static void MergeReviewExplanationEntries(string text, IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = ReviewAnswerEntryRegex().Matches(text);
        if (matches.Count == 0)
        {
            return;
        }

        foreach (Match match in matches)
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var startQuestion, out var endQuestion))
            {
                continue;
            }

            var explanation = ExtractExplanationFromReviewEntryRaw(match.Groups["raw"].Value);
            if (string.IsNullOrWhiteSpace(explanation))
            {
                continue;
            }

            for (var questionNumber = startQuestion; questionNumber <= endQuestion; questionNumber++)
            {
                if (questionNumber is < 1 or > 40)
                {
                    continue;
                }

                result[questionNumber] = explanation;
            }
        }
    }

    private static string NormalizeExplanationText(string rawExplanation)
    {
        if (string.IsNullOrWhiteSpace(rawExplanation))
        {
            return string.Empty;
        }

        var cleaned = Regex.Replace(rawExplanation, @"\s+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)\bpage\s*\d+\s*access\s+https?://\S+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)\baccess\s+https?://\S+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)\bhttps?://\S+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return string.Empty;
        }

        if (cleaned.Length <= 20 && IsLikelyAnswerToken(cleaned))
        {
            return string.Empty;
        }

        var answerLeadMatch = LeadingAnswerTokenRegex().Match(cleaned);
        if (answerLeadMatch.Success)
        {
            var remainder = answerLeadMatch.Groups["explanation"].Value.Trim();
            if (!string.IsNullOrWhiteSpace(remainder))
            {
                cleaned = remainder;
            }
        }

        if (cleaned.Length < 25 ||
            AccessOrPageNoiseRegex().IsMatch(cleaned) ||
            CompactAnswerBlobRegex().IsMatch(cleaned))
        {
            return string.Empty;
        }

        var maxExplanationLength = 1800;
        if (cleaned.Length > maxExplanationLength)
        {
            cleaned = cleaned[..maxExplanationLength].TrimEnd() + "...";
        }

        return cleaned;
    }

    private static int ApplyExplanationOverrides(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> explanationMap)
    {
        if (explanationMap.Count == 0)
        {
            return 0;
        }

        var appliedCount = 0;
        var fallbackGlobalQuestionNumber = 1;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                if (!explanationMap.TryGetValue(effectiveQuestionNumber, out var explanationText) ||
                    string.IsNullOrWhiteSpace(explanationText))
                {
                    continue;
                }

                question.Explanation = JsonSerializer.SerializeToElement(explanationText);
                appliedCount++;
            }
        }

        return appliedCount;
    }

    private static bool IsLikelyAnswerToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var normalized = NormalizeToken(value);
        if (normalized is "TRUE" or "FALSE" or "YES" or "NO" or "NOT GIVEN")
        {
            return true;
        }

        if (IsSingleLetterAnswerToken(normalized))
        {
            return true;
        }

        if (value.Length > 80 || AccessOrPageNoiseRegex().IsMatch(value))
        {
            return false;
        }

        return true;
    }

    private static bool IsLikelyDirectAnswerToken(string value)
    {
        if (!IsLikelyAnswerToken(value))
        {
            return false;
        }

        var normalized = NormalizeToken(value);
        if (IsSingleLetterAnswerToken(normalized) ||
            IsTfngAnswerToken(normalized) ||
            IsYnngAnswerToken(normalized))
        {
            return true;
        }

        var tokens = SplitAnswerTokens(value).ToList();
        if (tokens.Count > 1 && tokens.All(IsSingleLetterAnswerToken))
        {
            return true;
        }

        if (value.Length > 60)
        {
            return false;
        }

        if (value.IndexOfAny(new[] { '.', '!', '?' }) >= 0)
        {
            return false;
        }

        var lexicalTokenCount = Regex.Matches(value, @"[A-Za-z0-9][A-Za-z0-9'’\-]*").Count;
        return lexicalTokenCount is >= 1 and <= 6;
    }

    private static string ExtractAnswerZone(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        var headingMatches = AnswerSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        var answerStart = headingMatches
            .Select(match => match.Index)
            .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);

        if (answerStart <= 0)
        {
            var looseMatches = LooseAnswerSectionHeadingRegex()
                .Matches(normalizedText)
                .Cast<Match>()
                .Where(match => match.Success)
                .OrderBy(match => match.Index)
                .ToList();

            answerStart = looseMatches
                .Select(match => match.Index)
                .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);
        }

        if (answerStart <= 0)
        {
            // Fallback cho file có "Solution:1C2F..." dính liền cùng dòng.
            var inlineSolutionMatch = InlineSolutionHeadingRegex().Match(normalizedText);
            if (inlineSolutionMatch.Success &&
                inlineSolutionMatch.Index >= normalizedText.Length * 0.35d)
            {
                answerStart = inlineSolutionMatch.Index;
            }
        }

        if (answerStart <= 0)
        {
            // Fallback: lấy vùng 40% cuối file nếu có mật độ answer-pair cao.
            var trailingStart = (int)(normalizedText.Length * 0.60d);
            trailingStart = Math.Clamp(trailingStart, 0, Math.Max(0, normalizedText.Length - 1));
            var trailingChunk = normalizedText[trailingStart..];

            var firstCompactPair = CompactAnswerPairRegex().Match(trailingChunk);
            var compactPairCount = CompactAnswerPairRegex().Matches(trailingChunk).Count;
            var firstUltraCompactPair = UltraCompactAnswerPairRegex().Match(trailingChunk);
            var ultraCompactPairCount = UltraCompactAnswerPairRegex().Matches(trailingChunk).Count;
            var singleLineAnswerCount = SingleAnswerLineRegex().Matches(trailingChunk).Count;

            if (firstCompactPair.Success && (compactPairCount >= 8 || singleLineAnswerCount >= 8))
            {
                answerStart = trailingStart + firstCompactPair.Index;
            }
            else if (firstUltraCompactPair.Success && ultraCompactPairCount >= 12)
            {
                answerStart = trailingStart + firstUltraCompactPair.Index;
            }
            else
            {
                // Không tìm được vùng đáp án đủ tin cậy thì không parse để tránh override sai.
                return string.Empty;
            }
        }

        return normalizedText[answerStart..];
    }

    private static string ExtractSolutionOnlyZone(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        var headingMatches = SolutionSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        var solutionStart = headingMatches
            .Select(match => match.Index)
            .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);

        if (solutionStart <= 0)
        {
            var looseMatches = LooseSolutionSectionHeadingRegex()
                .Matches(normalizedText)
                .Cast<Match>()
                .Where(match => match.Success)
                .OrderBy(match => match.Index)
                .ToList();

            solutionStart = looseMatches
                .Select(match => match.Index)
                .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);
        }

        if (solutionStart <= 0)
        {
            var compactSolutionZone = ExtractCompactSolutionZone(normalizedText);
            if (!string.IsNullOrWhiteSpace(compactSolutionZone))
            {
                return compactSolutionZone;
            }

            return string.Empty;
        }

        var reviewMatch = ReviewSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .FirstOrDefault(match => match.Success && match.Index > solutionStart);
        var end = reviewMatch is not null
            ? reviewMatch.Index
            : Math.Min(normalizedText.Length, solutionStart + 5000);

        if (end <= solutionStart)
        {
            return string.Empty;
        }

        return TrimSolutionSectionRaw(normalizedText[solutionStart..end]);
    }

    private static string NormalizeSolutionSectionRaw(
        string? aiSolutionSectionRaw,
        string deterministicSolutionZone,
        IReadOnlyDictionary<int, string> answerKey)
    {
        var preferred = TrimSolutionSectionRaw(aiSolutionSectionRaw);
        var fallback = TrimSolutionSectionRaw(deterministicSolutionZone);

        if (string.IsNullOrWhiteSpace(preferred))
        {
            preferred = fallback;
        }

        if (string.IsNullOrWhiteSpace(preferred) && answerKey.Count > 0)
        {
            return BuildNormalizedAnswerList(answerKey);
        }

        if (ReviewSectionHeadingRegex().IsMatch(preferred) && !string.IsNullOrWhiteSpace(fallback))
        {
            preferred = fallback;
        }

        if (preferred.Length > 2500 && answerKey.Count > 0)
        {
            return BuildNormalizedAnswerList(answerKey);
        }

        return preferred;
    }

    private static string TrimSolutionSectionRaw(string? solutionSectionRaw)
    {
        if (string.IsNullOrWhiteSpace(solutionSectionRaw))
        {
            return string.Empty;
        }

        var normalized = solutionSectionRaw
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var reviewMatch = ReviewSectionHeadingRegex().Match(normalized);
        if (reviewMatch.Success && reviewMatch.Index > 0)
        {
            normalized = normalized[..reviewMatch.Index].TrimEnd();
        }
        else if (reviewMatch.Success && reviewMatch.Index == 0)
        {
            return string.Empty;
        }

        return normalized.Trim();
    }

    private static string BuildNormalizedAnswerList(IReadOnlyDictionary<int, string> answerKey)
    {
        if (answerKey.Count == 0)
        {
            return string.Empty;
        }

        return string.Join(
            "\n",
            answerKey
                .OrderBy(pair => pair.Key)
                .Select(pair => $"{pair.Key}. {pair.Value}"));
    }

    private static bool ShouldTriggerAiAnswerKeyRecovery(
        IReadOnlyDictionary<int, string> deterministicAnswerKeyMap,
        string answerZone)
    {
        if (deterministicAnswerKeyMap.Count < 28)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(answerZone))
        {
            return true;
        }

        var suspiciousCount = deterministicAnswerKeyMap.Values
            .Count(value =>
                string.IsNullOrWhiteSpace(value) ||
                value.Length > 50 ||
                AnswerKeyNoiseHintRegex().IsMatch(value));

        return suspiciousCount >= 3;
    }

    private static bool ShouldPreferAiAnswerKeyMap(
        IReadOnlyDictionary<int, string> deterministicAnswerKeyMap,
        IReadOnlyDictionary<int, string> aiAnswerKeyMap)
    {
        if (aiAnswerKeyMap.Count == 0)
        {
            return false;
        }

        if (deterministicAnswerKeyMap.Count == 0)
        {
            return true;
        }

        var deterministicScore = ComputeAnswerKeyQualityScore(deterministicAnswerKeyMap);
        var aiScore = ComputeAnswerKeyQualityScore(aiAnswerKeyMap);
        return aiScore > deterministicScore + 3;
    }

    private static int CountNoisyAnswerKeyEntries(IReadOnlyDictionary<int, string> answerKeyMap)
    {
        if (answerKeyMap.Count == 0)
        {
            return 0;
        }

        return answerKeyMap.Values.Count(value => !IsStrictAnswerKeyValue(value));
    }

    private static Dictionary<int, string> BuildStrictDeterministicBackfill(
        IReadOnlyDictionary<int, string> deterministicAnswerKeyMap,
        IReadOnlyDictionary<int, string> primaryAnswerKeyMap)
    {
        var backfill = new Dictionary<int, string>();
        foreach (var pair in deterministicAnswerKeyMap)
        {
            if (pair.Key is < 1 or > 40 || primaryAnswerKeyMap.ContainsKey(pair.Key))
            {
                continue;
            }

            var normalized = NormalizeFallbackAnswer(pair.Value);
            if (!IsStrictAnswerKeyValue(normalized))
            {
                continue;
            }

            backfill[pair.Key] = normalized;
        }

        return backfill;
    }

    private static bool IsStrictAnswerKeyValue(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return false;
        }

        var normalized = NormalizeFallbackAnswer(rawValue);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (normalized.Length > 60 || AnswerKeyNoiseHintRegex().IsMatch(normalized))
        {
            return false;
        }

        return IsLikelyDirectAnswerToken(normalized);
    }

    private static int ComputeAnswerKeyQualityScore(IReadOnlyDictionary<int, string> answerKeyMap)
    {
        if (answerKeyMap.Count == 0)
        {
            return int.MinValue;
        }

        var score = answerKeyMap.Count * 2;
        foreach (var answer in answerKeyMap.Values)
        {
            var normalized = NormalizeFallbackAnswer(answer);
            if (string.IsNullOrWhiteSpace(normalized))
            {
                score -= 4;
                continue;
            }

            if (AnswerKeyNoiseHintRegex().IsMatch(normalized))
            {
                score -= 4;
            }

            if (normalized.Length > 50)
            {
                score -= 2;
            }

            if (IsLikelyDirectAnswerToken(normalized))
            {
                score += 3;
            }
        }

        return score;
    }

    private static string PrepareRawTextForAiAnswerKeyRecovery(string normalizedRawText)
    {
        if (string.IsNullOrWhiteSpace(normalizedRawText))
        {
            return string.Empty;
        }

        var answerZone = ExtractAnswerZone(normalizedRawText);
        var reviewZone = ExtractReviewAndExplanationsZone(normalizedRawText);
        var compactSolutionZone = ExtractCompactSolutionZone(normalizedRawText);
        var reviewAnswerHints = BuildReviewAnswerHints(normalizedRawText);
        var trailingStart = (int)(normalizedRawText.Length * 0.55d);
        trailingStart = Math.Clamp(trailingStart, 0, Math.Max(0, normalizedRawText.Length - 1));
        var trailingChunk = normalizedRawText[trailingStart..];

        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(reviewAnswerHints))
        {
            parts.Add($"REVIEW_ANSWER_HINTS:\n{reviewAnswerHints}");
        }

        if (!string.IsNullOrWhiteSpace(compactSolutionZone))
        {
            parts.Add($"COMPACT_SOLUTION_ZONE:\n{compactSolutionZone}");
        }

        if (!string.IsNullOrWhiteSpace(answerZone))
        {
            parts.Add($"ANSWER_ZONE:\n{ClipForAiSource(answerZone.Trim(), 9000)}");
        }

        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            parts.Add($"REVIEW_AND_EXPLANATIONS:\n{ClipForAiSource(reviewZone.Trim(), 12000)}");
        }

        if (!string.IsNullOrWhiteSpace(trailingChunk))
        {
            parts.Add($"TRAILING_RAW_TEXT:\n{ClipForAiSource(trailingChunk.Trim(), 8000, fromEnd: true)}");
        }

        if (parts.Count == 0)
        {
            parts.Add(ClipForAiSource(normalizedRawText.Trim(), 12000, fromEnd: true));
        }

        var combined = string.Join("\n\n", parts);
        combined = Regex.Replace(combined, @"\n{3,}", "\n\n");
        if (combined.Length > MaxAiAnswerKeySourceCharacters)
        {
            var headLength = Math.Min((int)(MaxAiAnswerKeySourceCharacters * 0.65d), combined.Length);
            var tailLength = Math.Min(MaxAiAnswerKeySourceCharacters - headLength - 32, Math.Max(0, combined.Length - headLength));
            var head = combined[..headLength];
            var tail = tailLength > 0 ? combined[^tailLength..] : string.Empty;
            combined = $"{head}\n\n[...TRUNCATED...]\n\n{tail}";
        }

        return combined.Trim();
    }

    private static string ClipForAiSource(string value, int maxChars, bool fromEnd = false)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length <= maxChars)
        {
            return value.Trim();
        }

        return fromEnd
            ? value[^maxChars..].Trim()
            : value[..maxChars].Trim();
    }

    private static string ExtractCompactSolutionZone(string normalizedRawText)
    {
        if (string.IsNullOrWhiteSpace(normalizedRawText))
        {
            return string.Empty;
        }

        var solutionMatch = InlineSolutionHeadingRegex().Match(normalizedRawText);
        if (!solutionMatch.Success)
        {
            return string.Empty;
        }

        var start = solutionMatch.Index;
        if (start < 0 || start >= normalizedRawText.Length)
        {
            return string.Empty;
        }

        var reviewMatch = ReviewSectionHeadingRegex()
            .Matches(normalizedRawText)
            .Cast<Match>()
            .FirstOrDefault(match => match.Success && match.Index > start);
        var end = reviewMatch is not null
            ? reviewMatch.Index
            : Math.Min(normalizedRawText.Length, start + 8000);

        if (end <= start)
        {
            return string.Empty;
        }

        return normalizedRawText[start..end].Trim();
    }

    private static string BuildReviewAnswerHints(string normalizedRawText)
    {
        if (string.IsNullOrWhiteSpace(normalizedRawText))
        {
            return string.Empty;
        }

        var lines = new List<string>();
        foreach (Match match in ReviewAnswerEntryRegex().Matches(normalizedRawText))
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var startQuestion, out var endQuestion))
            {
                continue;
            }

            var answer = ExtractAnswerFromReviewEntryRaw(match.Groups["raw"].Value);
            if (!IsStrictAnswerKeyValue(answer))
            {
                continue;
            }

            var keyToken = startQuestion == endQuestion
                ? startQuestion.ToString(CultureInfo.InvariantCulture)
                : $"{startQuestion}-{endQuestion}";
            lines.Add($"{keyToken} Answer: {answer}");
        }

        return lines.Count == 0
            ? string.Empty
            : string.Join('\n', lines.Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static string BuildAiAnswerKeyExtractionPrompt(string sourceText) => $$"""
        Bạn là bộ máy trích xuất đáp án IELTS từ văn bản PDF thô bị lỗi dính chữ/layout.
        Nhiệm vụ: trích xuất đáp án cho câu 1..40 từ nguồn dữ liệu dưới đây.

        QUY TẮC CỨNG:
        - Không giải đề, không suy luận từ passage.
        - Ưu tiên lấy đáp án từ "Review and Explanations". Có thể dùng "Solution:" nếu đủ rõ.
        - Loại bỏ toàn bộ rác: page number, Access/http, Keywords..., HOW TO USE...
        - Với dải câu kiểu 18-22 và đáp án nhiều chữ cái, trả về theo key range hoặc tách thành từng câu đều được.
        - BẮT BUỘC trả đủ key từ 1..40. Nếu câu nào không chắc thì để chuỗi rỗng.
        - Trả về DUY NHẤT JSON thuần, không markdown fence.
        - Không được trả lời bằng văn bản giải thích.
        - Không lấy các dòng hướng dẫn kiểu "Open this URL", "HOW TO USE", "Questions ...", "Keywords in Questions" làm đáp án.

        Schema hợp lệ (một trong hai):
        1) { "answers": { "1":"...", "2":"...", ... "40":"..." } }
        2) { "answers": [{"question_number":"1","answer":"..."}, ...] }

        PDF_RAW_SOURCE:
        {{sourceText}}
        """;

    private async Task<Dictionary<int, string>> TryExtractAnswerKeyWithGemmaAsync(
        string normalizedRawText,
        CancellationToken cancellationToken)
    {
        try
        {
            var sourceText = PrepareRawTextForAiAnswerKeyRecovery(normalizedRawText);
            if (string.IsNullOrWhiteSpace(sourceText))
            {
                return [];
            }

            var prompt = BuildAiAnswerKeyExtractionPrompt(sourceText);
            var rawResponse = await RequestGemmaCompletionAsync(prompt, cancellationToken);

            if (!TryDeserializeAiAnswerKeyMap(rawResponse, out var extractedMap, out var parseError))
            {
                logger.LogWarning(
                    "AI answer-key preprocessing returned invalid JSON: {Error}",
                    parseError);
                return [];
            }

            var normalizedMap = extractedMap
                .Where(pair => pair.Key is >= 1 and <= 40)
                .Select(pair => new KeyValuePair<int, string>(pair.Key, NormalizeFallbackAnswer(pair.Value)))
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
                .ToDictionary(pair => pair.Key, pair => pair.Value);

            NormalizeAndExpandAnswerKeyMap(normalizedMap);

            if (normalizedMap.Count < 34)
            {
                var compactHints = BuildReviewAnswerHints(normalizedRawText);
                if (!string.IsNullOrWhiteSpace(compactHints))
                {
                    var knownAnswersPreview = string.Join(
                        ", ",
                        normalizedMap
                            .OrderBy(pair => pair.Key)
                            .Select(pair => $"{pair.Key}:{pair.Value}"));
                    var retrySource = $"""
                        RETRY_MODE: ưu tiên điền đủ đáp án còn thiếu 1..40.
                        KNOWN_ANSWERS_CURRENT:
                        {knownAnswersPreview}

                        REVIEW_HINTS:
                        {compactHints}
                        """;

                    var retryPrompt = BuildAiAnswerKeyExtractionPrompt(retrySource);
                    var retryRawResponse = await RequestGemmaCompletionAsync(retryPrompt, cancellationToken);
                    if (TryDeserializeAiAnswerKeyMap(retryRawResponse, out var retryExtractedMap, out _))
                    {
                        var retryNormalizedMap = retryExtractedMap
                            .Where(pair => pair.Key is >= 1 and <= 40)
                            .Select(pair => new KeyValuePair<int, string>(pair.Key, NormalizeFallbackAnswer(pair.Value)))
                            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
                            .ToDictionary(pair => pair.Key, pair => pair.Value);
                        NormalizeAndExpandAnswerKeyMap(retryNormalizedMap);

                        if (retryNormalizedMap.Count > normalizedMap.Count ||
                            ComputeAnswerKeyQualityScore(retryNormalizedMap) > ComputeAnswerKeyQualityScore(normalizedMap))
                        {
                            normalizedMap = retryNormalizedMap;
                        }
                    }
                }
            }

            return normalizedMap;
        }
        catch (Exception ex) when (TryResolveApiRetryDelay(ex, out _, out _))
        {
            logger.LogWarning(ex, "AI answer-key preprocessing skipped due transient Gemma error.");
            return [];
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI answer-key preprocessing failed unexpectedly.");
            return [];
        }
    }

    private static bool TryDeserializeAiAnswerKeyMap(
        string rawResponse,
        out Dictionary<int, string> answerMap,
        out string error)
    {
        answerMap = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeAiAnswerKeyCandidate(candidate, out answerMap, out var parseError))
                {
                    return true;
                }

                error = parseError ?? "Unknown parse error";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeAiAnswerKeyCandidate(
        string candidateJson,
        out Dictionary<int, string> answerMap,
        out string? parseError)
    {
        answerMap = [];
        parseError = null;

        var workingJson = candidateJson;
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                using var document = JsonDocument.Parse(workingJson);
                answerMap = ConvertAiAnswerKeyPayloadToMap(document.RootElement);
                if (answerMap.Count > 0)
                {
                    return true;
                }

                parseError = "Parsed JSON but no answer entries were found.";
                return false;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        return false;
    }

    private static Dictionary<int, string> ConvertAiAnswerKeyPayloadToMap(JsonElement root)
    {
        var map = new Dictionary<int, string>();

        var payload = root;
        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty("answers", out var answersElement))
        {
            payload = answersElement;
        }

        if (payload.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in payload.EnumerateObject())
            {
                AddAiAnswerEntryFromKeyToken(map, property.Name, property.Value);
            }

            return map;
        }

        if (payload.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in payload.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string? keyToken = null;
                if (item.TryGetProperty("question_number", out var questionNumberElement))
                {
                    keyToken = ReadJsonAsText(questionNumberElement);
                }
                else if (item.TryGetProperty("number", out var numberElement))
                {
                    keyToken = ReadJsonAsText(numberElement);
                }

                if (string.IsNullOrWhiteSpace(keyToken))
                {
                    continue;
                }

                JsonElement answerElement;
                if (item.TryGetProperty("answer", out var directAnswer))
                {
                    answerElement = directAnswer;
                }
                else if (item.TryGetProperty("answers", out var answersArray))
                {
                    answerElement = answersArray;
                }
                else
                {
                    continue;
                }

                AddAiAnswerEntryFromKeyToken(map, keyToken, answerElement);
            }
        }

        return map;
    }

    private static void AddAiAnswerEntryFromKeyToken(
        IDictionary<int, string> map,
        string keyToken,
        JsonElement answerElement)
    {
        if (string.IsNullOrWhiteSpace(keyToken))
        {
            return;
        }

        var answerTokens = ReadAiAnswerTokens(answerElement);
        if (answerTokens.Count == 0)
        {
            return;
        }

        if (TryParseReviewQuestionRange(keyToken, out var startQuestion, out var endQuestion))
        {
            if (endQuestion > startQuestion)
            {
                var expectedCount = endQuestion - startQuestion + 1;
                var letterTokens = answerTokens
                    .SelectMany(token => SplitAnswerTokensOrdered(token))
                    .Where(IsSingleLetterAnswerToken)
                    .ToList();

                if (letterTokens.Count == expectedCount)
                {
                    for (var offset = 0; offset < expectedCount; offset++)
                    {
                        map[startQuestion + offset] = letterTokens[offset];
                    }

                    return;
                }
            }

            var merged = NormalizeFallbackAnswer(string.Join(", ", answerTokens));
            if (!string.IsNullOrWhiteSpace(merged))
            {
                map[startQuestion] = merged;
            }

            return;
        }

        if (!int.TryParse(Regex.Replace(keyToken, @"[^\d]", string.Empty), out var questionNumber) ||
            questionNumber is < 1 or > 40)
        {
            return;
        }

        var normalized = NormalizeFallbackAnswer(answerTokens[0]);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            map[questionNumber] = normalized;
        }
    }

    private static List<string> ReadAiAnswerTokens(JsonElement answerElement)
    {
        var values = new List<string>();

        switch (answerElement.ValueKind)
        {
            case JsonValueKind.String:
            case JsonValueKind.Number:
            case JsonValueKind.True:
            case JsonValueKind.False:
                var scalar = ReadJsonAsText(answerElement);
                if (!string.IsNullOrWhiteSpace(scalar))
                {
                    values.Add(scalar.Trim());
                }

                break;

            case JsonValueKind.Array:
                foreach (var item in answerElement.EnumerateArray())
                {
                    var value = ReadJsonAsText(item);
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        values.Add(value.Trim());
                    }
                }

                break;

            case JsonValueKind.Object:
                if (answerElement.TryGetProperty("answer", out var nestedAnswer))
                {
                    values.AddRange(ReadAiAnswerTokens(nestedAnswer));
                }
                else if (answerElement.TryGetProperty("value", out var nestedValue))
                {
                    values.AddRange(ReadAiAnswerTokens(nestedValue));
                }

                break;
        }

        return values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool ShouldSkipAnswerLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return true;
        }

        if (!line.Any(char.IsDigit))
        {
            return true;
        }

        if (AccessOrPageNoiseRegex().IsMatch(line))
        {
            return true;
        }

        return line.Contains("Question", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Questions", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Passage", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Explanation", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Review", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryExtractSingleAnswerLine(string line, out int number, out string answer)
    {
        number = -1;
        answer = string.Empty;

        var match = SingleAnswerLineRegex().Match(line);
        if (!match.Success)
        {
            return false;
        }

        if (!int.TryParse(match.Groups["number"].Value, out number))
        {
            return false;
        }

        answer = SanitizeAnswerValue(match.Groups["answer"].Value);
        if (string.IsNullOrWhiteSpace(answer))
        {
            return false;
        }

        if (CompactAnswerBlobRegex().IsMatch(answer))
        {
            return false;
        }

        return IsLikelyDirectAnswerToken(answer);
    }

    private static string SanitizeAnswerValue(string? rawAnswer)
    {
        if (string.IsNullOrWhiteSpace(rawAnswer))
        {
            return string.Empty;
        }

        var sanitized = rawAnswer.Trim();
        sanitized = sanitized.Trim('"', '\'', '.', ' ', '\t');
        sanitized = Regex.Replace(sanitized, @"\s+", " ");
        sanitized = StripTrailingFooterNoiseFromAnswer(sanitized);
        sanitized = StripTrailingReviewMarkerNoiseFromAnswer(sanitized);
        sanitized = StripTrailingQuestionMarkerNoiseFromAnswer(sanitized);

        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return string.Empty;
        }

        if (AccessOrPageNoiseRegex().IsMatch(sanitized))
        {
            return string.Empty;
        }

        if (CompactAnswerBlobRegex().IsMatch(sanitized))
        {
            return string.Empty;
        }

        var labelAndTextMatch = AnswerStartsWithLabelRegex().Match(sanitized);
        if (labelAndTextMatch.Success)
        {
            return labelAndTextMatch.Groups["label"].Value;
        }

        var explanationSplitMatch = AnswerBeforeExplanationRegex().Match(sanitized);
        if (explanationSplitMatch.Success)
        {
            var beforeExplanation = explanationSplitMatch.Groups["answer"].Value.Trim();
            if (!string.IsNullOrWhiteSpace(beforeExplanation))
            {
                sanitized = beforeExplanation;
            }
        }

        sanitized = sanitized.Trim();
        if (sanitized.Length > 80)
        {
            return string.Empty;
        }

        return sanitized.Trim();
    }

    private static string StripTrailingFooterNoiseFromAnswer(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value;
        cleaned = Regex.Replace(cleaned, @"(?i)page\s*\d+\b.*$", string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)access\s+https?://\S+.*$", string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)https?://\S+.*$", string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }

    private static string StripTrailingReviewMarkerNoiseFromAnswer(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value;
        cleaned = Regex.Replace(
            cleaned,
            @"(?ix)\b(?:keywords?\s*in\s*questions?|similar\s*words?\s*in\s*passage|q\s*\d+\s*:|note\s*:).*$",
            string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }

    private static string StripTrailingQuestionMarkerNoiseFromAnswer(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value;
        cleaned = Regex.Replace(
            cleaned,
            @"(?ix)
            \s+
            Q\s*\d{1,2}
            (?:
                \s*[&/,;:-]\s*
            )?
            $",
            string.Empty).Trim();
        cleaned = Regex.Replace(
            cleaned,
            @"(?ix)
            \s+
            Q(?:uestion)?\s*\d{1,2}
            (?:
                \s*[&/,;:-]\s*
            )?
            $",
            string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }

    private static HashSet<int> ApplyAnswerKeyOverrides(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var verifiedQuestionNumbers = new HashSet<int>();
        var fallbackGlobalQuestionNumber = 1;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;

                if (answerKeyMap.TryGetValue(effectiveQuestionNumber, out var answerFromKey) &&
                    !string.IsNullOrWhiteSpace(answerFromKey))
                {
                    var extractedAnswerFromKey = NormalizeFallbackAnswer(answerFromKey);
                    if (string.IsNullOrWhiteSpace(extractedAnswerFromKey))
                    {
                        fallbackGlobalQuestionNumber++;
                        continue;
                    }

                    if (TryInferQuestionTypeFromAnswer(extractedAnswerFromKey, out var inferredQuestionType))
                    {
                        question.QuestionType = JsonSerializer.SerializeToElement(inferredQuestionType);
                    }

                    var normalizedAnswerFromKey = CanonicalizeAnswerForQuestionType(question, extractedAnswerFromKey);
                    if (string.IsNullOrWhiteSpace(normalizedAnswerFromKey))
                    {
                        fallbackGlobalQuestionNumber++;
                        continue;
                    }

                    if (IsValidAnswerOverride(question, normalizedAnswerFromKey))
                    {
                        question.Answer = JsonSerializer.SerializeToElement(normalizedAnswerFromKey);
                        verifiedQuestionNumbers.Add(effectiveQuestionNumber);
                    }
                }

                fallbackGlobalQuestionNumber++;
            }
        }

        return verifiedQuestionNumbers;
    }

    private static bool IsValidAnswerOverride(GemmaQuestionPayload question, string candidateAnswer)
    {
        if (string.IsNullOrWhiteSpace(candidateAnswer))
        {
            return false;
        }

        var sanitized = SanitizeAnswerValue(candidateAnswer);
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return false;
        }

        var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
        var options = ExtractOptions(question.Options);
        var normalizedAnswer = NormalizeToken(sanitized);
        var answerTokens = SplitAnswerTokens(sanitized);

        var hasTfngSignal = answerTokens.Contains("TRUE") || answerTokens.Contains("FALSE");
        var hasYnngSignal = answerTokens.Contains("YES") || answerTokens.Contains("NO");

        if (hasTfngSignal && !hasYnngSignal)
        {
            return answerTokens.Count > 0 && answerTokens.All(IsTfngAnswerToken);
        }

        if (hasYnngSignal && !hasTfngSignal)
        {
            return answerTokens.Count > 0 && answerTokens.All(IsYnngAnswerToken);
        }

        if (mappedType is "TFNG")
        {
            return answerTokens.Count > 0 && answerTokens.All(IsTfngAnswerToken);
        }

        if (mappedType is "YNNG")
        {
            return answerTokens.Count > 0 && answerTokens.All(IsYnngAnswerToken);
        }

        if (mappedType is "MATCHING_HEADINGS" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS")
        {
            return IsSingleLetterAnswerToken(normalizedAnswer) && IsWithinOptionRange(normalizedAnswer, options.Count);
        }

        if (mappedType is "MCQ_CHOOSE_N")
        {
            return answerTokens.Count > 0 &&
                   answerTokens.All(token => IsSingleLetterAnswerToken(token) && IsWithinOptionRange(token, options.Count));
        }

        if (mappedType is "MCQ_SINGLE" or "MCQ_MULTIPLE")
        {
            if (answerTokens.Count > 1 && answerTokens.All(IsSingleLetterAnswerToken))
            {
                return answerTokens.All(token => IsWithinOptionRange(token, options.Count));
            }

            if (IsSingleLetterAnswerToken(normalizedAnswer))
            {
                return IsWithinOptionRange(normalizedAnswer, options.Count);
            }

            if (options.Count == 0)
            {
                return sanitized.Length <= 80 &&
                       !AccessOrPageNoiseRegex().IsMatch(sanitized) &&
                       !CompactAnswerBlobRegex().IsMatch(sanitized);
            }

            return options.Any(option => NormalizeToken(option) == normalizedAnswer);
        }

        if (mappedType is "SENTENCE_COMPLETION")
        {
            if (AccessOrPageNoiseRegex().IsMatch(sanitized) || CompactAnswerBlobRegex().IsMatch(sanitized))
            {
                return false;
            }

            return sanitized.Length <= 80;
        }

        return true;
    }

    private static bool IsTfngAnswerToken(string token) =>
        token is "TRUE" or "FALSE" or "NOT GIVEN" or "T" or "F" or "NG" or "NOTGIVEN";

    private static bool IsYnngAnswerToken(string token) =>
        token is "YES" or "NO" or "NOT GIVEN" or "Y" or "N" or "NG" or "NOTGIVEN";

    private static bool TryInferQuestionTypeFromAnswer(string? answerText, out string inferredQuestionType)
    {
        inferredQuestionType = string.Empty;

        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }

        var tokens = SplitAnswerTokens(answerText);
        if (tokens.Count == 0)
        {
            return false;
        }

        var hasTfngSignal = tokens.Contains("TRUE") || tokens.Contains("FALSE");
        var hasYnngSignal = tokens.Contains("YES") || tokens.Contains("NO");

        if (hasTfngSignal && !hasYnngSignal)
        {
            inferredQuestionType = "TrueFalseNotGiven";
            return true;
        }

        if (hasYnngSignal && !hasTfngSignal)
        {
            inferredQuestionType = "YesNoNotGiven";
            return true;
        }

        if (tokens.Count > 1 && tokens.All(IsSingleLetterAnswerToken))
        {
            inferredQuestionType = "McqMultiple";
            return true;
        }

        return false;
    }

    private static bool IsSingleLetterAnswerToken(string token) =>
        token.Length == 1 && token[0] is >= 'A' and <= 'H';

    private static bool IsWithinOptionRange(string answerToken, int optionCount)
    {
        if (!IsSingleLetterAnswerToken(answerToken))
        {
            return false;
        }

        if (optionCount <= 0)
        {
            return true;
        }

        var index = answerToken[0] - 'A';
        return index >= 0 && index < optionCount;
    }

    private static int CountMissingOrInvalidAnswers(IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        var missingCount = 0;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var currentAnswer = ReadJsonAsText(question.Answer);
                if (string.IsNullOrWhiteSpace(currentAnswer) ||
                    !IsValidAnswerOverride(question, currentAnswer))
                {
                    missingCount++;
                }
            }
        }

        return missingCount;
    }

    private static int ClearAnswersWithoutEvidence(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlySet<int> verifiedQuestionNumbers)
    {
        var clearedCount = 0;
        var fallbackGlobalQuestionNumber = 1;

        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                if (verifiedQuestionNumbers.Contains(effectiveQuestionNumber))
                {
                    continue;
                }

                var currentAnswer = ReadJsonAsText(question.Answer);
                if (string.IsNullOrWhiteSpace(currentAnswer))
                {
                    continue;
                }

                question.Answer = JsonSerializer.SerializeToElement(string.Empty);
                clearedCount++;
            }
        }

        return clearedCount;
    }

    private async Task<int> TryRecoverMissingOptionsAsync(
        List<GemmaPassagePayload> parsedPassages,
        string rawText,
        CancellationToken cancellationToken)
    {
        var totalApplied = 0;

        try
        {
            var candidates = CollectFallbackOptionCandidates(parsedPassages);
            if (candidates.Count == 0)
            {
                return 0;
            }

            var deterministicOptionMap = ExtractDeterministicOptionMapFromRawText(rawText, candidates);
            if (deterministicOptionMap.Count > 0)
            {
                totalApplied += ApplyRecoveredOptionMap(parsedPassages, deterministicOptionMap);
                candidates = CollectFallbackOptionCandidates(parsedPassages);
                if (candidates.Count == 0)
                {
                    return totalApplied;
                }
            }

            var optionSourceText = PrepareOptionRecoverySource(rawText, candidates);
            if (string.IsNullOrWhiteSpace(optionSourceText))
            {
                return totalApplied;
            }

            var prompt = BuildFallbackOptionPrompt(optionSourceText, candidates);
            var totalAttempts = MaxJsonParseRetries + 1;

            for (var attempt = 1; attempt <= totalAttempts; attempt++)
            {
                string rawResponse;
                try
                {
                    rawResponse = await RequestGemmaCompletionAsync(prompt, cancellationToken);
                }
                catch (Exception ex) when (TryResolveApiRetryDelay(ex, out var retryDelay, out var retryReason))
                {
                    logger.LogWarning(
                        ex,
                        "Gemma fallback option recovery transient failure at attempt {Attempt}/{MaxAttempts}. Retry in {RetryDelaySeconds}s. Reason: {Reason}",
                        attempt,
                        totalAttempts,
                        Math.Ceiling(retryDelay.TotalSeconds),
                        retryReason);

                    if (attempt == totalAttempts)
                    {
                        return totalApplied;
                    }

                    await Task.Delay(retryDelay, cancellationToken);
                    continue;
                }

                if (TryDeserializeFallbackOptionMap(rawResponse, out var recoveredOptionMap, out var parseError))
                {
                    if (recoveredOptionMap.Count == 0)
                    {
                        if (attempt == totalAttempts)
                        {
                            return totalApplied;
                        }

                        continue;
                    }

                    var applied = ApplyRecoveredOptionMap(parsedPassages, recoveredOptionMap);
                    if (applied > 0 || attempt == totalAttempts)
                    {
                        return totalApplied + applied;
                    }

                    logger.LogWarning(
                        "Gemma fallback option recovery returned {ReturnedCount} candidate question(s) but none passed validation at attempt {Attempt}/{MaxAttempts}.",
                        recoveredOptionMap.Count,
                        attempt,
                        totalAttempts);
                    continue;
                }

                logger.LogWarning(
                    "Gemma fallback option recovery returned invalid JSON at attempt {Attempt}/{MaxAttempts}: {Error}",
                    attempt,
                    totalAttempts,
                    parseError);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Fallback option recovery failed unexpectedly and will be skipped.");
        }

        return totalApplied;
    }

    private static Dictionary<int, List<string>> ExtractDeterministicOptionMapFromRawText(
        string rawText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        var result = new Dictionary<int, List<string>>();
        if (string.IsNullOrWhiteSpace(rawText) || candidates.Count == 0)
        {
            return result;
        }

        var chooseNCandidates = candidates
            .Where(candidate => string.Equals(candidate.QuestionType, "MCQ_CHOOSE_N", StringComparison.Ordinal))
            .ToList();
        if (chooseNCandidates.Count == 0)
        {
            return result;
        }

        var normalizedText = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var reviewZone = ExtractReviewAndExplanationsZone(normalizedText);

        var rangeSegments = QuestionRangeBoundaryRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Select(match => new QuestionRangeSegment(
                StartQuestion: ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion: ParseOcrQuestionNumber(match.Groups["end"].Value),
                StartIndex: match.Index))
            .Where(segment =>
                segment.StartQuestion >= 1 &&
                segment.StartQuestion <= 40 &&
                segment.EndQuestion >= segment.StartQuestion &&
                segment.EndQuestion <= 40)
            .OrderBy(segment => segment.StartIndex)
            .ToList();

        if (rangeSegments.Count == 0)
        {
            return result;
        }

        var reviewHeadingMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        var reviewStartIndex = reviewHeadingMatch.Success ? reviewHeadingMatch.Index : normalizedText.Length;

        var candidatesByRangeIndex = new Dictionary<int, List<FallbackOptionCandidate>>();
        foreach (var candidate in chooseNCandidates)
        {
            var matchedRangeIndex = -1;
            for (var index = 0; index < rangeSegments.Count; index++)
            {
                var segment = rangeSegments[index];
                if (candidate.QuestionNumber >= segment.StartQuestion &&
                    candidate.QuestionNumber <= segment.EndQuestion)
                {
                    matchedRangeIndex = index;
                    break;
                }
            }

            if (matchedRangeIndex < 0)
            {
                continue;
            }

            if (!candidatesByRangeIndex.TryGetValue(matchedRangeIndex, out var rangeCandidates))
            {
                rangeCandidates = [];
                candidatesByRangeIndex[matchedRangeIndex] = rangeCandidates;
            }

            rangeCandidates.Add(candidate);
        }

        foreach (var pair in candidatesByRangeIndex.OrderBy(pair => pair.Key))
        {
            var snippet = ExtractQuestionRangeSnippet(normalizedText, rangeSegments, pair.Key, reviewStartIndex);
            if (string.IsNullOrWhiteSpace(snippet))
            {
                continue;
            }

            var expectedOptionCount = pair.Value
                .Select(candidate => candidate.ExpectedOptionLabels.Count)
                .DefaultIfEmpty(0)
                .Max();
            var recoveredOptions = ExtractLabeledOptionsFromRawSnippet(snippet, expectedOptionCount);
            if (!HasMeaningfulMcqOptionSet(recoveredOptions) && !string.IsNullOrWhiteSpace(reviewZone))
            {
                recoveredOptions = ExtractLabeledOptionsFromReviewZone(
                    reviewZone,
                    rangeSegments[pair.Key].StartQuestion,
                    rangeSegments[pair.Key].EndQuestion,
                    expectedOptionCount);
            }

            if (!HasMeaningfulMcqOptionSet(recoveredOptions))
            {
                continue;
            }

            foreach (var candidate in pair.Value)
            {
                result[candidate.QuestionNumber] = recoveredOptions;
            }
        }

        return result;
    }

    private static List<string> ExtractLabeledOptionsFromReviewZone(
        string reviewZone,
        int startQuestion,
        int endQuestion,
        int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(reviewZone))
        {
            return [];
        }

        foreach (Match match in ReviewAnswerEntryRegex().Matches(reviewZone))
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var reviewStart, out var reviewEnd))
            {
                continue;
            }

            if (reviewStart != startQuestion || reviewEnd != endQuestion)
            {
                continue;
            }

            var options = ExtractLabeledOptionsFromReviewEntryRaw(match.Groups["raw"].Value, expectedOptionCount);
            if (HasMeaningfulMcqOptionSet(options))
            {
                return options;
            }
        }

        return [];
    }

    private static List<FallbackOptionCandidate> CollectFallbackOptionCandidates(
        IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        var result = new List<FallbackOptionCandidate>();
        var seenQuestionNumbers = new HashSet<int>();
        var fallbackGlobalQuestionNumber = 1;

        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                if (!seenQuestionNumbers.Add(effectiveQuestionNumber))
                {
                    continue;
                }

                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                if (!IsMcqType(mappedType))
                {
                    continue;
                }

                var options = ExtractOptions(question.Options);
                if (HasMeaningfulMcqOptionSet(options))
                {
                    continue;
                }

                result.Add(new FallbackOptionCandidate(
                    QuestionNumber: effectiveQuestionNumber,
                    QuestionType: mappedType,
                    QuestionText: CollapseWhitespaceForPrompt(ReadJsonAsText(question.QuestionText), 260),
                    ExpectedOptionLabels: BuildExpectedOptionLabels(options),
                    CurrentOptions: options
                        .Select(option => CollapseWhitespaceForPrompt(option, 120))
                        .Where(option => !string.IsNullOrWhiteSpace(option))
                        .Take(10)
                        .ToList()));
            }
        }

        return result
            .OrderBy(x => x.QuestionNumber)
            .ToList();
    }

    private static string PrepareOptionRecoverySource(
        string rawText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return string.Empty;
        }

        var normalized = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = RemoveSelectionMarkers(normalized);

        var reviewZone = ExtractReviewAndExplanationsZone(normalized);
        var questionContext = ExtractQuestionContextForOptionRecovery(normalized, candidates);

        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(questionContext))
        {
            parts.Add($"QUESTION_CONTEXT_FROM_RAW_TEXT:\n{questionContext}");
        }

        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            parts.Add($"REVIEW_AND_EXPLANATIONS:\n{reviewZone}");
        }

        if (parts.Count == 0)
        {
            return string.Empty;
        }

        var combined = string.Join("\n\n", parts);
        combined = Regex.Replace(combined, @"\n{3,}", "\n\n");
        if (combined.Length > MaxFallbackOptionSourceCharacters)
        {
            combined = combined[..MaxFallbackOptionSourceCharacters];
        }

        return combined.Trim();
    }

    private static string ExtractQuestionContextForOptionRecovery(
        string normalizedText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        if (string.IsNullOrWhiteSpace(normalizedText) || candidates.Count == 0)
        {
            return string.Empty;
        }

        var rangeSegments = QuestionRangeBoundaryRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Select(match => new QuestionRangeSegment(
                StartQuestion: ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion: ParseOcrQuestionNumber(match.Groups["end"].Value),
                StartIndex: match.Index))
            .Where(segment =>
                segment.StartQuestion >= 1 &&
                segment.StartQuestion <= 40 &&
                segment.EndQuestion >= segment.StartQuestion &&
                segment.EndQuestion <= 40)
            .OrderBy(segment => segment.StartIndex)
            .ToList();

        if (rangeSegments.Count == 0)
        {
            return string.Empty;
        }

        var reviewHeadingMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        var reviewStartIndex = reviewHeadingMatch.Success ? reviewHeadingMatch.Index : normalizedText.Length;

        var candidateQuestionNumbers = candidates
            .Select(candidate => candidate.QuestionNumber)
            .Where(number => number >= 1 && number <= 40)
            .Distinct()
            .OrderBy(number => number)
            .ToList();
        if (candidateQuestionNumbers.Count == 0)
        {
            return string.Empty;
        }

        var selectedRangeIndexes = new HashSet<int>();
        var snippets = new List<string>();

        foreach (var questionNumber in candidateQuestionNumbers)
        {
            var matchedRangeIndex = -1;
            for (var index = 0; index < rangeSegments.Count; index++)
            {
                var segment = rangeSegments[index];
                if (questionNumber >= segment.StartQuestion && questionNumber <= segment.EndQuestion)
                {
                    matchedRangeIndex = index;
                    break;
                }
            }

            if (matchedRangeIndex < 0 || !selectedRangeIndexes.Add(matchedRangeIndex))
            {
                continue;
            }

            var rangeStartIndex = rangeSegments[matchedRangeIndex].StartIndex;
            var nextRangeStartIndex = matchedRangeIndex < rangeSegments.Count - 1
                ? rangeSegments[matchedRangeIndex + 1].StartIndex
                : reviewStartIndex;

            var snippetEndIndex = Math.Min(reviewStartIndex, nextRangeStartIndex);
            if (snippetEndIndex <= rangeStartIndex)
            {
                snippetEndIndex = Math.Min(normalizedText.Length, rangeStartIndex + 7000);
            }

            var length = snippetEndIndex - rangeStartIndex;
            if (length <= 0)
            {
                continue;
            }

            var snippet = normalizedText.Substring(rangeStartIndex, length).Trim();
            if (snippet.Length > 7000)
            {
                snippet = snippet[..7000].Trim();
            }

            if (!string.IsNullOrWhiteSpace(snippet))
            {
                snippets.Add(snippet);
            }
        }

        return string.Join("\n\n", snippets);
    }

    private static string ExtractQuestionRangeSnippet(
        string normalizedText,
        IReadOnlyList<QuestionRangeSegment> rangeSegments,
        int rangeIndex,
        int reviewStartIndex)
    {
        if (string.IsNullOrWhiteSpace(normalizedText) ||
            rangeIndex < 0 ||
            rangeIndex >= rangeSegments.Count)
        {
            return string.Empty;
        }

        var rangeStartIndex = rangeSegments[rangeIndex].StartIndex;
        var nextRangeStartIndex = rangeIndex < rangeSegments.Count - 1
            ? rangeSegments[rangeIndex + 1].StartIndex
            : reviewStartIndex;

        var snippetEndIndex = Math.Min(reviewStartIndex, nextRangeStartIndex);
        if (snippetEndIndex <= rangeStartIndex)
        {
            snippetEndIndex = Math.Min(normalizedText.Length, rangeStartIndex + 7000);
        }

        var length = snippetEndIndex - rangeStartIndex;
        if (length <= 0)
        {
            return string.Empty;
        }

        var snippet = normalizedText.Substring(rangeStartIndex, length).Trim();
        return snippet.Length > 7000
            ? snippet[..7000].Trim()
            : snippet;
    }

    private static List<string> ExtractLabeledOptionsFromRawSnippet(string snippet, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(snippet))
        {
            return [];
        }

        var normalized = snippet
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = StripInlinePassageFooterNoise(normalized);
        normalized = RemoveSelectionMarkers(normalized);

        var optionBuilders = new Dictionary<char, StringBuilder>();
        var optionOrder = new List<char>();
        char? currentLabel = null;

        foreach (var rawLine in normalized.Split('\n'))
        {
            var line = Regex.Replace(rawLine, @"\s+", " ").Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (QuestionRangeBoundaryRegex().IsMatch(line) ||
                ReviewSectionHeadingRegex().IsMatch(line) ||
                LooseAnswerSectionHeadingRegex().IsMatch(line))
            {
                if (optionOrder.Count > 0)
                {
                    break;
                }

                continue;
            }

            if (PassageNoiseLineRegex().IsMatch(line) ||
                AccessOrPageNoiseRegex().IsMatch(line))
            {
                continue;
            }

            if (TryParseLabeledOptionLine(line, out var label, out var optionText))
            {
                if (!optionBuilders.ContainsKey(label))
                {
                    optionBuilders[label] = new StringBuilder();
                    optionOrder.Add(label);
                }

                currentLabel = label;
                if (!string.IsNullOrWhiteSpace(optionText))
                {
                    if (optionBuilders[label].Length > 0)
                    {
                        optionBuilders[label].Append(' ');
                    }

                    optionBuilders[label].Append(optionText);
                }

                continue;
            }

            if (!currentLabel.HasValue)
            {
                continue;
            }

            if (LeadingQuestionNumberRegex().IsMatch(line))
            {
                break;
            }

            var builder = optionBuilders[currentLabel.Value];
            if (builder.Length > 0)
            {
                builder.Append(' ');
            }

            builder.Append(line);
        }

        var options = optionOrder
            .OrderBy(label => label)
            .Select(label => Regex.Replace(optionBuilders[label].ToString(), @"\s+", " ").Trim())
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Where(option => !IsOptionLabelOnly(option))
            .ToList();

        var compactOptions = ExtractChooseNOptionsFromCompactLabelBlob(normalized, expectedOptionCount);
        if (HasMeaningfulMcqOptionSet(compactOptions) &&
            compactOptions.Count >= options.Count)
        {
            options = compactOptions;
        }

        if (expectedOptionCount > 0)
        {
            if (options.Count < expectedOptionCount)
            {
                return [];
            }

            if (options.Count > expectedOptionCount)
            {
                options = options.Take(expectedOptionCount).ToList();
            }
        }

        return options;
    }

    private static List<string> ExtractChooseNOptionsFromCompactLabelBlob(string snippet, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(snippet))
        {
            return [];
        }

        var lines = snippet
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line => Regex.Replace(line, @"\s+", " ").Trim())
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Where(line =>
                !QuestionRangeBoundaryRegex().IsMatch(line) &&
                !ReviewSectionHeadingRegex().IsMatch(line) &&
                !LooseAnswerSectionHeadingRegex().IsMatch(line) &&
                !PassageNoiseLineRegex().IsMatch(line) &&
                !AccessOrPageNoiseRegex().IsMatch(line))
            .ToList();
        if (lines.Count == 0)
        {
            return [];
        }

        for (var index = 0; index < lines.Count; index++)
        {
            List<char> labels;
            string remainder;

            if (TryExtractCompactOptionLabels(lines[index], out labels, out remainder))
            {
                // no-op
            }
            else
            {
                labels = [];
                remainder = string.Empty;
                var cursor = index;
                while (cursor < lines.Count && TryReadStandaloneOptionLabel(lines[cursor], out var label))
                {
                    labels.Add(label);
                    cursor++;
                }

                if (labels.Count < Math.Max(4, expectedOptionCount > 0 ? expectedOptionCount : 4))
                {
                    continue;
                }

                index = cursor - 1;
            }

            if (labels.Count < Math.Max(4, expectedOptionCount > 0 ? expectedOptionCount : 4))
            {
                continue;
            }

            var blobParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(remainder))
            {
                blobParts.Add(remainder);
            }

            for (var cursor = index + 1; cursor < lines.Count; cursor++)
            {
                var line = lines[cursor];
                if (LeadingQuestionNumberRegex().IsMatch(line) ||
                    LooksLikeQuestionBodyLine(line))
                {
                    break;
                }

                if (TryReadStandaloneOptionLabel(line, out _))
                {
                    continue;
                }

                blobParts.Add(line);
            }

            var optionTexts = SplitCompactChooseNOptionTexts(string.Join(" ", blobParts), labels.Count);
            if (!HasMeaningfulMcqOptionSet(optionTexts))
            {
                continue;
            }

            if (expectedOptionCount > 0)
            {
                if (optionTexts.Count < expectedOptionCount)
                {
                    continue;
                }

                if (optionTexts.Count > expectedOptionCount)
                {
                    optionTexts = optionTexts.Take(expectedOptionCount).ToList();
                }
            }

            return optionTexts;
        }

        return [];
    }

    private static bool TryExtractCompactOptionLabels(string line, out List<char> labels, out string remainder)
    {
        labels = [];
        remainder = string.Empty;

        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var match = Regex.Match(
            line,
            @"^\s*(?<labels>[A-H](?:\s+[A-H]){3,7})(?<remainder>\s+.+)?$",
            RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            return false;
        }

        labels = Regex.Matches(match.Groups["labels"].Value, @"[A-H]", RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Select(item => char.ToUpperInvariant(item.Value[0]))
            .Distinct()
            .ToList();
        if (labels.Count < 4)
        {
            labels = [];
            return false;
        }

        remainder = match.Groups["remainder"].Value.Trim();
        return true;
    }

    private static bool TryReadStandaloneOptionLabel(string line, out char label)
    {
        label = '\0';
        if (!TryParseLabeledOptionLine(line, out var parsedLabel, out var optionText) ||
            !string.IsNullOrWhiteSpace(optionText))
        {
            return false;
        }

        label = parsedLabel;
        return true;
    }

    private static List<string> SplitCompactChooseNOptionTexts(string blob, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(blob) || expectedOptionCount <= 0)
        {
            return [];
        }

        var normalized = RemoveSelectionMarkers(UnescapeExtractedText(blob));
        normalized = NormalizeExtractedSpacing(normalized)
            .Replace("\r\n", " ")
            .Replace('\r', ' ')
            .Replace('\n', ' ');
        normalized = Regex.Replace(normalized, @"(?<=[.!?])(?=[A-Z])", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var sentenceParts = Regex.Split(normalized, @"(?<=[.!?])\s+(?=[A-Z])")
            .Select(part => part.Trim())
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .Where(part => !IsOptionLabelOnly(part))
            .ToList();

        if (sentenceParts.Count < expectedOptionCount)
        {
            sentenceParts = Regex.Split(normalized, @"\s*;\s*")
                .Select(part => part.Trim())
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .Where(part => !IsOptionLabelOnly(part))
                .ToList();
        }

        if (sentenceParts.Count < expectedOptionCount)
        {
            return [];
        }

        return sentenceParts
            .Take(expectedOptionCount)
            .ToList();
    }

    private static List<string> ExtractLabeledOptionsFromReviewEntryRaw(string rawEntryBlock, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(rawEntryBlock))
        {
            return [];
        }

        var lineBasedOptions = ExtractLabeledOptionsFromRawSnippet(rawEntryBlock, expectedOptionCount);
        if (HasMeaningfulMcqOptionSet(lineBasedOptions))
        {
            return lineBasedOptions;
        }

        var normalized = UnescapeExtractedText(rawEntryBlock)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = RemoveSelectionMarkers(normalized);
        normalized = GluedReviewMarkerRegex().Replace(normalized, " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var markerMatch = ReviewExplanationMarkerRegex().Match(normalized);
        if (markerMatch.Success && markerMatch.Index > 0)
        {
            normalized = normalized[..markerMatch.Index].Trim();
        }

        var matches = Regex.Matches(
            normalized,
            @"(?is)(?<![A-Za-z])(?<label>[A-H])\s*[).:\-]?\s+(?<text>.*?)(?=(?<![A-Za-z])[A-H]\s*[).:\-]?\s+|$)");
        if (matches.Count == 0)
        {
            return [];
        }

        var optionsByLabel = new Dictionary<char, string>();
        foreach (Match match in matches)
        {
            if (!match.Success)
            {
                continue;
            }

            var label = char.ToUpperInvariant(match.Groups["label"].Value[0]);
            if (label is < 'A' or > 'H' || optionsByLabel.ContainsKey(label))
            {
                continue;
            }

            var optionText = Regex.Replace(match.Groups["text"].Value, @"\s+", " ").Trim();
            optionText = optionText.Trim(',', ';', ':', '-', '–', '—');
            if (string.IsNullOrWhiteSpace(optionText) || IsOptionLabelOnly(optionText))
            {
                continue;
            }

            optionsByLabel[label] = optionText;
        }

        var options = optionsByLabel
            .OrderBy(pair => pair.Key)
            .Select(pair => pair.Value)
            .ToList();

        if (expectedOptionCount > 0)
        {
            if (options.Count < expectedOptionCount)
            {
                return [];
            }

            if (options.Count > expectedOptionCount)
            {
                options = options.Take(expectedOptionCount).ToList();
            }
        }

        return options;
    }

    private static bool TryParseLabeledOptionLine(string line, out char label, out string optionText)
    {
        label = '\0';
        optionText = string.Empty;

        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var labeledMatch = OptionStartsWithLetterLabelRegex().Match(line);
        if (!labeledMatch.Success)
        {
            labeledMatch = OptionStartsWithLetterSpaceRegex().Match(line);
        }

        if (labeledMatch.Success)
        {
            label = char.ToUpperInvariant(labeledMatch.Groups["label"].Value[0]);
            if (label is < 'A' or > 'H')
            {
                return false;
            }

            optionText = labeledMatch.Groups["text"].Value.Trim();
            return true;
        }

        var compact = line.Trim().Trim('.', ')', ':', '-', ' ');
        if (compact.Length == 1 && compact[0] is >= 'A' and <= 'H')
        {
            label = compact[0];
            optionText = string.Empty;
            return true;
        }

        return false;
    }

    private static string BuildFallbackOptionPrompt(
        string reviewAndSolutionText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        var candidatesJson = JsonSerializer.Serialize(
            candidates.Select(candidate => new
            {
                question_number = candidate.QuestionNumber,
                question_type = candidate.QuestionType,
                question_text = candidate.QuestionText,
                expected_option_labels = candidate.ExpectedOptionLabels,
                current_options = candidate.CurrentOptions
            }),
            JsonOptions);

        return $"""
            Bạn là bộ máy khôi phục lựa chọn trắc nghiệm IELTS.
            Nhiệm vụ: khôi phục nội dung options cho các câu bị mất text (chỉ còn A/B/C hoặc rỗng) CHỈ dựa trên QUESTION_CONTEXT_FROM_RAW_TEXT và REVIEW_AND_EXPLANATIONS.

            QUY TẮC CỨNG:
            - Không tự giải bài, không suy luận theo passage.
            - Chỉ dùng QUESTION_CONTEXT_FROM_RAW_TEXT và REVIEW_AND_EXPLANATIONS để khôi phục options.
            - Nghiêm cấm dùng khối "Solution:" dạng dính chữ (ví dụ: 1C2D3F... hoặc 1822A,C,D,E,H).
            - Với câu MCQ, không được trả options = [].
            - Nghiêm cấm trả option chỉ là nhãn "A", "B", "C"... không có nội dung.
            - Nếu câu MCQ đang thiếu option (ví dụ chỉ có A/B), phải cố gắng khôi phục đủ option còn thiếu từ Review and Explanations.
            - Nếu đáp án đã chỉ ra letter chưa có option tương ứng (ví dụ answer = C nhưng chưa có option C), bắt buộc tiếp tục tìm và khôi phục option đó.
            - Với MCQ_CHOOSE_N, phải khôi phục đầy đủ option text cho TỪNG câu. Nếu block dùng chung một answer bank A-H/A-F thì phải khôi phục trọn bộ answer bank đó; nếu mỗi câu có option riêng thì phải giữ option riêng theo từng câu.
            - OPTION TEXT MANDATORY: với MCQ_CHOOSE_N, mảng options TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ chứa "A", "B", "C", "D"... hoặc checkbox trần không có text.
            - Nếu QUESTION_CONTEXT_FROM_RAW_TEXT chỉ còn cụm nhãn rời như "A B C D ..." và block thật sự dùng shared answer bank, BẠN BẮT BUỘC phải kéo xuống REVIEW_AND_EXPLANATIONS để lấy lại đầy đủ nội dung từng option.
            - Việc trả về ["A", "B", "C"] hoặc label-only options cho MCQ_CHOOSE_N là LỖI NGHIÊM TRỌNG; phải trả về text đầy đủ kiểu "A. ...", "B. ...".
            - QUY TẮC SỐNG CÒN: TUYỆT ĐỐI KHÔNG BAO GIỜ trả option rỗng. Cấm trả "A", "B", "C"... nếu không có nội dung text đi kèm.
            - Nếu thiếu text option trong phần câu hỏi, bắt buộc đối chiếu chéo phần Review and Explanations để khôi phục đủ text cho từng option trước khi trả JSON.
            - LUẬT CHỐNG LỖI DÍNH CỘT PDF: nếu phát hiện cụm nhãn kiểu "A B C D ...", rồi một khối câu dính liền phía sau, phải tự tách khối câu đó theo dấu chấm/chữ hoa và map tuần tự vào A, B, C, D...
            - Khi áp dụng luật dính cột, phải giữ đúng thứ tự nhãn ban đầu (A trước B trước C...) và điền đủ text cho từng nhãn.
            - CẢNH BÁO LỖI LẮP SAI OPTIONS (MCQ): TUYỆT ĐỐI KHÔNG lấy option của câu này gán sang câu khác.
            - Bắt buộc đối chiếu 1-1 theo đúng question_number; chỉ lấy dữ liệu từ phần Review/Explanations của CHÍNH câu đó.
            - Không tự ý thêm/bớt lựa chọn. Nếu câu chỉ có A,B,C thì output bắt buộc đúng 3 options; không được sinh thêm D.
            - Ví dụ: nếu review ghi "answer ... must be A. mornings" thì option A của câu đó phải là "mornings" (không để trống).
            - Với mỗi câu, số lượng options trả về phải khớp số lượng expected_option_labels trong QUESTIONS_NEED_OPTIONS_JSON.
            - Giữ wording gốc; chỉ sửa lỗi dính chữ/mất khoảng trắng khi hiển nhiên.
            - FEW-SHOT TEMPLATE CHO MCQ_CHOOSE_N: nếu block raw bị dính kiểu "A B C D E F G H McCarthy claims... The cost... Most British..." và đây là shared answer bank của cả group, output hợp lệ phải có dạng:
              ["A. McCarthy claims ...", "B. The cost ...", "C. Most British ...", "D. ...", "E. ...", "F. ...", "G. ...", "H. ..."].
              Output kiểu ["A", "B", "C", ...] là sai và phải tự sửa trước khi trả JSON.
            - Trả về DUY NHẤT JSON object có field "options".
              Mỗi phần tử phải có: "question_number", "options" (mảng string).

            QUESTIONS_NEED_OPTIONS_JSON:
            {candidatesJson}

            OPTION_RECOVERY_SOURCE_TEXT:
            {reviewAndSolutionText}
            """;
    }

    private static bool TryDeserializeFallbackOptionMap(
        string rawResponse,
        out Dictionary<int, List<string>> recoveredOptionMap,
        out string error)
    {
        recoveredOptionMap = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeFallbackOptionCandidate(candidate, out recoveredOptionMap, out var parseError))
                {
                    return true;
                }

                error = parseError ?? "Unknown parse error";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeFallbackOptionCandidate(
        string candidateJson,
        out Dictionary<int, List<string>> recoveredOptionMap,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var payload = DeserializeFallbackOptionPayload(workingJson);
                recoveredOptionMap = ConvertFallbackOptionPayloadToMap(payload);
                return true;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        recoveredOptionMap = [];
        return false;
    }

    private static FallbackOptionResponse DeserializeFallbackOptionPayload(string json)
    {
        var objectPayload = JsonSerializer.Deserialize<FallbackOptionResponse>(json, JsonOptions);
        if (objectPayload?.Options is not null)
        {
            return objectPayload;
        }

        var arrayPayload = JsonSerializer.Deserialize<List<FallbackOptionItem>>(json, JsonOptions);
        return new FallbackOptionResponse
        {
            Options = arrayPayload ?? []
        };
    }

    private static Dictionary<int, List<string>> ConvertFallbackOptionPayloadToMap(FallbackOptionResponse payload)
    {
        var map = new Dictionary<int, List<string>>();
        foreach (var item in payload.Options ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(item.QuestionNumber));
            if (!questionNumber.HasValue || questionNumber.Value <= 0)
            {
                continue;
            }

            var normalizedOptions = NormalizeRecoveredOptions(item.Options ?? []);
            if (!HasMeaningfulMcqOptionSet(normalizedOptions))
            {
                continue;
            }

            map[questionNumber.Value] = normalizedOptions;
        }

        return map;
    }

    private static int ApplyRecoveredOptionMap(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, List<string>> recoveredOptionMap)
    {
        if (recoveredOptionMap.Count == 0)
        {
            return 0;
        }

        var appliedCount = 0;
        var fallbackGlobalQuestionNumber = 1;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                if (!IsMcqType(mappedType) ||
                    !recoveredOptionMap.TryGetValue(effectiveQuestionNumber, out var recoveredOptions))
                {
                    continue;
                }

                var normalizedOptions = NormalizeRecoveredOptions(recoveredOptions);
                var expectedOptionCount = BuildExpectedOptionLabels(ExtractOptions(question.Options)).Count;
                if (!HasMeaningfulMcqOptionSet(normalizedOptions))
                {
                    continue;
                }

                if (expectedOptionCount > 0 && normalizedOptions.Count != expectedOptionCount)
                {
                    continue;
                }

                question.Options = JsonSerializer.SerializeToElement(normalizedOptions);
                appliedCount++;
            }
        }

        return appliedCount;
    }

    private static List<string> NormalizeRecoveredOptions(IEnumerable<string> options) =>
        options
            .Select(option => UnescapeExtractedText(option ?? string.Empty))
            .Select(option => RemoveSelectionMarkers(option))
            .Select(option => option
                .Replace("\r\n", " ")
                .Replace('\r', ' ')
                .Replace('\n', ' '))
            .Select(option => Regex.Replace(option, @"\s+", " ").Trim())
            .Select(option =>
            {
                if (string.IsNullOrWhiteSpace(option))
                {
                    return option;
                }

                var stripped = option;
                var labeledMatch = OptionStartsWithLetterLabelRegex().Match(stripped);
                if (labeledMatch.Success)
                {
                    stripped = labeledMatch.Groups["text"].Value.Trim();
                }
                else
                {
                    var spacedLabelMatch = OptionStartsWithLetterSpaceRegex().Match(stripped);
                    if (spacedLabelMatch.Success)
                    {
                        stripped = spacedLabelMatch.Groups["text"].Value.Trim();
                    }
                }

                return stripped.Trim();
            })
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Where(option => !IsOptionLabelOnly(option))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static bool HasMeaningfulMcqOptionSet(IReadOnlyCollection<string> options)
    {
        if (options.Count < 2)
        {
            return false;
        }

        var meaningfulCount = options.Count(option => !IsOptionLabelOnly(option));
        return meaningfulCount >= Math.Min(2, options.Count);
    }

    private static bool IsOptionLabelOnly(string optionText)
    {
        if (string.IsNullOrWhiteSpace(optionText))
        {
            return true;
        }

        var normalized = RemoveSelectionMarkers(optionText).Trim();
        if (OptionLabelOnlyRegex().IsMatch(normalized))
        {
            return true;
        }

        return false;
    }

    private static bool IsMcqType(string mappedType) =>
        mappedType is "MCQ_SINGLE" or "MCQ_MULTIPLE" or "MCQ_CHOOSE_N";

    private static IReadOnlyList<string> BuildExpectedOptionLabels(IReadOnlyList<string> currentOptions)
    {
        if (currentOptions.Count == 0)
        {
            return [];
        }

        var labels = new List<string>(currentOptions.Count);
        foreach (var option in currentOptions)
        {
            if (string.IsNullOrWhiteSpace(option))
            {
                continue;
            }

            var normalized = option.Trim().Trim('.', ')', ':').ToUpperInvariant();
            if (normalized.Length == 1 && normalized[0] is >= 'A' and <= 'H')
            {
                labels.Add(normalized);
            }
        }

        if (labels.Count > 0)
        {
            return labels.Distinct(StringComparer.Ordinal).ToList();
        }

        return Enumerable.Range(0, Math.Min(currentOptions.Count, 8))
            .Select(index => ((char)('A' + index)).ToString())
            .ToList();
    }

    private async Task<FallbackAnswerMappingResult> TryApplyFallbackAnswerMappingAsync(
        List<GemmaPassagePayload> parsedPassages,
        string answerZone,
        CancellationToken cancellationToken)
    {
        try
        {
            var candidates = CollectFallbackAnswerCandidates(parsedPassages);
            if (candidates.Count == 0)
            {
                return new FallbackAnswerMappingResult(0, new HashSet<int>());
            }

            var preparedAnswerKey = PrepareAnswerKeyForFallback(answerZone);
            if (string.IsNullOrWhiteSpace(preparedAnswerKey))
            {
                return new FallbackAnswerMappingResult(0, new HashSet<int>());
            }

            var prompt = BuildFallbackAnswerPrompt(preparedAnswerKey, candidates);
            var totalAttempts = MaxJsonParseRetries + 1;

            for (var attempt = 1; attempt <= totalAttempts; attempt++)
            {
                string rawResponse;
                try
                {
                    rawResponse = await RequestGemmaCompletionAsync(prompt, cancellationToken);
                }
                catch (Exception ex) when (TryResolveApiRetryDelay(ex, out var retryDelay, out var retryReason))
                {
                    logger.LogWarning(
                        ex,
                        "Gemma fallback answer mapping transient failure at attempt {Attempt}/{MaxAttempts}. Retry in {RetryDelaySeconds}s. Reason: {Reason}",
                        attempt,
                        totalAttempts,
                        Math.Ceiling(retryDelay.TotalSeconds),
                        retryReason);

                    if (attempt == totalAttempts)
                    {
                        return new FallbackAnswerMappingResult(0, new HashSet<int>());
                    }

                    await Task.Delay(retryDelay, cancellationToken);
                    continue;
                }

                if (TryDeserializeFallbackAnswerMap(rawResponse, out var fallbackAnswers, out var parseError))
                {
                    if (fallbackAnswers.Count == 0)
                    {
                        logger.LogWarning(
                            "Gemma fallback answer mapping returned empty answer map at attempt {Attempt}/{MaxAttempts}.",
                            attempt,
                            totalAttempts);

                        if (attempt == totalAttempts)
                        {
                            return new FallbackAnswerMappingResult(0, new HashSet<int>());
                        }

                        continue;
                    }

                    var fallbackResult = ApplyFallbackAnswerMap(parsedPassages, fallbackAnswers);
                    if (fallbackResult.AppliedCount > 0 ||
                        fallbackResult.VerifiedQuestionNumbers.Count > 0 ||
                        attempt == totalAttempts)
                    {
                        return fallbackResult;
                    }

                    logger.LogWarning(
                        "Gemma fallback answer mapping returned {ReturnedCount} answer(s) but none passed validation at attempt {Attempt}/{MaxAttempts}.",
                        fallbackAnswers.Count,
                        attempt,
                        totalAttempts);
                    continue;
                }

                logger.LogWarning(
                    "Gemma fallback answer mapping returned invalid JSON at attempt {Attempt}/{MaxAttempts}: {Error}",
                    attempt,
                    totalAttempts,
                    parseError);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Fallback answer mapping failed unexpectedly and will be skipped.");
        }

        return new FallbackAnswerMappingResult(0, new HashSet<int>());
    }

    private static List<FallbackAnswerCandidate> CollectFallbackAnswerCandidates(IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        var result = new List<FallbackAnswerCandidate>();
        var seenQuestionNumbers = new HashSet<int>();
        var fallbackGlobalQuestionNumber = 1;

        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                var currentAnswer = ReadJsonAsText(question.Answer);
                var hasValidAnswer = !string.IsNullOrWhiteSpace(currentAnswer) &&
                                     IsValidAnswerOverride(question, currentAnswer);

                if (hasValidAnswer || !seenQuestionNumbers.Add(effectiveQuestionNumber))
                {
                    continue;
                }

                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                var questionText = CollapseWhitespaceForPrompt(ReadJsonAsText(question.QuestionText), 240);
                var options = ExtractOptions(question.Options)
                    .Where(option => !string.IsNullOrWhiteSpace(option))
                    .Select(option => CollapseWhitespaceForPrompt(option, 120))
                    .Where(option => !string.IsNullOrWhiteSpace(option))
                    .Take(10)
                    .ToList();

                result.Add(new FallbackAnswerCandidate(
                    QuestionNumber: effectiveQuestionNumber,
                    QuestionType: mappedType,
                    QuestionText: questionText,
                    Options: options,
                    CurrentAnswer: currentAnswer?.Trim() ?? string.Empty));
            }
        }

        return result
            .OrderBy(x => x.QuestionNumber)
            .ToList();
    }

    private static string PrepareAnswerKeyForFallback(string answerZone)
    {
        if (string.IsNullOrWhiteSpace(answerZone))
        {
            return string.Empty;
        }

        var normalized = answerZone
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var reviewZone = ExtractReviewAndExplanationsZone(normalized);
        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            normalized = reviewZone;
        }

        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        var lines = normalized
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var answerLikeLines = lines
            .Where(line =>
                AnswerEntryLineRegex().IsMatch(line) ||
                CompactAnswerBlobRegex().IsMatch(line))
            .Take(500)
            .ToList();

        var compactText = answerLikeLines.Count >= 8
            ? string.Join('\n', answerLikeLines)
            : normalized;

        if (compactText.Length > MaxFallbackAnswerKeyCharacters)
        {
            compactText = compactText[..MaxFallbackAnswerKeyCharacters];
        }

        return compactText.Trim();
    }

    private static string BuildFallbackAnswerPrompt(
        string answerKeyText,
        IReadOnlyList<FallbackAnswerCandidate> candidates)
    {
        var candidatesJson = JsonSerializer.Serialize(
            candidates.Select(candidate => new
            {
                question_number = candidate.QuestionNumber,
                question_type = candidate.QuestionType,
                question_text = candidate.QuestionText,
                options = candidate.Options,
                current_answer = candidate.CurrentAnswer
            }),
            JsonOptions);

        return $"""
            Bạn là bộ máy bóc tách đáp án IELTS.
            Nhiệm vụ: map đáp án cho danh sách câu hỏi dưới đây CHỈ dựa vào ANSWER KEY/SOLUTION.

            QUY TẮC CỨNG:
            - Không tự giải đề, không suy luận theo passage.
            - CHỈ được dùng thông tin từ Review and Explanations.
            - Nghiêm cấm dùng khối "Solution:" dạng dính chữ (ví dụ: 1C2D3F... hoặc 1822A,C,D,E,H).
            - Nếu không tìm thấy đáp án rõ ràng cho câu nào thì để answer = "".
            - Nếu answer key/review có đáp án rõ cho question_number thì TUYỆT ĐỐI không để answer rỗng.
            - Với dạng Choose N statements cho dải câu (ví dụ 18-22), phải map theo từng câu riêng 18, 19, 20, 21, 22; không gộp range.
            - Giữ đáp án đúng định dạng:
              + TFNG: TRUE/FALSE/NOT GIVEN
              + YNNG: YES/NO/NOT GIVEN
              + Câu chọn chữ cái: A-H
              + Điền từ: giữ nguyên từ/cụm từ trong answer key, không paraphrase.
            - Trả về DUY NHẤT JSON thuần theo schema object có field "answers";
              mỗi phần tử answers phải có "question_number" và "answer".

            QUESTIONS_TO_MAP_JSON:
            {candidatesJson}

            ANSWER_KEY_SOLUTION_TEXT:
            {answerKeyText}
            """;
    }

    private static bool TryDeserializeFallbackAnswerMap(
        string rawResponse,
        out Dictionary<int, string> fallbackAnswers,
        out string error)
    {
        fallbackAnswers = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeFallbackAnswerCandidate(candidate, out fallbackAnswers, out var parseError))
                {
                    return true;
                }

                error = parseError ?? "Unknown parse error";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeFallbackAnswerCandidate(
        string candidateJson,
        out Dictionary<int, string> fallbackAnswers,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var payload = DeserializeFallbackAnswerPayload(workingJson);
                fallbackAnswers = ConvertFallbackAnswerPayloadToMap(payload);
                return true;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        fallbackAnswers = [];
        return false;
    }

    private static FallbackAnswerResponse DeserializeFallbackAnswerPayload(string json)
    {
        var objectPayload = JsonSerializer.Deserialize<FallbackAnswerResponse>(json, JsonOptions);
        if (objectPayload?.Answers is not null)
        {
            return objectPayload;
        }

        var arrayPayload = JsonSerializer.Deserialize<List<FallbackAnswerItem>>(json, JsonOptions);
        return new FallbackAnswerResponse
        {
            Answers = arrayPayload ?? []
        };
    }

    private static Dictionary<int, string> ConvertFallbackAnswerPayloadToMap(FallbackAnswerResponse payload)
    {
        var map = new Dictionary<int, string>();
        foreach (var item in payload.Answers ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(item.QuestionNumber));
            if (!questionNumber.HasValue || questionNumber.Value <= 0)
            {
                continue;
            }

            var normalizedAnswer = NormalizeFallbackAnswer(item.Answer);
            if (string.IsNullOrWhiteSpace(normalizedAnswer))
            {
                continue;
            }

            map[questionNumber.Value] = normalizedAnswer;
        }

        return map;
    }

    private static FallbackAnswerMappingResult ApplyFallbackAnswerMap(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> fallbackAnswers)
    {
        if (fallbackAnswers.Count == 0)
        {
            return new FallbackAnswerMappingResult(0, new HashSet<int>());
        }

        var applied = 0;
        var verifiedQuestionNumbers = new HashSet<int>();
        var fallbackGlobalQuestionNumber = 1;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;

                if (!fallbackAnswers.TryGetValue(effectiveQuestionNumber, out var fallbackAnswer) ||
                    string.IsNullOrWhiteSpace(fallbackAnswer))
                {
                    fallbackGlobalQuestionNumber++;
                    continue;
                }

                var canonicalFallbackAnswer = CanonicalizeAnswerForQuestionType(question, fallbackAnswer);
                if (string.IsNullOrWhiteSpace(canonicalFallbackAnswer) ||
                    !IsValidAnswerOverride(question, canonicalFallbackAnswer))
                {
                    fallbackGlobalQuestionNumber++;
                    continue;
                }

                verifiedQuestionNumbers.Add(effectiveQuestionNumber);

                var currentAnswer = NormalizeFallbackAnswer(ReadJsonAsText(question.Answer));
                var normalizedFallbackAnswer = NormalizeFallbackAnswer(canonicalFallbackAnswer);
                if (!string.Equals(currentAnswer, normalizedFallbackAnswer, StringComparison.Ordinal))
                {
                    question.Answer = JsonSerializer.SerializeToElement(canonicalFallbackAnswer);
                    applied++;
                }

                fallbackGlobalQuestionNumber++;
            }
        }

        return new FallbackAnswerMappingResult(applied, verifiedQuestionNumbers);
    }

    private static string NormalizeFallbackAnswer(string? rawAnswer)
    {
        var sanitized = SanitizeAnswerValue(rawAnswer);
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return string.Empty;
        }

        var normalized = NormalizeToken(sanitized);
        var orderedLetterTokens = SplitAnswerTokensOrdered(sanitized);
        return normalized switch
        {
            "NG" or "NOTGIVEN" => "NOT GIVEN",
            "TRUE" => "TRUE",
            "FALSE" => "FALSE",
            "YES" => "YES",
            "NO" => "NO",
            "NOT GIVEN" => "NOT GIVEN",
            _ when IsSingleLetterAnswerToken(normalized) => normalized,
            _ when orderedLetterTokens.Count > 1 &&
                   orderedLetterTokens.All(IsSingleLetterAnswerToken)
                => string.Join(", ", orderedLetterTokens),
            _ => sanitized
        };
    }

    private static string CanonicalizeAnswerForQuestionType(GemmaQuestionPayload question, string? rawAnswer)
    {
        var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
        var normalized = NormalizeFallbackAnswer(rawAnswer);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var tokens = SplitAnswerTokensOrdered(normalized);
        if (tokens.Count == 0)
        {
            return normalized;
        }

        if (mappedType == "TFNG")
        {
            var mappedTokens = tokens.Select(MapTfngToken).ToList();
            if (mappedTokens.All(token => !string.IsNullOrWhiteSpace(token)))
            {
                return string.Join(", ", mappedTokens);
            }
        }
        else if (mappedType == "YNNG")
        {
            var mappedTokens = tokens.Select(MapYnngToken).ToList();
            if (mappedTokens.All(token => !string.IsNullOrWhiteSpace(token)))
            {
                return string.Join(", ", mappedTokens);
            }
        }
        else if (mappedType == "SENTENCE_COMPLETION")
        {
            return NormalizeFillBlankAlternativeAnswer(normalized);
        }

        return normalized;
    }

    private static string NormalizeFillBlankAlternativeAnswer(string answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return string.Empty;
        }

        var candidate = answer.Trim();
        var hasAlternativeSeparator =
            candidate.Contains('/', StringComparison.Ordinal) ||
            candidate.Contains('|', StringComparison.Ordinal) ||
            candidate.Contains(';', StringComparison.Ordinal) ||
            Regex.IsMatch(candidate, @"(?i)\bor\b");

        if (!hasAlternativeSeparator)
        {
            return candidate;
        }

        var normalizedSeparators = Regex.Replace(candidate, @"(?i)\s+or\s+", "|");
        normalizedSeparators = normalizedSeparators
            .Replace("/", "|", StringComparison.Ordinal)
            .Replace(";", "|", StringComparison.Ordinal);

        var rawParts = normalizedSeparators
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (rawParts.Length <= 1)
        {
            return candidate;
        }

        var parts = new List<string>(rawParts.Length);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rawPart in rawParts)
        {
            var cleanedPart = SanitizeAnswerValue(rawPart);
            if (string.IsNullOrWhiteSpace(cleanedPart))
            {
                continue;
            }

            if (!seen.Add(cleanedPart))
            {
                continue;
            }

            parts.Add(cleanedPart);
        }

        return parts.Count <= 1
            ? candidate
            : string.Join("|", parts);
    }

    private static string MapTfngToken(string token) => token switch
    {
        "TRUE" or "T" => "TRUE",
        "FALSE" or "F" => "FALSE",
        "NG" or "NOTGIVEN" or "NOT GIVEN" => "NOT GIVEN",
        _ => string.Empty
    };

    private static string MapYnngToken(string token) => token switch
    {
        "YES" or "Y" => "YES",
        "NO" or "N" => "NO",
        "NG" or "NOTGIVEN" or "NOT GIVEN" => "NOT GIVEN",
        _ => string.Empty
    };

    private static string CollapseWhitespaceForPrompt(string? text, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var normalized = Regex.Replace(UnescapeExtractedText(text), @"\s+", " ").Trim();
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..maxLength] + "...";
    }

    private static void NormalizeQuestionTypes(IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var questionText = ReadJsonAsText(question.QuestionText) ?? string.Empty;
                var options = ExtractOptions(question.Options);
                var answerText = ReadJsonAsText(question.Answer);
                var detectedType = DetectQuestionType(
                    questionText,
                    options,
                    ReadJsonAsText(question.QuestionType),
                    answerText);
                question.QuestionType = JsonSerializer.SerializeToElement(detectedType);
                question.Options = NormalizeOptionArray(question.Options);
            }

            EnforceQuestionTypeAnchors(passage.Questions);
        }
    }

    private static void EnforceQuestionTypeAnchors(List<GemmaQuestionPayload> questions)
    {
        if (questions.Count == 0)
        {
            return;
        }

        var hasExplicitTfngInstruction = false;
        var hasExplicitYnngInstruction = false;

        foreach (var question in questions)
        {
            var questionText = ReadJsonAsText(question.QuestionText) ?? string.Empty;
            if (ContainsTfngInstruction(questionText))
            {
                hasExplicitTfngInstruction = true;
            }

            if (ContainsYnngInstruction(questionText))
            {
                hasExplicitYnngInstruction = true;
            }

            if (MatchingInfoInstructionRegex().IsMatch(questionText))
            {
                question.QuestionType = JsonSerializer.SerializeToElement("MatchingInfo");
                continue;
            }

            if (ContainsMcqMultipleInstruction(questionText))
            {
                question.QuestionType = JsonSerializer.SerializeToElement("McqMultiple");
                continue;
            }

            if (ContainsMcqSingleInstruction(questionText))
            {
                question.QuestionType = JsonSerializer.SerializeToElement("McqSingle");
            }
        }

        if (hasExplicitTfngInstruction && !hasExplicitYnngInstruction)
        {
            foreach (var question in questions)
            {
                if (MapQuestionType(ReadJsonAsText(question.QuestionType)) == "YNNG")
                {
                    question.QuestionType = JsonSerializer.SerializeToElement("TrueFalseNotGiven");
                }
            }
        }
        else if (hasExplicitYnngInstruction && !hasExplicitTfngInstruction)
        {
            foreach (var question in questions)
            {
                if (MapQuestionType(ReadJsonAsText(question.QuestionType)) == "TFNG")
                {
                    question.QuestionType = JsonSerializer.SerializeToElement("YesNoNotGiven");
                }
            }
        }

        EnforceBinaryBlockConsistency(questions);
    }

    private static void EnforceBinaryBlockConsistency(List<GemmaQuestionPayload> questions)
    {
        var orderedQuestions = questions
            .Select((question, index) => new
            {
                Question = question,
                Index = index,
                ParsedNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber))
            })
            .OrderBy(item => item.ParsedNumber ?? int.MaxValue)
            .ThenBy(item => item.Index)
            .ToList();

        for (var i = 0; i < orderedQuestions.Count; i++)
        {
            var startType = MapQuestionType(ReadJsonAsText(orderedQuestions[i].Question.QuestionType));
            if (!IsBinaryQuestionType(startType))
            {
                continue;
            }

            var block = new List<(GemmaQuestionPayload Question, string Type, int? ParsedNumber)>
            {
                (orderedQuestions[i].Question, startType, orderedQuestions[i].ParsedNumber)
            };

            var j = i + 1;
            while (j < orderedQuestions.Count)
            {
                var nextType = MapQuestionType(ReadJsonAsText(orderedQuestions[j].Question.QuestionType));
                if (!IsBinaryQuestionType(nextType))
                {
                    break;
                }

                var previousNumber = block[^1].ParsedNumber;
                var nextNumber = orderedQuestions[j].ParsedNumber;
                if (previousNumber.HasValue &&
                    nextNumber.HasValue &&
                    nextNumber.Value > previousNumber.Value + 1)
                {
                    break;
                }

                block.Add((orderedQuestions[j].Question, nextType, nextNumber));
                j++;
            }

            if (block.Count >= 2)
            {
                var tfngCount = block.Count(entry => entry.Type == "TFNG");
                var ynngCount = block.Count(entry => entry.Type == "YNNG");

                if (tfngCount > 0 && ynngCount > 0)
                {
                    var preferredType = tfngCount >= ynngCount
                        ? "TrueFalseNotGiven"
                        : "YesNoNotGiven";

                    foreach (var entry in block)
                    {
                        entry.Question.QuestionType = JsonSerializer.SerializeToElement(preferredType);
                    }
                }
            }

            i = Math.Max(i, j - 1);
        }
    }

    private static bool IsBinaryQuestionType(string mappedType) =>
        mappedType is "TFNG" or "YNNG";

    private static string DetectQuestionType(
        string questionText,
        List<string> options,
        string? currentType,
        string? answerText)
    {
        var normalizedCurrentType = NormalizeQuestionTypeToken(currentType);

        if (MatchingInfoInstructionRegex().IsMatch(questionText))
        {
            return "MatchingInfo";
        }

        if (ContainsMcqMultipleInstruction(questionText))
        {
            return "McqMultiple";
        }

        if (ContainsMcqSingleInstruction(questionText))
        {
            return "McqSingle";
        }

        if (ContainsTfngInstruction(questionText))
        {
            return "TrueFalseNotGiven";
        }

        if (ContainsYnngInstruction(questionText))
        {
            return "YesNoNotGiven";
        }

        if (TryInferQuestionTypeFromAnswer(answerText, out var inferredTypeFromAnswer))
        {
            return inferredTypeFromAnswer;
        }

        if (HasMultipleLetterAnswerTokens(answerText))
        {
            return "McqMultiple";
        }

        if (normalizedCurrentType is "MCQCHOOSEN" or "MULTIPLECHOICECHOOSEN")
        {
            return "McqChooseN";
        }

        if (normalizedCurrentType is "MCQMULTIPLE" or "MULTIPLECHOICEMULTIPLE")
        {
            return "McqMultiple";
        }

        if (normalizedCurrentType is "MATCHINGINFO" or "MATCHINGINFORMATION")
        {
            return "MatchingInfo";
        }

        if (normalizedCurrentType == "MATCHINGHEADINGS")
        {
            return "MatchingHeadings";
        }

        // Dạng Matching Headings thường có instruction kiểu:
        // "The text has 7 paragraphs (A-G)" hoặc câu hỏi "Paragraph A/B/C..."
        if (MatchingHeadingsInstructionRegex().IsMatch(questionText))
        {
            return "MatchingHeadings";
        }

        // Dạng choose N statements:
        // "FIVE of the following statements are true ... in any order"
        if (ChooseNStatementsInstructionRegex().IsMatch(questionText))
        {
            return "McqChooseN";
        }

        // Trường hợp model bóp méo choose-N thành từng question statement:
        // nếu question text trùng với một option và đáp án là 1 letter A-H.
        if (IsLikelyChooseNStatementRow(questionText, options, answerText))
        {
            return "McqChooseN";
        }

        if (normalizedCurrentType == "MATCHINGFEATURES")
        {
            return "MatchingFeatures";
        }

        if (MatchingInstructionRegex().IsMatch(questionText) ||
            IsLetterLabelOptionSet(options))
        {
            return "MatchingInfo";
        }

        if (FillInBlankInstructionRegex().IsMatch(questionText))
        {
            return "FillInBlanks";
        }

        if (options.Count == 0)
        {
            return string.IsNullOrWhiteSpace(currentType) ? "FillInBlanks" : currentType;
        }

        return string.IsNullOrWhiteSpace(currentType) ? "MultipleChoice" : currentType;
    }

    private static bool ContainsMcqSingleInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        return ChooseCorrectAnswerOrAnswersRegex().IsMatch(questionText) &&
               !ContainsMcqMultipleInstruction(questionText);
    }

    private static bool ContainsMcqMultipleInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        return ChooseCorrectAnswersOnlyRegex().IsMatch(questionText);
    }

    private static bool ContainsTfngInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var tokens = ExtractUpperTokens(questionText);
        return tokens.Contains("TRUE") &&
               tokens.Contains("FALSE") &&
               tokens.Contains("NOT") &&
               tokens.Contains("GIVEN");
    }

    private static bool ContainsYnngInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var tokens = ExtractUpperTokens(questionText);
        return tokens.Contains("YES") &&
               tokens.Contains("NO") &&
               tokens.Contains("NOT") &&
               tokens.Contains("GIVEN");
    }

    private static HashSet<string> ExtractUpperTokens(string text) =>
        Regex.Matches(text.ToUpperInvariant(), @"[A-Z]+")
            .Select(match => match.Value)
            .ToHashSet(StringComparer.Ordinal);

    private static bool IsLikelyChooseNStatementRow(
        string questionText,
        List<string> options,
        string? answerText)
    {
        if (options.Count < 5 || !HasSingleLetterAnswer(answerText))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var normalizedQuestionText = NormalizeToken(questionText);
        return options.Any(option => NormalizeToken(option) == normalizedQuestionText);
    }

    private static string NormalizeQuestionTypeToken(string? rawQuestionType) =>
        Regex.Replace(rawQuestionType ?? string.Empty, @"[^a-zA-Z0-9]", string.Empty)
            .Trim()
            .ToUpperInvariant();

    private static bool HasSingleLetterAnswer(string? answerText)
    {
        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }

        return SingleLetterAnswerRegex().IsMatch(answerText.Trim());
    }

    private static bool HasMultipleLetterAnswerTokens(string? answerText)
    {
        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }

        var tokens = SplitAnswerTokens(answerText)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .ToList();
        if (tokens.Count < 2)
        {
            return false;
        }

        return tokens.All(IsSingleLetterAnswerToken);
    }

    private static bool IsLetterLabelOptionSet(List<string> options)
    {
        if (options.Count < 5)
        {
            return false;
        }

        var labeledCount = options.Count(option => OptionStartsWithLetterLabelRegex().IsMatch(option));
        return labeledCount >= Math.Min(options.Count, 5);
    }

    private static bool IsLetterChoiceOptionSet(List<string> options)
    {
        if (options.Count < 5)
        {
            return false;
        }

        var distinctLetters = new HashSet<char>();
        foreach (var option in options)
        {
            var normalized = option.Trim().Trim('.', ')', ':').ToUpperInvariant();
            if (normalized.Length != 1 || normalized[0] is < 'A' or > 'H')
            {
                return false;
            }

            distinctLetters.Add(normalized[0]);
        }

        return distinctLetters.Count >= 5;
    }

    private static JsonElement NormalizeOptionArray(JsonElement optionsElement)
    {
        var options = ExtractOptions(optionsElement);
        if (options.Count == 0)
        {
            return optionsElement;
        }

        var labeledOptions = options
            .Select(option =>
            {
                var match = OptionStartsWithLetterLabelRegex().Match(option);
                return new
                {
                    Raw = option,
                    HasLabel = match.Success,
                    Label = match.Success ? match.Groups["label"].Value[0] : '\0',
                    Text = match.Success ? match.Groups["text"].Value.Trim() : option.Trim()
                };
            })
            .ToList();

        if (labeledOptions.Count(x => x.HasLabel) < 2)
        {
            return optionsElement;
        }

        var normalizedOptions = labeledOptions
            .OrderBy(x => x.HasLabel ? x.Label : '{')
            .ThenBy(x => x.Raw, StringComparer.Ordinal)
            .Select(x => x.Text)
            .ToList();

        return JsonSerializer.SerializeToElement(normalizedOptions);
    }

    private static string BuildTextPreview(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return "[empty]";
        }

        var normalized = Regex.Replace(rawText, @"\s+", " ").Trim();
        return normalized.Length <= 500
            ? normalized
            : normalized[..500] + "...";
    }

    private async Task PublishProgressAsync(
        Guid uploadId,
        Guid uploadedBy,
        string status,
        int progressPercent,
        string stage,
        string message,
        int? passageNumber = null,
        int? totalPassages = null,
        Guid? examId = null,
        string? clientRequestId = null,
        CancellationToken cancellationToken = default)
    {
        var progressSnapshot = new PdfGenerationProgressStatusDto(
            UploadId: uploadId,
            UploadedBy: uploadedBy,
            Status: status,
            ProgressPercent: Math.Clamp(progressPercent, 0, 100),
            Stage: stage,
            Message: message,
            PassageNumber: passageNumber,
            TotalPassages: totalPassages,
            ExamId: examId,
            ClientRequestId: string.IsNullOrWhiteSpace(clientRequestId) ? null : clientRequestId.Trim(),
            UpdatedAtUtc: DateTime.UtcNow);

        pdfGenerationProgressTracker.Upsert(progressSnapshot);

        var payload = new PdfGenerationProgressPayload(
            UploadId: progressSnapshot.UploadId,
            UploadedBy: progressSnapshot.UploadedBy,
            Status: progressSnapshot.Status,
            ProgressPercent: progressSnapshot.ProgressPercent,
            Stage: progressSnapshot.Stage,
            Message: progressSnapshot.Message,
            PassageNumber: progressSnapshot.PassageNumber,
            TotalPassages: progressSnapshot.TotalPassages,
            ExamId: progressSnapshot.ExamId,
            ClientRequestId: progressSnapshot.ClientRequestId);

        try
        {
            await realtimeEventPublisher.PublishAsync(
                PdfGenerationProgressEventType,
                payload,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Failed to publish realtime PDF generation progress for upload {UploadId}", uploadId);
        }
    }

    private async Task<GemmaPassagePayload> ExtractPassageWithAdaptiveSegmentationAsync(
        string preparedPassageText,
        int passageNumber,
        int totalPassages,
        Func<int, int, int, int, Task>? onInvalidJson,
        Func<int, int, TimeSpan, string, int, int, Task>? onApiRetry,
        CancellationToken cancellationToken)
    {
        var segments = BuildPassageQuestionSegments(preparedPassageText, passageNumber);
        if (segments.Count <= 1)
        {
            var singlePassageInput = preparedPassageText.Length > MaxPassageInputCharacters
                ? preparedPassageText[..MaxPassageInputCharacters].TrimEnd()
                : preparedPassageText;

            if (singlePassageInput.Length < preparedPassageText.Length)
            {
                logger.LogInformation(
                    "Passage {PassageNumber}/{TotalPassages} was trimmed before Gemma call: {OriginalLength} -> {PreparedLength}",
                    passageNumber,
                    totalPassages,
                    preparedPassageText.Length,
                    singlePassageInput.Length);
            }

            return await ExtractPassageWithRetryAsync(
                singlePassageInput,
                passageNumber,
                totalPassages,
                onInvalidJson: onInvalidJson is null
                    ? null
                    : (attempt, maxAttempts, _) => onInvalidJson(attempt, maxAttempts, 1, 1),
                onApiRetry: onApiRetry is null
                    ? null
                    : (attempt, maxAttempts, retryDelay, reason) => onApiRetry(attempt, maxAttempts, retryDelay, reason, 1, 1),
                cancellationToken: cancellationToken);
        }

        logger.LogInformation(
            "Passage {PassageNumber}/{TotalPassages} was split into {SegmentCount} segment(s) for Gemma extraction.",
            passageNumber,
            totalPassages,
            segments.Count);

        var segmentPayloads = new List<GemmaPassagePayload>(segments.Count);
        for (var segmentIndex = 0; segmentIndex < segments.Count; segmentIndex++)
        {
            var segment = segments[segmentIndex];
            var segmentPayload = await ExtractPassageWithRetryAsync(
                segment.Text,
                passageNumber,
                totalPassages,
                onInvalidJson: onInvalidJson is null
                    ? null
                    : (attempt, maxAttempts, _) => onInvalidJson(attempt, maxAttempts, segmentIndex + 1, segments.Count),
                onApiRetry: onApiRetry is null
                    ? null
                    : (attempt, maxAttempts, retryDelay, reason) => onApiRetry(attempt, maxAttempts, retryDelay, reason, segmentIndex + 1, segments.Count),
                cancellationToken: cancellationToken);

            segmentPayloads.Add(segmentPayload);

            if (segmentIndex < segments.Count - 1)
            {
                await Task.Delay(SegmentDelayBetweenCallsMs, cancellationToken);
            }
        }

        return MergeSegmentedPassagePayload(segmentPayloads, preparedPassageText, passageNumber);
    }

    private List<PassageQuestionSegment> BuildPassageQuestionSegments(string preparedPassageText, int passageNumber)
    {
        if (string.IsNullOrWhiteSpace(preparedPassageText) || preparedPassageText.Length <= MaxSegmentInputCharacters)
        {
            return [];
        }

        var headingMatches = QuestionRangeBoundaryRegex()
            .Matches(preparedPassageText)
            .Cast<Match>()
            .Select(match => new
            {
                Match = match,
                StartQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion = ParseOcrQuestionNumber(match.Groups["end"].Value)
            })
            .Where(item => item.StartQuestion > 0 &&
                           item.EndQuestion >= item.StartQuestion &&
                           item.Match.Index >= 0)
            .OrderBy(item => item.Match.Index)
            .ToList();

        if (headingMatches.Count < 2)
        {
            return [];
        }

        var rawContext = preparedPassageText[..headingMatches[0].Match.Index].Trim();
        var sharedContext = rawContext.Length > MaxSegmentSharedPassageContextCharacters
            ? rawContext[..MaxSegmentSharedPassageContextCharacters].TrimEnd()
            : rawContext;

        var result = new List<PassageQuestionSegment>(headingMatches.Count);
        for (var i = 0; i < headingMatches.Count; i++)
        {
            var blockStart = headingMatches[i].Match.Index;
            var blockEnd = i == headingMatches.Count - 1
                ? preparedPassageText.Length
                : headingMatches[i + 1].Match.Index;
            if (blockEnd <= blockStart)
            {
                continue;
            }

            var block = preparedPassageText[blockStart..blockEnd].Trim();
            if (string.IsNullOrWhiteSpace(block))
            {
                continue;
            }

            var candidateText = string.IsNullOrWhiteSpace(sharedContext)
                ? block
                : $"{sharedContext}\n\n{block}";

            if (candidateText.Length > MaxSegmentInputCharacters)
            {
                var contextLength = string.IsNullOrWhiteSpace(sharedContext) ? 0 : sharedContext.Length + 2;
                var maxBlockLength = Math.Max(1200, MaxSegmentInputCharacters - contextLength);
                var clippedBlock = block.Length > maxBlockLength
                    ? block[..maxBlockLength].TrimEnd()
                    : block;

                candidateText = string.IsNullOrWhiteSpace(sharedContext)
                    ? clippedBlock
                    : $"{sharedContext}\n\n{clippedBlock}";

                if (candidateText.Length > MaxSegmentInputCharacters)
                {
                    candidateText = candidateText[..MaxSegmentInputCharacters].TrimEnd();
                }
            }

            if (candidateText.Length < 200)
            {
                continue;
            }

            result.Add(new PassageQuestionSegment(
                SegmentIndex: i + 1,
                SegmentCount: headingMatches.Count,
                StartQuestion: headingMatches[i].StartQuestion,
                EndQuestion: headingMatches[i].EndQuestion,
                Text: candidateText));
        }

        if (result.Count < 2 && passageNumber >= 3)
        {
            logger.LogWarning(
                "Passage {PassageNumber} appears long but could not be split into reliable question segments. Falling back to single-call extraction.",
                passageNumber);
        }

        return result.Count >= 2 ? result : [];
    }

    private static GemmaPassagePayload MergeSegmentedPassagePayload(
        IReadOnlyList<GemmaPassagePayload> segmentPayloads,
        string preparedPassageText,
        int passageNumber)
    {
        if (segmentPayloads.Count == 0)
        {
            return new GemmaPassagePayload
            {
                PassageTitle = $"Reading Passage {passageNumber}",
                PassageContent = preparedPassageText,
                Questions = []
            };
        }

        var passageTitle = segmentPayloads
            .Select(payload => payload.PassageTitle?.Trim())
            .FirstOrDefault(title => !string.IsNullOrWhiteSpace(title))
            ?? $"Reading Passage {passageNumber}";

        var passageContent = segmentPayloads
            .Select(payload => payload.PassageContent)
            .Where(content => !string.IsNullOrWhiteSpace(content))
            .OrderByDescending(content => content!.Length)
            .FirstOrDefault();

        if (string.IsNullOrWhiteSpace(passageContent))
        {
            passageContent = preparedPassageText;
        }

        var questionsByNumber = new Dictionary<int, GemmaQuestionPayload>();
        var questionsWithoutNumber = new List<GemmaQuestionPayload>();

        foreach (var payload in segmentPayloads)
        {
            foreach (var question in payload.Questions ?? [])
            {
                var parsedNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                if (!parsedNumber.HasValue || parsedNumber.Value <= 0)
                {
                    questionsWithoutNumber.Add(question);
                    continue;
                }

                if (!questionsByNumber.TryGetValue(parsedNumber.Value, out var existingQuestion))
                {
                    questionsByNumber[parsedNumber.Value] = question;
                    continue;
                }

                var existingScore = ScoreQuestionCompleteness(existingQuestion);
                var incomingScore = ScoreQuestionCompleteness(question);
                if (incomingScore > existingScore)
                {
                    questionsByNumber[parsedNumber.Value] = question;
                }
            }
        }

        var mergedQuestions = questionsByNumber
            .OrderBy(pair => pair.Key)
            .Select(pair => pair.Value)
            .ToList();
        mergedQuestions.AddRange(questionsWithoutNumber);

        return new GemmaPassagePayload
        {
            PassageTitle = passageTitle,
            PassageContent = passageContent,
            Questions = mergedQuestions
        };
    }

    private static int ScoreQuestionCompleteness(GemmaQuestionPayload question)
    {
        var score = 0;

        var questionText = ReadJsonAsText(question.QuestionText);
        if (!string.IsNullOrWhiteSpace(questionText))
        {
            score += 2;
        }

        var options = ExtractOptions(question.Options);
        score += options.Count(option => !IsOptionLabelOnly(option));

        if (!string.IsNullOrWhiteSpace(ReadJsonAsText(question.Answer)))
        {
            score++;
        }

        return score;
    }

    private async Task<GemmaPassagePayload> ExtractPassageWithRetryAsync(
        string passageText,
        int passageNumber,
        int totalPassages,
        Func<int, int, string, Task>? onInvalidJson,
        Func<int, int, TimeSpan, string, Task>? onApiRetry,
        CancellationToken cancellationToken)
    {
        var totalAttempts = MaxJsonParseRetries + 1;

        for (var attempt = 1; attempt <= totalAttempts; attempt++)
        {
            string rawResponse;
            try
            {
                rawResponse = await RequestGemmaPassageAsync(passageText, cancellationToken);
            }
            catch (Exception ex) when (TryResolveApiRetryDelay(ex, out var retryDelay, out var retryReason))
            {
                logger.LogWarning(
                    ex,
                    "Gemma API transient failure for passage {PassageNumber}/{TotalPassages} at attempt {Attempt}/{MaxAttempts}. Retry in {RetryDelaySeconds}s. Reason: {Reason}",
                    passageNumber,
                    totalPassages,
                    attempt,
                    totalAttempts,
                    Math.Ceiling(retryDelay.TotalSeconds),
                    retryReason);

                if (onApiRetry is not null)
                {
                    await onApiRetry(attempt, totalAttempts, retryDelay, retryReason);
                }

                if (attempt == totalAttempts)
                {
                    throw;
                }

                await Task.Delay(retryDelay, cancellationToken);
                continue;
            }

            if (TryDeserializePassage(rawResponse, out var payload, out var parseError))
            {
                return payload;
            }

            logger.LogWarning(
                "Gemma returned invalid JSON for passage {PassageNumber}/{TotalPassages} at attempt {Attempt}/{MaxAttempts}: {Error}",
                passageNumber,
                totalPassages,
                attempt,
                totalAttempts,
                parseError);

            if (onInvalidJson is not null)
            {
                await onInvalidJson(attempt, totalAttempts, parseError);
            }
        }

        throw new InvalidOperationException(
            $"Unable to parse Gemma response into JSON for passage {passageNumber} after {totalAttempts} attempts.");
    }

    private static bool TryResolveApiRetryDelay(Exception exception, out TimeSpan retryDelay, out string reason)
    {
        retryDelay = TimeSpan.Zero;
        reason = string.Empty;

        if (exception is not InvalidOperationException invalidOperationException)
        {
            return false;
        }

        var message = invalidOperationException.Message;
        if (message.Contains("status 429", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("\"status\": \"RESOURCE_EXHAUSTED\"", StringComparison.OrdinalIgnoreCase))
        {
            reason = "Vượt quota token/phút của Gemma";
            retryDelay = TryExtractRetryDelayFromMessage(message, out var parsedDelay)
                ? parsedDelay
                : TimeSpan.FromMilliseconds(ApiRateLimitFallbackDelayMs);
            return true;
        }

        if (message.Contains("status 500", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("status 502", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("status 503", StringComparison.OrdinalIgnoreCase))
        {
            reason = "Lỗi tạm thời từ Gemma API";
            retryDelay = TimeSpan.FromMilliseconds(ApiTransientErrorFallbackDelayMs);
            return true;
        }

        return false;
    }

    private static bool TryExtractRetryDelayFromMessage(string message, out TimeSpan retryDelay)
    {
        retryDelay = TimeSpan.Zero;

        var retryInMatch = RetryInSecondsRegex().Match(message);
        if (retryInMatch.Success &&
            double.TryParse(retryInMatch.Groups["seconds"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var retryInSeconds))
        {
            retryDelay = TimeSpan.FromSeconds(Math.Clamp(retryInSeconds + 0.5d, 1d, 90d));
            return true;
        }

        var retryDelayMatch = RetryDelaySecondsRegex().Match(message);
        if (retryDelayMatch.Success &&
            double.TryParse(retryDelayMatch.Groups["seconds"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var retryDelaySeconds))
        {
            retryDelay = TimeSpan.FromSeconds(Math.Clamp(retryDelaySeconds + 0.5d, 1d, 90d));
            return true;
        }

        return false;
    }

    private Task<string> RequestGemmaPassageAsync(string passageText, CancellationToken cancellationToken) =>
        RequestGemmaCompletionAsync(BuildGemmaCompatiblePrompt(passageText), cancellationToken);

    private async Task<string> RequestGemmaCompletionAsync(string prompt, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_gemmaApiKey))
        {
            throw new InvalidOperationException("GemmaExamGeneration:ApiKey is missing.");
        }

        if (httpClient.BaseAddress is null)
        {
            httpClient.BaseAddress = new Uri(
                configuration["GemmaExamGeneration:BaseUrl"] ?? DefaultGemmaBaseUrl,
                UriKind.Absolute);
        }

        var requestPayload = new OpenAiChatCompletionRequest(
            Model: _gemmaModel,
            Messages:
            [
                new OpenAiChatMessage("user", prompt)
            ],
            Temperature: _gemmaTemperature);

        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _gemmaApiKey);
        request.Content = JsonContent.Create(requestPayload, options: JsonOptions);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Gemma API request failed with status {(int)response.StatusCode}: {errorBody}");
        }

        var completion = await response.Content.ReadFromJsonAsync<OpenAiChatCompletionResponse>(JsonOptions, cancellationToken);
        var content = completion?.Choices?.FirstOrDefault()?.Message?.Content;

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Gemma API returned an empty completion.");
        }

        return content;
    }

    private static bool TryDeserializePassage(
        string rawResponse,
        out GemmaPassagePayload payload,
        out string error)
    {
        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            var parsed = TryDeserializePassageFromCandidates(normalizedJson, out var parseError);
            if (parsed is null)
            {
                throw new JsonException(parseError ?? "Deserialized payload is null.");
            }

            if (string.IsNullOrWhiteSpace(parsed.PassageContent))
            {
                throw new JsonException("`passage_content` is missing.");
            }

            parsed.Questions ??= [];
            payload = parsed;
            error = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            payload = new GemmaPassagePayload();
            error = ex.Message;
            return false;
        }
    }

    private static GemmaPassagePayload? TryDeserializePassageFromCandidates(string normalizedJson, out string? parseError)
    {
        parseError = null;

        foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
        {
            if (TryDeserializeCandidateWithAutoFix(candidate, out var parsed, out parseError) && parsed is not null)
            {
                return parsed;
            }
        }

        return null;
    }

    private static bool TryDeserializeCandidateWithAutoFix(
        string candidateJson,
        out GemmaPassagePayload? payload,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                payload = JsonSerializer.Deserialize<GemmaPassagePayload>(workingJson, JsonOptions);
                if (payload is not null)
                {
                    return true;
                }

                parseError = "Deserialized payload is null.";
                break;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        payload = null;
        return false;
    }

    private static bool TryPatchJsonAtError(
        string json,
        JsonException jsonException,
        out string patchedJson)
    {
        patchedJson = json;
        var errorIndex = ResolveJsonErrorIndex(json, jsonException);
        if (errorIndex < 0 || errorIndex >= json.Length)
        {
            return false;
        }

        if (TryInsertMissingCommaAt(json, errorIndex, out patchedJson))
        {
            return true;
        }

        if (TryFixDuplicateCommaAt(json, errorIndex, out patchedJson))
        {
            return true;
        }

        if (TryRemoveUnexpectedTokenAfterValue(json, errorIndex, out patchedJson))
        {
            return true;
        }

        return false;
    }

    private static bool TryInsertMissingCommaAt(string json, int errorIndex, out string patchedJson)
    {
        patchedJson = json;

        var insertPosition = errorIndex;
        while (insertPosition > 0 && char.IsWhiteSpace(json[insertPosition - 1]))
        {
            insertPosition--;
        }

        if (insertPosition <= 0)
        {
            return false;
        }

        var previousChar = json[insertPosition - 1];
        if (previousChar is ',' or ':' or '{' or '[')
        {
            return false;
        }

        if (!LooksLikeJsonTokenStart(json[errorIndex]))
        {
            return false;
        }

        patchedJson = json[..insertPosition] + "," + json[insertPosition..];
        return true;
    }

    private static bool TryRemoveUnexpectedTokenAfterValue(string json, int errorIndex, out string patchedJson)
    {
        patchedJson = json;
        if (!char.IsLetter(json[errorIndex]))
        {
            return false;
        }

        var endIndex = errorIndex;
        while (endIndex < json.Length && json[endIndex] is not ',' and not '}' and not ']' and not '\n' and not '\r')
        {
            endIndex++;
        }

        if (endIndex <= errorIndex)
        {
            return false;
        }

        patchedJson = json[..errorIndex] + json[endIndex..];
        return true;
    }

    private static bool TryFixDuplicateCommaAt(string json, int errorIndex, out string patchedJson)
    {
        patchedJson = json;
        if (json[errorIndex] != ',')
        {
            return false;
        }

        var previousIndex = errorIndex - 1;
        while (previousIndex >= 0 && char.IsWhiteSpace(json[previousIndex]))
        {
            previousIndex--;
        }

        var nextIndex = errorIndex + 1;
        while (nextIndex < json.Length && char.IsWhiteSpace(json[nextIndex]))
        {
            nextIndex++;
        }

        if (previousIndex >= 0 && json[previousIndex] == ',')
        {
            patchedJson = json[..errorIndex] + json[(errorIndex + 1)..];
            return true;
        }

        if (nextIndex < json.Length && json[nextIndex] == ',')
        {
            patchedJson = json[..nextIndex] + json[(nextIndex + 1)..];
            return true;
        }

        return false;
    }

    private static bool LooksLikeJsonTokenStart(char value) =>
        value == '"' || value == '\'' || value == '{' || value == '[' || value == '-' || char.IsDigit(value) || char.IsLetter(value);

    private static int ResolveJsonErrorIndex(string json, JsonException jsonException)
    {
        if (string.IsNullOrEmpty(json))
        {
            return -1;
        }

        if (!jsonException.LineNumber.HasValue || !jsonException.BytePositionInLine.HasValue)
        {
            return -1;
        }

        var lineNumber = (int)Math.Max(0, jsonException.LineNumber.Value);
        var bytePositionInLine = (int)Math.Max(0, jsonException.BytePositionInLine.Value);

        var lineStart = 0;
        for (var line = 0; line < lineNumber; line++)
        {
            var newlineIndex = json.IndexOf('\n', lineStart);
            if (newlineIndex < 0)
            {
                return -1;
            }

            lineStart = newlineIndex + 1;
        }

        return Math.Clamp(lineStart + bytePositionInLine, 0, json.Length - 1);
    }

    private static string BuildJsonParseErrorMessage(string json, JsonException jsonException)
    {
        var index = ResolveJsonErrorIndex(json, jsonException);
        if (index < 0)
        {
            return jsonException.Message;
        }

        var start = Math.Max(0, index - 80);
        var length = Math.Min(160, json.Length - start);
        var snippet = json.Substring(start, length).Replace("\r", " ").Replace("\n", " ");
        return $"{jsonException.Message} | Near: {snippet}";
    }

    private static IEnumerable<string> BuildJsonParseCandidates(string normalizedJson)
    {
        yield return normalizedJson;

        if (TryEscapePassageContentJsonString(normalizedJson, out var escapedPassageContent))
        {
            yield return escapedPassageContent;
        }

        var repairedOnce = RepairMalformedJson(normalizedJson);
        if (!string.Equals(repairedOnce, normalizedJson, StringComparison.Ordinal))
        {
            yield return repairedOnce;
        }

        if (TryEscapePassageContentJsonString(repairedOnce, out var escapedAfterRepair))
        {
            yield return escapedAfterRepair;
        }

        var repairedTwice = RepairMalformedJson(repairedOnce);
        if (!string.Equals(repairedTwice, repairedOnce, StringComparison.Ordinal))
        {
            yield return repairedTwice;
        }

        if (TryEscapePassageContentJsonString(repairedTwice, out var escapedAfterSecondRepair))
        {
            yield return escapedAfterSecondRepair;
        }
    }

    private static bool TryEscapePassageContentJsonString(string json, out string escapedJson)
    {
        escapedJson = json;
        var startMatch = PassageContentStartRegex().Match(json);
        if (!startMatch.Success)
        {
            return false;
        }

        var contentStartIndex = startMatch.Index + startMatch.Length;
        var endMatch = PassageContentEndRegex().Match(json, contentStartIndex);
        if (!endMatch.Success || endMatch.Index <= contentStartIndex)
        {
            return false;
        }

        var rawContent = json[contentStartIndex..endMatch.Index];
        var escapedContent = EscapeJsonString(rawContent)
            .Replace("\r\n", "\n")
            .Replace("\r", "\n")
            .Replace("\n", "\\n");

        // Common malformed fragment from LLM output: ",," inside passage content.
        escapedContent = escapedContent.Replace("\\\",,\\\"", "\\\", ");

        if (string.Equals(rawContent, escapedContent, StringComparison.Ordinal))
        {
            return false;
        }

        escapedJson = json[..contentStartIndex] + escapedContent + json[endMatch.Index..];
        return true;
    }

    private static string RepairMalformedJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return json;
        }

        var repaired = json
            .Replace('\u201C', '"')
            .Replace('\u201D', '"')
            .Replace('\u2018', '\'')
            .Replace('\u2019', '\'');

        // Convert single-quoted keys: {'key': ...} -> {"key": ...}
        repaired = SingleQuotedPropertyRegex().Replace(repaired, "\"${key}\":");

        // Convert single-quoted string values: "answer": 'A' -> "answer": "A"
        repaired = SingleQuotedValueRegex().Replace(
            repaired,
            match => $": \"{EscapeJsonString(match.Groups["value"].Value)}\"");

        // Quote unquoted keys: {key: ...} -> {"key": ...}
        repaired = UnquotedPropertyRegex().Replace(repaired, "\"${key}\":");

        // Insert missing comma between JSON value and next property key.
        repaired = MissingCommaBeforePropertyRegex().Replace(repaired, "$1,$2");
        repaired = MissingCommaBeforeUnquotedPropertyRegex().Replace(repaired, "$1,$2");
        repaired = MissingCommaBeforeSingleQuotedPropertyRegex().Replace(repaired, "$1,$2");
        repaired = MissingCommaBeforeLiteralRegex().Replace(repaired, "$1,$2");

        // Normalize Python-style literals so JSON parser can consume them.
        repaired = PythonLiteralRegex().Replace(repaired, match =>
        {
            var literal = match.Groups["literal"].Value;
            var normalizedLiteral = literal switch
            {
                "True" => "true",
                "False" => "false",
                "None" => "null",
                _ => literal
            };

            return $"{match.Groups[1].Value}{normalizedLiteral}{match.Groups[3].Value}";
        });

        // Remove trailing commas before } or ].
        repaired = TrailingCommaRegex().Replace(repaired, "$1");

        return repaired;
    }

    private static string EscapeJsonString(string value) =>
        value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");

    private static string NormalizeJson(string rawResponse)
    {
        var cleaned = rawResponse.Trim();
        cleaned = JsonFenceRegex().Replace(cleaned, string.Empty).Trim();

        if (TryExtractFirstJsonObject(cleaned, out var extractedJson))
        {
            return extractedJson;
        }

        var firstCurly = cleaned.IndexOf('{');
        var lastCurly = cleaned.LastIndexOf('}');

        if (firstCurly >= 0 && lastCurly > firstCurly)
        {
            cleaned = cleaned[firstCurly..(lastCurly + 1)];
        }

        return cleaned;
    }

    private static bool TryExtractFirstJsonObject(string text, out string jsonObject)
    {
        jsonObject = string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var startIndex = -1;
        var depth = 0;
        var inString = false;
        var escaping = false;

        for (var i = 0; i < text.Length; i++)
        {
            var currentChar = text[i];

            if (inString)
            {
                if (escaping)
                {
                    escaping = false;
                    continue;
                }

                if (currentChar == '\\')
                {
                    escaping = true;
                    continue;
                }

                if (currentChar == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (currentChar == '"')
            {
                inString = true;
                continue;
            }

            if (currentChar == '{')
            {
                if (depth == 0)
                {
                    startIndex = i;
                }

                depth++;
                continue;
            }

            if (currentChar == '}' && depth > 0)
            {
                depth--;
                if (depth == 0 && startIndex >= 0)
                {
                    jsonObject = text[startIndex..(i + 1)];
                    return true;
                }
            }
        }

        return false;
    }

    private async Task<CreateExamDto> BuildCreateExamDtoAsync(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyList<string> rawPassages,
        IReadOnlyList<IReadOnlyList<PdfRawQuestionInstructionPreviewDto>>? reviewedQuestionGroupsByPassage,
        string fileName,
        CancellationToken cancellationToken)
    {
        var readingPassages = new List<CreateReadingPassageDto>(parsedPassages.Count);
        var runningQuestionNumber = 1;

        for (var i = 0; i < parsedPassages.Count; i++)
        {
            var rawPassageText = i < rawPassages.Count ? rawPassages[i] : string.Empty;
            var rawQuestionGroupOutlines = ExtractQuestionGroupOutlines(rawPassageText);
            var reviewedQuestionGroups =
                reviewedQuestionGroupsByPassage is not null &&
                i < reviewedQuestionGroupsByPassage.Count
                    ? reviewedQuestionGroupsByPassage[i]
                    : null;
            var (readingPassage, nextRunningQuestionNumber) = await BuildReadingPassageAsync(
                parsedPassages[i],
                rawPassageText,
                rawQuestionGroupOutlines,
                reviewedQuestionGroups,
                i + 1,
                runningQuestionNumber,
                cancellationToken);
            readingPassages.Add(readingPassage);
            runningQuestionNumber = nextRunningQuestionNumber;
        }

        var totalQuestions = runningQuestionNumber - 1;
        var titleWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
        var examTitle = string.IsNullOrWhiteSpace(titleWithoutExtension)
            ? $"Generated IELTS Reading {DateTime.UtcNow:yyyyMMddHHmmss}"
            : $"Generated IELTS Reading - {titleWithoutExtension.Trim()}";

        return new CreateExamDto(
            Title: examTitle,
            Description: $"Generated from PDF upload '{fileName}'.",
            DurationMinutes: 60,
            TotalPoints: totalQuestions,
            ExamType: "IELTS",
            IsPublished: false,
            Sections:
            [
                new CreateSectionDto(
                    SkillType: "Reading",
                    Title: "Reading Section",
                    OrderIndex: 0,
                    ReadingPassages: readingPassages,
                    ListeningParts: null,
                    WritingTasks: null,
                    SpeakingParts: null)
            ]);
    }

    private async Task<List<IReadOnlyList<PdfRawQuestionInstructionPreviewDto>>> BuildReviewedQuestionGroupPreviewsAsync(
        IReadOnlyList<string> rawPassages,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes,
        CancellationToken cancellationToken)
    {
        if (rawPassages.Count == 0)
        {
            return [];
        }

        var trace = new List<PdfRawReviewRequestTraceDto>();
        var reviewedQuestionGroupsByPassage = new List<IReadOnlyList<PdfRawQuestionInstructionPreviewDto>>(rawPassages.Count);

        for (var index = 0; index < rawPassages.Count; index++)
        {
            var rawPassageText = rawPassages[index];
            if (string.IsNullOrWhiteSpace(rawPassageText))
            {
                reviewedQuestionGroupsByPassage.Add([]);
                continue;
            }

            var passageSeed = BuildReviewPassageSeed(
                index + 1,
                rawPassageText,
                null,
                null);

            var reviewedQuestionGroups = await ReviewPassageQuestionGroupsAsync(
                passageSeed,
                trace,
                cancellationToken);

            reviewedQuestionGroupsByPassage.Add(AttachDiagramPreviewImages(
                reviewedQuestionGroups,
                pages,
                pdfBytes));

            if (index < rawPassages.Count - 1)
            {
                await Task.Delay(RawReviewDelayBetweenAiCallsMs, cancellationToken);
            }
        }

        return reviewedQuestionGroupsByPassage;
    }

    private static List<PdfRawQuestionInstructionPreviewDto> BuildQuestionGroupInstructionPreviews(
        IReadOnlyList<string> passages)
    {
        var previews = new List<PdfRawQuestionInstructionPreviewDto>();
        for (var index = 0; index < passages.Count; index++)
        {
            previews.AddRange(BuildQuestionGroupInstructionPreviews(index + 1, passages[index]));
        }

        return previews;
    }

    private static IEnumerable<PdfRawQuestionInstructionPreviewDto> BuildQuestionGroupInstructionPreviews(
        int passageNumber,
        string rawPassageText)
    {
        var outlines = ExtractQuestionGroupOutlines(rawPassageText);
        var reviewBlocks = BuildQuestionGroupReviewBlocks(rawPassageText, outlines);
        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);

        return outlines.Select(outline =>
        {
            reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
            var resolvedInstruction = ResolveQuestionGroupInstruction(
                outline.Instruction,
                block?.BlockText,
                rawPassageText,
                outline.StartQuestion,
                outline.EndQuestion);
            return new PdfRawQuestionInstructionPreviewDto(
                PassageNumber: passageNumber,
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                Tags: outline.Tags,
                GroupType: block?.HeuristicGroupType ?? outline.GroupType,
                Instruction: resolvedInstruction ?? string.Empty,
                QuestionPreview: block?.QuestionPreview,
                TypeEvidence: block?.TypeEvidence);
        });
    }

    private static IReadOnlyList<ReadingQuestionGroupOutline> ExtractQuestionGroupOutlines(string? rawPassageText)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return [];
        }

        var baseOutlines = ExtractRawQuestionGroupOutlines(rawPassageText);
        if (baseOutlines.Count == 0)
        {
            return baseOutlines;
        }

        var reviewBlocks = BuildQuestionGroupReviewBlocks(rawPassageText, baseOutlines);
        if (reviewBlocks.Count == 0)
        {
            return baseOutlines;
        }

        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);

        return baseOutlines.Select(outline =>
        {
            if (!reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block))
            {
                return outline;
            }

            return new ReadingQuestionGroupOutline(
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                BoundaryToken: outline.BoundaryToken,
                Tags: outline.Tags,
                Instruction: ResolveQuestionGroupInstruction(
                    outline.Instruction,
                    block.BlockText,
                    rawPassageText,
                    outline.StartQuestion,
                    outline.EndQuestion),
                GroupType: block.HeuristicGroupType ?? outline.GroupType);
        }).ToList();
    }

    private static IReadOnlyList<ReadingQuestionGroupOutline> ExtractRawQuestionGroupOutlines(string? rawPassageText) =>
        ReadingQuestionGroupOutlineParser.Extract(rawPassageText);

    private static PdfRawReviewStructureDto BuildDeterministicReviewStructure(
        IReadOnlyList<string> deterministicPassages,
        string answerZone,
        string reviewZone)
    {
        var passages = deterministicPassages.Count > 0
            ? deterministicPassages
                .Select((rawText, index) => BuildReviewPassageSeed(index + 1, rawText, null, null))
                .ToList()
            : [];

        return new PdfRawReviewStructureDto(
            Passages: passages,
            SolutionSectionRaw: answerZone,
            ReviewSectionRaw: reviewZone);
    }

    private static List<PdfRawReviewPassageSeedDto> NormalizeStructurePassages(
        List<RawReviewStructurePassage>? aiPassages,
        IReadOnlyList<string> deterministicPassages)
    {
        if (aiPassages is null || aiPassages.Count == 0)
        {
            return deterministicPassages
                .Select((rawText, index) => BuildReviewPassageSeed(index + 1, rawText, null, null))
                .ToList();
        }

        var ordered = aiPassages
            .Where(item => item.PassageNumber > 0)
            .OrderBy(item => item.PassageNumber)
            .GroupBy(item => item.PassageNumber)
            .Select(group => group.First())
            .ToList();

        var result = new List<PdfRawReviewPassageSeedDto>(ordered.Count);
        foreach (var item in ordered)
        {
            var deterministicRawText =
                item.PassageNumber - 1 >= 0 && item.PassageNumber - 1 < deterministicPassages.Count
                    ? deterministicPassages[item.PassageNumber - 1]
                    : string.Empty;
            var rawText = !string.IsNullOrWhiteSpace(deterministicRawText)
                ? deterministicRawText
                : string.IsNullOrWhiteSpace(item.RawText)
                    ? string.Empty
                    : CleanPassageChunk(StripTrailingAnswerAndExplanationBlock(item.RawText.Trim()));
            if (string.IsNullOrWhiteSpace(rawText))
            {
                continue;
            }

            result.Add(BuildReviewPassageSeed(
                item.PassageNumber,
                rawText,
                item.Title,
                item.QuestionRange));
        }

        return result.Count > 0
            ? result
            : deterministicPassages
                .Select((rawText, index) => BuildReviewPassageSeed(index + 1, rawText, null, null))
                .ToList();
    }

    private static PdfRawReviewPassageSeedDto BuildReviewPassageSeed(
        int passageNumber,
        string rawText,
        string? title,
        string? questionRange)
    {
        var normalizedRawText = rawText.Trim();
        var normalizedTitle = string.IsNullOrWhiteSpace(title)
            ? $"Reading Passage {passageNumber}"
            : title.Trim();
        var normalizedQuestionRange = string.IsNullOrWhiteSpace(questionRange)
            ? InferPassageQuestionRange(normalizedRawText)
            : questionRange.Trim();

        return new PdfRawReviewPassageSeedDto(
            PassageNumber: passageNumber,
            Title: normalizedTitle,
            QuestionRange: normalizedQuestionRange,
            RawText: normalizedRawText);
    }

    private static string InferPassageQuestionRange(string rawText)
    {
        var outlines = ReadingQuestionGroupOutlineParser.Extract(rawText);
        if (outlines.Count == 0)
        {
            return string.Empty;
        }

        var start = outlines.Min(item => item.StartQuestion);
        var end = outlines.Max(item => item.EndQuestion);
        return BuildQuestionRangeLabel(start, end);
    }

    private static string BuildQuestionRangeLabel(int startQuestion, int endQuestion) =>
        startQuestion == endQuestion
            ? $"Question {startQuestion}"
            : $"Questions {startQuestion}-{endQuestion}";

    private static List<QuestionGroupReviewContextBlock> BuildQuestionGroupReviewBlocks(
        string rawPassageText,
        IReadOnlyList<ReadingQuestionGroupOutline>? sourceOutlines = null)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return [];
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var outlines = (sourceOutlines ?? ExtractRawQuestionGroupOutlines(rawPassageText))
            .OrderBy(outline => outline.StartQuestion)
            .ThenBy(outline => outline.EndQuestion)
            .ToList();
        if (outlines.Count == 0)
        {
            return [];
        }

        var boundaryMarkers = QuestionRangeBoundaryRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Where(match => match.Success &&
                            match.Index >= 0 &&
                            TryParseBoundaryQuestions(match, out _, out _) &&
                            !IsIgnoredQuestionRangeHeading(normalized, match.Index))
            .Select(match =>
            {
                TryParseBoundaryQuestions(match, out var startQuestion, out var endQuestion);
                return (StartQuestion: startQuestion, EndQuestion: endQuestion, Index: match.Index, Length: match.Length);
            })
            .Concat(
                SingleQuestionBoundaryRegex()
                    .Matches(normalized)
                    .Cast<Match>()
                    .Where(match => match.Success &&
                                    match.Index >= 0 &&
                                    TryParseSingleBoundaryQuestion(match, out _) &&
                                    !IsIgnoredQuestionRangeHeading(normalized, match.Index))
                    .Select(match =>
                    {
                        TryParseSingleBoundaryQuestion(match, out var questionNumber);
                        return (StartQuestion: questionNumber, EndQuestion: questionNumber, Index: match.Index, Length: match.Length);
                    }))
            .OrderBy(marker => marker.Index)
            .GroupBy(marker => (marker.StartQuestion, marker.EndQuestion))
            .Select(group => group.First())
            .ToList();
        var contentBoundaryIndex = FindQuestionGroupContentBoundaryIndex(normalized);
        var result = new List<QuestionGroupReviewContextBlock>(outlines.Count);
        var minSearchIndex = 0;
        foreach (var outline in outlines)
        {
            var boundaryCandidates = boundaryMarkers
                .Where(marker =>
                    marker.Index >= minSearchIndex &&
                    marker.StartQuestion == outline.StartQuestion &&
                    marker.EndQuestion == outline.EndQuestion)
                .ToList();

            if (boundaryCandidates.Count == 0)
            {
                var fallbackInstruction = ResolveQuestionGroupInstruction(
                    outline.Instruction,
                    null,
                    rawPassageText,
                    outline.StartQuestion,
                    outline.EndQuestion);
                var (fallbackType, fallbackEvidence) = InferQuestionGroupTypeAndEvidence(
                    fallbackInstruction,
                    null,
                    null,
                    outline.GroupType,
                    outline.StartQuestion,
                    outline.EndQuestion);
                result.Add(new QuestionGroupReviewContextBlock(
                    StartQuestion: outline.StartQuestion,
                    EndQuestion: outline.EndQuestion,
                    Tags: outline.Tags,
                    Instruction: fallbackInstruction ?? string.Empty,
                    QuestionPreview: null,
                    BlockText: null,
                    HeuristicGroupType: fallbackType,
                    TypeEvidence: fallbackEvidence));
                continue;
            }

            var boundaryMarker = boundaryCandidates[0];

            minSearchIndex = boundaryMarker.Index + 1;
            var questionStartIndex = FindQuestionStartAfterIndex(normalized, outline.StartQuestion, boundaryMarker.Index + boundaryMarker.Length);
            var nextBoundaryIndex = boundaryMarkers
                .Where(marker => marker.Index > Math.Max(questionStartIndex, boundaryMarker.Index))
                .Select(marker => marker.Index)
                .DefaultIfEmpty(contentBoundaryIndex)
                .First();
            nextBoundaryIndex = Math.Min(nextBoundaryIndex, contentBoundaryIndex);
            if (nextBoundaryIndex <= boundaryMarker.Index)
            {
                nextBoundaryIndex = contentBoundaryIndex > boundaryMarker.Index
                    ? contentBoundaryIndex
                    : normalized.Length;
            }

            var blockText = normalized[boundaryMarker.Index..Math.Min(normalized.Length, nextBoundaryIndex)].Trim();
            var resolvedInstruction = ResolveQuestionGroupInstruction(
                outline.Instruction,
                blockText,
                rawPassageText,
                outline.StartQuestion,
                outline.EndQuestion);
            var questionPreview = BuildQuestionPreview(blockText, resolvedInstruction, outline.StartQuestion);
            var (heuristicType, typeEvidence) = InferQuestionGroupTypeAndEvidence(
                resolvedInstruction,
                questionPreview,
                blockText,
                outline.GroupType,
                outline.StartQuestion,
                outline.EndQuestion);

            result.Add(new QuestionGroupReviewContextBlock(
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                Tags: outline.Tags,
                Instruction: resolvedInstruction ?? string.Empty,
                QuestionPreview: questionPreview,
                BlockText: blockText,
                HeuristicGroupType: heuristicType,
                TypeEvidence: typeEvidence));
        }

        return result;
    }

    private static bool TryParseBoundaryQuestions(Match match, out int startQuestion, out int endQuestion)
    {
        startQuestion = -1;
        endQuestion = -1;
        if (match is null || !match.Success)
        {
            return false;
        }

        startQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value);
        endQuestion = ParseOcrQuestionNumber(match.Groups["end"].Value);
        return startQuestion is >= 1 and <= 40 &&
               endQuestion >= startQuestion &&
               endQuestion <= 40;
    }

    private static bool TryParseSingleBoundaryQuestion(Match match, out int questionNumber)
    {
        questionNumber = -1;
        if (match is null || !match.Success)
        {
            return false;
        }

        questionNumber = ParseOcrQuestionNumber(match.Groups["number"].Value);
        return questionNumber is >= 1 and <= 40;
    }

    private static bool IsIgnoredQuestionRangeHeading(string text, int index)
    {
        var line = ExtractLineAt(text, index);
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var normalizedLine = Regex.Replace(line, @"\s+", " ").Trim();
        return PassageQuestionIntroLineRegex().IsMatch(normalizedLine);
    }

    private static string ExtractLineAt(string text, int index)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        index = Math.Clamp(index, 0, text.Length - 1);
        var lineStart = text.LastIndexOf('\n', index);
        lineStart = lineStart < 0 ? 0 : lineStart + 1;
        var lineEnd = text.IndexOf('\n', index);
        lineEnd = lineEnd < 0 ? text.Length : lineEnd;
        return text[lineStart..lineEnd];
    }

    private static int FindQuestionStartAfterIndex(string text, int questionNumber, int startIndex)
    {
        if (string.IsNullOrWhiteSpace(text) || questionNumber <= 0)
        {
            return -1;
        }

        startIndex = Math.Clamp(startIndex, 0, text.Length);
        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var patterns = new[]
        {
            $@"(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
            $@"(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=[A-Za-z""'“‘(\[])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(text[startIndex..], pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, startIndex + match.Index);
            }
        }

        return bestIndex == int.MaxValue ? -1 : bestIndex;
    }

    private static string? BuildQuestionPreview(string? blockText, string? instruction, int startQuestion)
    {
        if (string.IsNullOrWhiteSpace(blockText))
        {
            return null;
        }

        var normalized = blockText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        if (!string.IsNullOrWhiteSpace(instruction))
        {
            var instructionIndex = normalized.IndexOf(instruction.Trim(), StringComparison.OrdinalIgnoreCase);
            if (instructionIndex >= 0)
            {
                var contentStart = instructionIndex + instruction.Trim().Length;
                if (contentStart < normalized.Length)
                {
                    normalized = normalized[contentStart..].TrimStart();
                }
            }
        }

        normalized = Regex.Replace(normalized, @"(?im)^\s*Questions?\s*\d{1,2}\s*(?:-|–|—|‑|−|to)\s*\d{1,2}\s*$", string.Empty);
        normalized = Regex.Replace(
            normalized,
            $@"^\s*Question\s*{Regex.Escape(startQuestion.ToString(CultureInfo.InvariantCulture))}\b\s*",
            string.Empty,
            RegexOptions.IgnoreCase);
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\s+https?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bhttps?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bfor\s+more\s+practices\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bpage\s*\d+\b", " ");
        normalized = Regex.Replace(normalized, @"(?im)^\s*Access\s*$", string.Empty);
        normalized = TrimLeadingQuestionPreviewArtifacts(normalized, startQuestion);
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n").Trim();
        normalized = TrimQuestionPreviewArtifacts(normalized);

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized.Length <= 1200
            ? normalized
            : normalized[..1200].TrimEnd();
    }

    private static string? ResolveQuestionPreview(string? aiQuestionPreview, string? blockQuestionPreview)
    {
        var normalizedBlockPreview = TrimQuestionPreviewArtifacts(blockQuestionPreview);
        if (!string.IsNullOrWhiteSpace(normalizedBlockPreview))
        {
            return normalizedBlockPreview;
        }

        var normalizedAiPreview = TrimQuestionPreviewArtifacts(aiQuestionPreview);
        return string.IsNullOrWhiteSpace(normalizedAiPreview)
            ? null
            : normalizedAiPreview;
    }

    private static string TrimLeadingQuestionPreviewArtifacts(string? value, int startQuestion)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var questionStartIndex = FindInstructionQuestionStartIndex(normalized, startQuestion);
        if (questionStartIndex <= 0)
        {
            return normalized;
        }

        var prefix = normalized[..questionStartIndex];
        if (!Regex.IsMatch(
                prefix,
                @"(?i)\bexample\b|\bhttps?://\S+\b|\bfor\s+more\s+practices\b|\bwrite\s*:\s*[A-H]\s*[-–]\b|\b[A-H]\s*[-–]\s*for\b"))
        {
            return normalized;
        }

        return normalized[questionStartIndex..].TrimStart();
    }

    private static string? ResolveQuestionGroupInstruction(
        string? instruction,
        string? blockText,
        string rawPassageText,
        int startQuestion,
        int endQuestion)
    {
        var normalizedInstruction = TrimTrailingInstructionArtifacts(instruction);
        var blockInstruction = TrimTrailingInstructionArtifacts(TryExtractInstructionFromBlockText(blockText, startQuestion));
        var passageInstruction = TrimTrailingInstructionArtifacts(TryExtractInstructionFromPassageText(rawPassageText, startQuestion, endQuestion));

        return SelectBestInstructionCandidate(normalizedInstruction, blockInstruction, passageInstruction);
    }

    private static string? SelectBestInstructionCandidate(params string?[] candidates)
    {
        var distinctCandidates = candidates
            .Select(TrimTrailingInstructionArtifacts)
            .Where(candidate => !string.IsNullOrWhiteSpace(candidate))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (distinctCandidates.Count == 0)
        {
            return null;
        }

        return distinctCandidates
            .OrderByDescending(ScoreInstructionCandidate)
            .ThenByDescending(candidate => candidate.Length)
            .First();
    }

    private static int ScoreInstructionCandidate(string candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return 0;
        }

        var normalized = Regex.Replace(candidate, @"\s+", " ").Trim();
        var score = 0;

        if (Regex.IsMatch(normalized, @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases\b"))
        {
            score += 80;
        }

        if (Regex.IsMatch(normalized, @"(?i)\banswer\s+the\s+following\s+questions\s+using\b|\busing\s+no\s+more\s+than\b|\bcomplete\s+the\s+following\s+sentences\s+using\b|\bchoose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\b"))
        {
            score += 45;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b"))
        {
            score += 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\baccording\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\b"))
        {
            score += 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\b"))
        {
            score += 30;
        }

        if (Regex.IsMatch(normalized, @"(?i)\buse\s+the\s+information\s+in\s+the\s+text\s+to\s+match\b"))
        {
            score += 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\blist\s+of\s+phrases\b|\blist\s+of\s+words\b|\bfrom\s+the\s+box\b"))
        {
            score += 40;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bwrite\s+the\s+correct\s+letter\b|\byou\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\b|\bthere\s+are\s+more\b"))
        {
            score += 25;
        }

        if (Regex.IsMatch(normalized, @"(?i)\btrue\b.*\bfalse\b.*\bnot\s+given\b|\byes\b.*\bno\b.*\bnot\s+given\b"))
        {
            score += 25;
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)[.?!]\s+(?!(?:Choose\s+your\s+answers?|Choose\s+the\s+correct|Write\b|Use\b|There\s+are\s+more|You\s+may\s+use\b|In\s+boxes?\b|On\s+your\s+answer\s+sheet\b|If\s+the\s+statement\b|If\s+it\s+is\s+impossible\b|Match\b|Complete\b|Look\b|Classify\b))[A-Z][A-Za-z]"))
        {
            score -= 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bcomplete\b|\bchoose\b|\bmatch\b|\blabel\b|\bclassify\b|\bwrite\b"))
        {
            score += 10;
        }

        if (normalized.Length > 220)
        {
            score -= 20;
        }

        if (Regex.Matches(normalized, @"(?<![A-Za-z0-9])\d{1,2}(?!\s*(?:-|–|—|‑|−|to)\s*\d)").Count >= 3)
        {
            score -= 20;
        }

        if (Regex.Matches(normalized, @"(?<![A-Za-z0-9])[A-H]\s+[A-Za-z(]").Count >= 3)
        {
            score -= 25;
        }

        return score;
    }

    private static string? TryExtractInstructionFromBlockText(string? blockText, int startQuestion)
    {
        if (string.IsNullOrWhiteSpace(blockText))
        {
            return null;
        }

        var normalized = blockText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\s+https?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bhttps?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bfor\s+more\s+practices\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bpage\s*\d+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\b(?=\s|$)", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        normalized = Regex.Replace(
            normalized,
            @"^(?:Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,2}\s*)+",
            string.Empty,
            RegexOptions.IgnoreCase)
            .Trim();
        normalized = Regex.Replace(
            normalized,
            $@"^\s*Question\s*{Regex.Escape(startQuestion.ToString(CultureInfo.InvariantCulture))}\b\s*",
            string.Empty,
            RegexOptions.IgnoreCase)
            .Trim();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var knownPatterns = new[]
        {
            @"^(?<instruction>Answer\s+the\s+following\s+questions\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\.?)",
            @"^(?<instruction>Using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\s*,?\s*complete\s+the\s+following\.?)",
            @"^(?<instruction>Choose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:timeline\s+)?diagram\s+below\.?\s+Write\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+each\s+(?:answer|gap)\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|description)\s+below\.?\s+Choose\s+your\s+answers?\s+from\s+the\s+box\s+below\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|description)\.?\s+Choose\s+your\s+answers?\s+from\s+the\s+box\s+below\.?)",
            @"^(?<instruction>Complete\s+the\s+summary\s+with\s+the\s+list\s+of\s+words\s*,?\s*[A-HI](?:\s*[-–]\s*[A-HI])?(?:\s+below)?\.?(?:\s+Write\s+the\s+correct\s+letter\s*,?\s*[A-HI](?:\s*[-–]\s*[A-HI])?\s*,?\s+in\s+(?:spaces|boxes)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+below\.?)?)",
            @"^(?<instruction>Complete\s+the\s+table\s+below\.?\s+Choose\s+\d+\s+answers?\s+from\s+the\s+box\s+and\s+write\s+the\s+correct\s+letter\s*,?\s*[A-L](?:\s*[-–]\s*[A-L])?\s*,?\s+next\s+to\s+questions?\s+\d{1,2}\s*(?:-|–|—|‑|−|to)\s*\d{1,2}\.?)",
            @"^(?<instruction>Complete\s+the\s+description\s+below\.?\s+Choose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^(?<instruction>Complete\s+the\s+following\s+sentences\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^(?<instruction>Complete\s+the\s+following\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^(?<instruction>Re-?order\s+the\s+following\s+letters?\s*\([A-H](?:\s*[-–]\s*[A-H])?\)\s+to\s+show\s+the\s+sequence\s+of\s+events(?:\s+according\s+to\s+the\s+passage)?\.?)",
            @"^(?<instruction>Do\s+the\s+following\s+statements?\s+agree\s+with\s+the\s+information\s+given\s+in\s+(?:the\s+(?:text|passage)|Reading\s+Passage\s+\d+)\?\s+For\s+questions?\s+\d{1,2}\s*(?:-|–|—|‑|−|to)\s*\d{1,2}\s*,?\s*write\s+TRUE.+?FALSE.+?NOT\s+GIVEN.+?)$",
            @"^(?<instruction>According\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\.?)",
            @"^(?<instruction>According\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\s+from\s+the\s+choices\s+given\.?)",
            @"^(?<instruction>For\s+each\s+question\s*,?\s*only\s+ONE\s+of\s+the\s+choices?\s+is\s+correct\.?\s+Write\s+the\s+corresponding\s+letter\s+in\s+the\s+appropriate\s+box(?:es)?\s+on\s+your\s+answer\s+sheet\.?)",
            @"^(?<instruction>(?:Choose|Circle)\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\.?)",
            @"^(?<instruction>(?:Choose|Circle)\s+the\s+correct\s+answer(?:\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?)?\.?)",
            @"^(?<instruction>Do\s+the\s+following\s+statements?.+?(?:TRUE.+?FALSE.+?NOT\s+GIVEN|YES.+?NO.+?NOT\s+GIVEN))(?=\s+\d{1,2}\s)",
            @"^(?<instruction>Look\s+at\s+the\s+following\s+statements?.+?Match\s+each\s+statement\s+to\s+the\s+correct\s+(?:person|people|researcher|researchers|country|countries|category|categories|group|groups|option|options)\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?\.?(?:\s+You\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\.?)?)",
            @"^(?<instruction>Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases\s+[A-H](?:\s*[-–]\s*[A-H])?\s+below\s+to\s+complete\s+each\s+of\s+the\s+following\s+sentences\.?(?:\s+There\s+are\s+more\s+phrases\s+than\s+questions\s+so\s+you\s+will\s+not\s+use\s+all\s+of\s+them\.?)?)",
            @"^(?<instruction>Which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following.+?\?\s*Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters?\s+[A-H](?:\s*[-–]\s*[A-H])?\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:table|summary|notes?|flow-?chart)(?:\s+(?:on|about|of)\s+[^.?!]{1,120})?\s+(?:using|with)\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\.?)",
            @"^(?<instruction>Complete\s+(?:each\s+sentence|each\s+of\s+the\s+following\s+sentences?|the\s+following\s+sentences?)\s+with\s+the\s+correct\s+ending\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?\s*,?\s+below\.?(?:\s+Write\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?\s*,?\s+in\s+the\s+spaces?\s+below\.?)?)",
            @"^(?<instruction>Complete\s+the\s+summary\s+(?:with|using)\s+the\s+list\s+of\s+words\s+[A-HI](?:\s*[-–]\s*[A-HI])?\s+below\.?(?:\s+Write\s+the\s+correct\s+letter\s+[A-HI](?:\s*[-–]\s*[A-HI])?\s+in\s+(?:spaces|boxes)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+below\.?)?)",
            @"^(?<instruction>Choose\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])\.?)",
            @"^(?<instruction>Choose\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*,\s*[A-H])*(?:\s+or\s+[A-H])?\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|sentences?)\s+below\.?(?:\s+Choose\s+[^.?!]+[.?!])?(?:\s+There\s+are\s+more[^.?!]+[.?!])?)",
            @"^(?<instruction>From\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\s+characteristic\s+of\s*:?)",
            @"^(?<instruction>Classify\s+the\s+following\s+as.+?)(?=\s+\d{1,2}\s)",
            @"^(?<instruction>Match\s+ONE\s+of\s+the\s+.+?\s+to\s+each\s+of\s+the\s+statements?.+?below\.?)",
            @"^(?<instruction>Use\s+the\s+information\s+in\s+the\s+text\s+to\s+match\s+.+?\s+with\s+.+?\b(?:listed\s+below|below)\.?)",
            @"^(?<instruction>Use\s+the\s+information\s+in\s+the\s+text\s+to\s+match\s+.+?\.)"
        };

        foreach (var pattern in knownPatterns)
        {
            var match = Regex.Match(normalized, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (match.Success)
            {
                var value = TrimTrailingInstructionArtifacts(match.Groups["instruction"].Value);
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }
        }

        var questionStartIndex = FindInstructionQuestionStartIndex(normalized, startQuestion);
        if (questionStartIndex <= 0)
        {
            return null;
        }

        var candidate = TrimTrailingInstructionArtifacts(normalized[..questionStartIndex]);
        return string.IsNullOrWhiteSpace(candidate) ? null : candidate;
    }

    private static int FindInstructionQuestionStartIndex(string text, int questionNumber)
    {
        if (string.IsNullOrWhiteSpace(text) || questionNumber <= 0)
        {
            return -1;
        }

        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var patterns = new[]
        {
            $@"^\s*(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
            $@"(?<=[\n\.\?!:;])\s*(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
            $@"(?<![A-Za-z0-9])(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=[A-Za-z""'“‘(\[])",
            $@"(?<![A-Za-z0-9])(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s+[A-Z""'“‘(\[])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, match.Index);
            }
        }

        return bestIndex == int.MaxValue ? -1 : bestIndex;
    }

    private static int FindQuestionGroupContentBoundaryIndex(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return 0;
        }

        var boundaryIndex = normalizedText.Length;

        var reviewMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        if (reviewMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, reviewMatch.Index);
        }

        var answerMatch = AnswerSectionHeadingRegex().Match(normalizedText);
        if (answerMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, answerMatch.Index);
        }

        var looseAnswerMatch = LooseAnswerSectionHeadingRegex().Match(normalizedText);
        if (looseAnswerMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, looseAnswerMatch.Index);
        }

        var inlineSolutionMatch = InlineSolutionHeadingRegex().Match(normalizedText);
        if (inlineSolutionMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, inlineSolutionMatch.Index);
        }

        return boundaryIndex;
    }

    private static string TrimTrailingInstructionArtifacts(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (Regex.IsMatch(
                value.Trim(),
                @"(?i)^\[\s*(?:instruction_not_found|unknown|null|n/?a)\s*\]$"))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var boundaryIndex = FindInstructionArtifactBoundaryIndex(normalized);
        if (boundaryIndex > 0)
        {
            normalized = normalized[..boundaryIndex].TrimEnd();
        }

        normalized = StripTrailingInstructionFooterNoise(normalized);
        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static string StripTrailingInstructionFooterNoise(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        while (true)
        {
            var previous = normalized;
            normalized = Regex.Replace(normalized, @"(?i)\s+Access\s+https?://\S+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+https?://\S+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+for\s+more\s+practices\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+page\s*\d+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+Access\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

            if (string.Equals(previous, normalized, StringComparison.Ordinal))
            {
                break;
            }
        }

        return normalized;
    }

    private static string TrimQuestionPreviewArtifacts(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var patterns = new[]
        {
            @"(?<boundary>(?<![A-Za-z])Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,3}\b)",
            @"(?i)(?<boundary>\s+Question\s+\d{1,2}\b)",
            @"(?i)(?<boundary>\bsolution\s*:)",
            @"(?i)(?<boundary>\breview\s+and\s+explanations?\b)",
            @"(?i)(?<boundary>\banswer\s*:)"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(normalized, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, match.Groups["boundary"].Index);
            }
        }

        if (bestIndex != int.MaxValue && bestIndex > 0)
        {
            normalized = normalized[..bestIndex].TrimEnd();
        }

        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static int FindInstructionArtifactBoundaryIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var patterns = new[]
        {
            @"(?im)(?<boundary>^\s*List\s+of\s+(?:words|phrases|headings|people|researchers|countries|categories|groups|options)\b.*$)",
            @"(?i)(?<boundary>\s+List\s+of\s+Words(?:/Phrases)?\b)",
            @"(?im)(?<boundary>^\s*Types?\s+of\s+[A-Za-z][A-Za-z\s]{0,40}\b.*$)",
            @"(?im)(?<boundary>^\s*Example\b.*$)",
            @"(?im)(?<boundary>^\s*Access\s+https?://\S+.*$)",
            @"(?im)(?<boundary>^\s*https?://\S+.*$)",
            @"(?<boundary>(?<![A-Za-z])Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,3}\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+List\s+of\s+(?:words|phrases|headings|people|researchers|countries|categories|groups|options)\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+Types?\s+of\s+[A-Za-z][A-Za-z\s]{0,40}\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+Example\b)",
            @"(?i)(?<boundary>\s+Example\b)",
            @"(?i)(?<boundary>\s+Access\s+https?://\S+)",
            @"(?i)(?<boundary>\s+https?://\S+)",
            @"(?i)(?<boundary>\s+Write\s*:\s*[A-H]\s*[-–])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(value, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (match.Success)
            {
                var boundaryIndex = match.Groups["boundary"].Index;
                if (ShouldIgnoreInstructionArtifactBoundary(value, boundaryIndex))
                {
                    continue;
                }

                bestIndex = Math.Min(bestIndex, boundaryIndex);
            }
        }

        var inlineAnswerBankBoundaryIndex = FindInlineSharedOptionBankBoundaryIndex(value);
        if (inlineAnswerBankBoundaryIndex > 0)
        {
            bestIndex = Math.Min(bestIndex, inlineAnswerBankBoundaryIndex);
        }

        return bestIndex == int.MaxValue
            ? -1
            : bestIndex;
    }

    private static bool ShouldIgnoreInstructionArtifactBoundary(string value, int boundaryIndex)
    {
        if (string.IsNullOrWhiteSpace(value) || boundaryIndex <= 0 || boundaryIndex > value.Length)
        {
            return false;
        }

        var prefix = Regex.Replace(value[..boundaryIndex], @"\s+", " ").TrimEnd();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return false;
        }

        return Regex.IsMatch(
            prefix,
            @"(?i)\b(?:with|using)\s+the$|\bfor$|\bnext\s+to$|\bin\s+(?:spaces?|boxes?)$|\banswer\s+boxes?$|\bquestion(?:s)?$");
    }

    private static int FindInlineSharedOptionBankBoundaryIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var matches = Regex.Matches(value, @"(?<![A-Za-z0-9])(?<label>[A-H])\s+(?=\S)")
            .Cast<Match>()
            .Where(match => match.Success)
            .ToList();
        if (matches.Count < 3)
        {
            return -1;
        }

        for (var index = 0; index <= matches.Count - 3; index++)
        {
            var firstMatch = matches[index];
            if (firstMatch.Index <= 0)
            {
                continue;
            }

            var prefix = value[..firstMatch.Index].TrimEnd();
            if (string.IsNullOrWhiteSpace(prefix) ||
                !Regex.IsMatch(prefix, @"(?i)(?:[.:;?]\s*$|\b(?:below|of|passage|answer|answers|characteristic\s+of)\s*$)"))
            {
                continue;
            }

            var distinctLabels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (var lookAhead = index; lookAhead < matches.Count && lookAhead < index + 6; lookAhead++)
            {
                distinctLabels.Add(matches[lookAhead].Groups["label"].Value);
            }

            if (distinctLabels.Count >= 3)
            {
                return firstMatch.Index;
            }
        }

        return -1;
    }

    private static string? TryExtractInstructionFromPassageText(
        string? rawPassageText,
        int startQuestion,
        int endQuestion)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return null;
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\s+https?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bhttps?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bfor\s+more\s+practices\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bpage\s*\d+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\b(?=\s|$)", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var escapedStart = Regex.Escape(startQuestion.ToString(CultureInfo.InvariantCulture));
        var escapedEnd = Regex.Escape(endQuestion.ToString(CultureInfo.InvariantCulture));
        var rangeMatch = Regex.Match(
            normalized,
            $@"Questions?\s*{escapedStart}\s*(?:-|–|—|‑|−|to)\s*{escapedEnd}\b",
            RegexOptions.IgnoreCase);

        if (rangeMatch.Success)
        {
            var tail = normalized[rangeMatch.Index..];
            var tailAfterHeading = tail[Math.Min(tail.Length, rangeMatch.Length)..];
            var firstQuestionIndex = FindInstructionQuestionStartIndex(tailAfterHeading, startQuestion);

            var snippet = firstQuestionIndex >= 0
                ? tail[..Math.Min(tail.Length, rangeMatch.Length + firstQuestionIndex)].Trim()
                : tail;

            snippet = Regex.Replace(
                snippet,
                $@"^\s*Questions?\s*{escapedStart}\s*(?:-|–|—|‑|−|to)\s*{escapedEnd}\b",
                string.Empty,
                RegexOptions.IgnoreCase).Trim();

            if (!string.IsNullOrWhiteSpace(snippet))
            {
                var extracted = TryExtractInstructionFromBlockText(snippet, startQuestion);
                if (!string.IsNullOrWhiteSpace(extracted))
                {
                    return extracted;
                }

                return TrimTrailingInstructionArtifacts(snippet);
            }
        }

        var questionStartIndex = FindInstructionQuestionStartIndex(normalized, startQuestion);
        if (questionStartIndex < 0)
        {
            return null;
        }

        var prefixStart = Math.Max(0, questionStartIndex - 500);
        var prefix = normalized[prefixStart..questionStartIndex].Trim();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return null;
        }

        return TryExtractInstructionFromBlockText(prefix, startQuestion) ?? TrimTrailingInstructionArtifacts(prefix);
    }

    private static (string? GroupType, string? TypeEvidence) InferQuestionGroupTypeAndEvidence(
        string? instruction,
        string? questionPreview,
        string? blockText,
        string? fallbackGroupType,
        int? startQuestion = null,
        int? endQuestion = null)
    {
        var normalizedInstruction = Regex.Replace(instruction ?? string.Empty, @"\s+", " ").Trim();
        var normalizedQuestionPreview = Regex.Replace(questionPreview ?? string.Empty, @"\s+", " ").Trim();
        var normalizedBlockText = Regex.Replace(blockText ?? string.Empty, @"\s+", " ").Trim();
        var combined = Regex.Replace(
            string.Join("\n", [normalizedInstruction, normalizedQuestionPreview, normalizedBlockText]),
            @"\s+",
            " ").Trim();
        if (string.IsNullOrWhiteSpace(combined))
        {
            return (NormalizeGroupType(fallbackGroupType), null);
        }

        var upper = combined.ToUpperInvariant();
        var instructionScope = string.Join(" ", [normalizedInstruction, normalizedQuestionPreview]).Trim();
        var instructionText = string.IsNullOrWhiteSpace(normalizedInstruction) ? combined : normalizedInstruction;
        var explicitQuestionCount =
            startQuestion.HasValue &&
            endQuestion.HasValue &&
            endQuestion.Value >= startQuestion.Value
                ? endQuestion.Value - startQuestion.Value + 1
                : 0;
        var hasMultipleQuestionsInGroup = explicitQuestionCount > 1;
        var visibleQuestionPromptCount = CountVisibleGroupQuestionPromptMarkers(
            string.IsNullOrWhiteSpace(normalizedQuestionPreview)
                ? normalizedBlockText
                : normalizedQuestionPreview,
            startQuestion,
            endQuestion);
        var hasExplicitPerQuestionPrompts = visibleQuestionPromptCount > 0;
        var inlineDistinctOptionLabels = Regex.Matches(
                instructionText,
                @"(?<![A-Za-z0-9])(?<label>[A-H])\s+(?=[A-Z(])",
                RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Select(match => match.Groups["label"].Value[0])
            .Distinct()
            .Count();
        var distinctOptionLabels = Regex.Matches(blockText ?? string.Empty, @"(?im)^\s*[A-H]\s*[).:\-]?\s+\S")
            .Cast<Match>()
            .Select(match => match.Value.Trim()[0])
            .Distinct()
            .Count();
        var totalDistinctOptionLabels = Math.Max(distinctOptionLabels, inlineDistinctOptionLabels);
        var hasSharedOptionList = totalDistinctOptionLabels >= 3 ||
                                  Regex.IsMatch(combined, @"(?is)\bA\b.{0,40}\bB\b.{0,40}\bC\b(?:.{0,40}\bD\b)?");
        var hasExplicitLetterRangeInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\b(?:letters?|ending(?:s)?)\s*[A-H]\s*[-–]\s*[A-H]\b|\b[A-H]\s*[-–]\s*[A-H]\b");
        var hasSharedOptionMechanism = hasSharedOptionList || hasExplicitLetterRangeInstruction;
        var hasSelectableAnswerBank = hasSharedOptionMechanism ||
                                      Regex.IsMatch(
                                          combined,
                                          @"(?i)\blist\s+of\s+words\b|\bfrom\s+the\s+box\b|\bchoose\s+your\s+answers?\s+from\s+the\s+box\b|\bwrite\s+the\s+correct\s+letter\b");
        var hasSummaryInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+summary\b|\bsummary\b");
        var hasExplicitShortAnswerInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\banswer\s+the\s+(?:following\s+)?questions?\b|\bchoose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\b");
        var hasCompletionStyleInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\b|\bfill\s+in\s+the\s+blanks?\b|\blabel\s+the\b");
        var hasTableInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+table\b|\btable\s+below\b|\btable\s+completion\b");
        var hasGenericCompleteFollowingInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+following\s+using\b|\bcomplete\s+the\s+description\s+below\b");
        var hasSentenceEndingInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcorrect\s+ending\b|\bsentence\s+endings?\b");
        var hasTimelineDiagramCompletionInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+timeline\s+diagram\s+below\b");
        var hasGenericDiagramCompletionInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+diagram\s+below\b");
        var hasTimelineMarkersInDiagramContent = Regex.IsMatch(
            string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
            @"(?i)\b(?:1[5-9]\d{2}|20\d{2})(?:s)?\b|\bToday\b|\bPresent\b|\bCurrent\b");
        var hasExplicitGapMarkersInQuestionBlock = Regex.IsMatch(
            string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
            @"_{2,}|\.{3,}|\bblank\b");
        var hasInterrogativeQuestionPrompts = Regex.IsMatch(
                string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
                @"\?") ||
            Regex.IsMatch(
                string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
                @"(?i)(?:(?<=^)|(?<=\s)|(?<=\d\s))(?:what|which|when|where|who|whose|why|how)\b");
        var hasTableLikeBlock = Regex.IsMatch(
                combined,
                @"(?i)\bhemp\b.*\bmarijuana\b|\bfibre\b|\bdrug\s+content\b") ||
            Regex.Matches(
                blockText ?? string.Empty,
                @"(?im)^\s*[A-Za-z][A-Za-z\- ]{1,24}\s*$")
            .Count >= 2;
        var hasSharedPhraseListSentenceInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+phrase(?:s)?\b|\bphrase(?:s)?\s+from\s+the\s+list\b|\blist\s+of\s+phrases\b|\bthere\s+are\s+more\s+phrases\s+than\s+questions\b") &&
            Regex.IsMatch(
                instructionText,
                @"(?i)\bcomplete\s+each\s+of\s+the\s+following\s+sentences\b|\bcomplete\s+each\s+sentence\b|\bcomplete\s+the\s+following\s+sentences\b");
        var hasSharedClassificationListInstruction =
            Regex.IsMatch(
                instructionText,
                @"(?i)\b(?:from\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*)?classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\s+characteristic\s+of\b") ||
            (
                Regex.IsMatch(
                    instructionText,
                    @"(?i)\bchoose\s+the\s+.+?\s+from\s+the\s+list\s+[A-H](?:\s*[-–]\s*[A-H])?\s+below\b") &&
                Regex.IsMatch(
                    instructionText,
                    @"(?i)\bwhich\s+corresponds?\s+to\b|\baccording\s+to\s+the\s+findings\b|\bfindings?\s+of\s+the\s+study\b|\bbest\s+matches?\b"));
        var hasClassificationInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\b(?:from\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*)?classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\b|\bas\s+characteristic\s+of\b");
        var hasFlowchartLikeAnswerBankInstruction =
            hasSharedOptionMechanism &&
            Regex.IsMatch(
                instructionText,
                @"(?i)\bre-?order\s+the\s+following\s+letters?\b|\bshow\s+the\s+sequence\s+of\s+events\b");
        var hasFlowchartLikePlaceholderRun =
            Regex.IsMatch(normalizedQuestionPreview, @"^(?:\d{1,2}\s+){2,}\d{1,2}$") ||
            Regex.IsMatch(
                normalizedBlockText,
                @"(?i)\bthe\s+first\s+one\s+has\s+been\s+done\s+for\s+you\s+as\s+an\s+example\b");
        var hasMatchingFeaturesInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\blook\s+at\s+the\s+following\s+statements\b|\bmatch\s+each\s+statement\s+to\s+the\s+correct\s+(?:person|people|researcher|researchers|country|countries|category|categories|group|groups|option|options)\b|\blist\s+of\s+(?:people|researchers|countries|categories|groups|options)\b|\byou\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\b|\bthere\s+may\s+be\s+more\s+than\s+one\s+correct\s+answer\b|\buse\s+the\s+information\s+in\s+the\s+(?:text|passage)\s+to\s+match\b|\bwith\s+the\s+(?:characteristics|statements|descriptions?|features|opinions)\s+(?:listed\s+)?below\b");
        var hasTfngInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bdo\s+the\s+following\s+statements\b|\btrue\s*\/\s*false\s*\/\s*not\s+given\b|\btrue\s+false\s+not\s+given\b|\bwrite\s*:\s*true\b|\bwrite\s+true\b|\bwrite\s+true\s+if\b|\bwrite\s+false\s+if\b|\bnot\s+given\s+if\b");
        var hasYnngInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bdo\s+the\s+following\s+statements\b|\byes\s*\/\s*no\s*\/\s*not\s+given\b|\byes\s+no\s+not\s+given\b|\bwrite\s*:\s*yes\b|\bwrite\s+yes\b|\bwrite\s+yes\s+if\b|\bwrite\s+no\s+if\b|\bnot\s+given\s+if\b");
        var hasMcqMultipleInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\b|\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+letters?\b|\bchoose\s+\w+\s+letters?\b");
        var hasOnlyOneChoiceInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b");
        var hasMcqSingleInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bchoose\s+the\s+correct\s+letter\b|\bchoose\s+the\s+correct\s+answer\b|\bcircle\s+the\s+correct\s+answer\b|\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b");
        var hasGenericChooseLettersInstruction =
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bwhich\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+of\s+the\s+following\b") &&
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+letters?\b");
        var hasChooseNStatementsInstruction =
            !hasOnlyOneChoiceInstruction &&
            hasSharedOptionMechanism &&
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\b(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+of\s+the\s+following\s+statements\s+are\s+(?:true|correct)\b|\bwrite\s+the\s+corresponding\s+letters\b|\bin\s+any\s+order\b");
        var hasSharedMultiSelectAnswerBoxes =
            explicitQuestionCount > 1 &&
            hasSharedOptionMechanism &&
            !hasExplicitPerQuestionPrompts &&
            (hasChooseNStatementsInstruction || hasGenericChooseLettersInstruction || hasMcqMultipleInstruction);

        if (Regex.IsMatch(instructionText, @"(?i)\bchoose\s+the\s+most\s+suitable\s+heading\b|\blist\s+of\s+headings\b"))
        {
            return ("MATCHING_HEADINGS", "Detected from instruction and block: list of headings / suitable heading pattern.");
        }

        if (Regex.IsMatch(instructionText, @"(?i)\bwhich\s+paragraphs?\s+contain(?:s)?\b|\bwhich\s+section\s+contains\b"))
        {
            return ("MATCHING_INFO", "Detected from question wording: which paragraph/section contains.");
        }

        if (hasTfngInstruction && upper.Contains("TRUE") && upper.Contains("FALSE") && upper.Contains("NOT GIVEN"))
        {
            return ("TFNG", "Detected from explicit TRUE/FALSE/NOT GIVEN instruction.");
        }

        if (hasYnngInstruction && upper.Contains("YES") && upper.Contains("NO") && upper.Contains("NOT GIVEN"))
        {
            return ("YNNG", "Detected from explicit YES/NO/NOT GIVEN instruction.");
        }

        if (hasChooseNStatementsInstruction)
        {
            return hasSharedMultiSelectAnswerBoxes
                ? ("MCQ_MULTIPLE", "Detected from choose-N instruction with a shared option bank and answer boxes, without explicit per-question stems.")
                : ("MCQ_CHOOSE_N", "Detected from multi-question choose-N instruction; the group contains several numbered questions that require one or more correct answers.");
        }

        if (hasGenericChooseLettersInstruction)
        {
            if (hasSharedMultiSelectAnswerBoxes)
            {
                return ("MCQ_MULTIPLE", "Detected from choose-letters instruction with shared options and answer boxes, without explicit per-question stems.");
            }

            return hasMultipleQuestionsInGroup
                ? ("MCQ_CHOOSE_N", "Detected from multi-question choose-letters instruction; each question in the range uses lettered choices.")
                : ("MCQ_MULTIPLE", "Detected from single-question choose-letters instruction with multiple correct answers.");
        }

        if (hasSummaryInstruction)
        {
            return (hasSelectableAnswerBank || hasExplicitLetterRangeInstruction)
                ? ("SUMMARY_COMPLETION", "Detected from summary instruction plus selectable answer bank/list of words/options.")
                : ("SENTENCE_COMPLETION", "Detected from summary text without any selectable answer bank; answers must be supplied directly from the passage.");
        }

        if (Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+(?:drawing|drawings|diagram|diagrams|figure|figures|image|images|picture|pictures|map|maps|plan|plans|projection|projections)\b") &&
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bmatch\s+each\b|\bto\s+match\s+each\b|\bcorresponds?\s+to\b|\bprojection\s+types?\b"))
        {
            return ("MATCHING_VISUALS", "Detected from choose-a-drawing/diagram instruction plus shared visual option set.");
        }

        if (hasFlowchartLikeAnswerBankInstruction && hasFlowchartLikePlaceholderRun)
        {
            return ("FLOWCHART_COMPLETION", "Detected from reordered-letter instruction plus flowchart-style numbered placeholders and shared answer bank.");
        }

        if (hasMatchingFeaturesInstruction)
        {
            return ("MATCHING_FEATURES", "Detected from matching-features instruction: statements must be matched to named people/researchers/categories, possibly with repeated letters.");
        }

        if (hasSharedClassificationListInstruction && hasSharedOptionMechanism)
        {
            return ("MATCHING_FEATURES", "Detected from choose-from-list instruction plus shared lettered answer bank used across multiple numbered items.");
        }

        if (hasClassificationInstruction ||
            Regex.IsMatch(combined, @"(?i)\bclassify\s+the\s+following(?:\s*\([^)]+\))?\s+as\b|\bmatch\s+one\s+of\s+the\b|\bwhich\s+researcher\b|\bwhich\s+category\b"))
        {
            return ("MATCHING_FEATURES", "Detected from question block: classification/matching to named categories or people.");
        }

        if (hasSentenceEndingInstruction && hasSharedOptionMechanism)
        {
            return ("MATCHING_FEATURES", "Detected from explicit sentence-ending wording plus shared option list; this is not fill-in-the-blank sentence completion.");
        }

        if (hasSharedPhraseListSentenceInstruction && hasSharedOptionMechanism)
        {
            return ("MATCHING_FEATURES", "Detected from shared phrase list plus numbered sentence stems; this is matching-type, not direct sentence completion.");
        }

        if (hasTableInstruction)
        {
            return ("TABLE_COMPLETION", "Detected from instruction: table completion.");
        }

        if (hasGenericCompleteFollowingInstruction && hasTableLikeBlock)
        {
            return ("TABLE_COMPLETION", "Detected from generic complete-the-following instruction plus table-like headers/content structure.");
        }

        if (Regex.IsMatch(instructionText, @"(?i)\blabel\s+the\s+(diagram|map)\b"))
        {
            return ("MAP_LABELLING", "Detected from instruction: label the diagram/map.");
        }

        if (hasTimelineDiagramCompletionInstruction ||
            (hasGenericDiagramCompletionInstruction && hasTimelineMarkersInDiagramContent))
        {
            return ("SENTENCE_COMPLETION", "Detected from diagram wording plus timeline/chronology markers; this remains text-based sentence completion.");
        }

        if (hasGenericDiagramCompletionInstruction)
        {
            return ("FLOWCHART_COMPLETION", "Detected from instruction: complete the diagram below, without timeline markers.");
        }

        if (Regex.IsMatch(combined, @"(?i)\bflow[\s-]?chart\b"))
        {
            return hasSelectableAnswerBank || hasExplicitLetterRangeInstruction
                ? ("FLOWCHART_COMPLETION", "Detected from flowchart instruction plus shared answer bank / lettered option set.")
                : ("FLOWCHART_COMPLETION", "Detected from instruction: flowchart completion.");
        }

        if (hasExplicitShortAnswerInstruction &&
            (!hasCompletionStyleInstruction || hasInterrogativeQuestionPrompts) &&
            !hasExplicitGapMarkersInQuestionBlock)
        {
            return ("SHORT_ANSWER", "Detected from explicit short-answer instruction without sentence-template gap placeholders.");
        }

        if (Regex.IsMatch(combined, @"(?i)\bshort\s+answer\b|\banswer\s+the\s+questions?\s+below\b"))
        {
            return ("SHORT_ANSWER", "Detected from instruction/question wording: short answer format.");
        }

        if (hasMcqMultipleInstruction)
        {
            if (hasSharedMultiSelectAnswerBoxes)
            {
                return ("MCQ_MULTIPLE", "Detected from shared multi-select instruction with answer boxes and no explicit per-question stems.");
            }

            return hasMultipleQuestionsInGroup
                ? ("MCQ_CHOOSE_N", "Detected from multi-question instruction/question wording: each question may have multiple correct answers.")
                : ("MCQ_MULTIPLE", "Detected from single-question instruction/question wording: multiple correct answers.");
        }

        if (hasMultipleQuestionsInGroup && hasMcqSingleInstruction && hasSharedOptionList && totalDistinctOptionLabels >= 5)
        {
            return ("MCQ_CHOOSE_N", "Detected from multi-question block with a shared option list and numbered prompts/statements.");
        }

        if (hasMcqSingleInstruction)
        {
            return ("MCQ_SINGLE", "Detected from question block: single-choice instruction with lettered options.");
        }

        if (Regex.IsMatch(combined, @"(?i)\bcomplete\s+the\s+sentences?\b|\bfill\s+in\s+the\s+blanks?\b|\bno\s+more\s+than\b|\bchoose\s+your\s+answers?\s+from\s+the\s+box\b"))
        {
            return ("SENTENCE_COMPLETION", "Detected from instruction and blanks/word-limit pattern.");
        }

        return (NormalizeGroupType(fallbackGroupType), string.IsNullOrWhiteSpace(fallbackGroupType)
            ? null
            : "Fallback to parser/AI group type because question block did not match a stronger heuristic.");
    }

    private static string? NormalizeGroupType(string? groupType)
    {
        if (string.IsNullOrWhiteSpace(groupType))
        {
            return null;
        }

        var normalized = groupType
            .Trim()
            .Replace(' ', '_')
            .Replace('-', '_')
            .ToUpperInvariant();

        return normalized switch
        {
            "MULTIPLECHOICE" or "MULTIPLE_CHOICE" or "MCQ" or "MCQ_SINGLE_CHOICE" => "MCQ_SINGLE",
            "MULTIPLECHOICE_MULTIPLE" or "MULTIPLE_CHOICE_MULTIPLE" or "MCQ_MULTI" => "MCQ_MULTIPLE",
            "MATCHING_INFORMATION" => "MATCHING_INFO",
            "MATCHING_ENDINGS" or "SENTENCE_ENDINGS" or "MATCHING_SENTENCE_ENDINGS" => "MATCHING_FEATURES",
            "MATCHING_CLASSIFICATION" or "CLASSIFICATION" => "MATCHING_FEATURES",
            "MATCHING_VISUALS" or "MATCHING_DRAWINGS" or "MATCHING_IMAGES" or "MATCHING_PROJECTIONS" => "MATCHING_VISUALS",
            "MAP_LABELLING" or "MAP_LABELING" or "DIAGRAM_LABELLING" or "DIAGRAM_LABELING" => "MAP_LABELLING",
            _ => normalized
        };
    }

    private static int CountVisibleGroupQuestionPromptMarkers(string? text, int? startQuestion, int? endQuestion)
    {
        if (string.IsNullOrWhiteSpace(text) ||
            !startQuestion.HasValue ||
            !endQuestion.HasValue ||
            endQuestion.Value < startQuestion.Value)
        {
            return 0;
        }

        var count = 0;
        for (var questionNumber = startQuestion.Value; questionNumber <= endQuestion.Value; questionNumber++)
        {
            if (Regex.IsMatch(
                    text,
                    $@"(?<![A-Za-z0-9]){Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture))}(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
                    RegexOptions.IgnoreCase))
            {
                count++;
            }
        }

        return count;
    }

    private Task<string> RequestGemmaJsonCompletionBestEffortAsync(string prompt, CancellationToken cancellationToken) =>
        RequestGemmaJsonCompletionAsync(prompt, RawReviewMaxApiRetries, cancellationToken);

    private Task<string> RequestGemmaJsonCompletionWithRetryAsync(string prompt, CancellationToken cancellationToken) =>
        RequestGemmaJsonCompletionAsync(prompt, MaxJsonParseRetries, cancellationToken);

    private async Task<string> RequestGemmaJsonCompletionAsync(
        string prompt,
        int maxRetries,
        CancellationToken cancellationToken)
    {
        var totalAttempts = Math.Max(0, maxRetries) + 1;
        for (var attempt = 1; attempt <= totalAttempts; attempt++)
        {
            try
            {
                return await RequestGemmaCompletionAsync(prompt, cancellationToken);
            }
            catch (Exception ex) when (attempt < totalAttempts && TryResolveApiRetryDelay(ex, out var retryDelay, out _))
            {
                await Task.Delay(retryDelay, cancellationToken);
            }
        }

        return await RequestGemmaCompletionAsync(prompt, cancellationToken);
    }

    private static bool TryDeserializeAiReviewResponse<T>(
        string rawResponse,
        out T? payload,
        out string? parseError)
        where T : class
    {
        parseError = null;
        payload = null;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeAiReviewCandidate(candidate, out payload, out parseError) && payload is not null)
                {
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            parseError = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeAiReviewCandidate<T>(
        string candidateJson,
        out T? payload,
        out string? parseError)
        where T : class
    {
        payload = null;
        parseError = null;
        var workingJson = candidateJson;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                payload = JsonSerializer.Deserialize<T>(workingJson, JsonOptions);
                if (payload is not null)
                {
                    return true;
                }

                parseError = "Deserialized payload is null.";
                return false;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    return false;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                return false;
            }
        }

        return false;
    }

    private async Task<(CreateReadingPassageDto Passage, int NextRunningQuestionNumber)> BuildReadingPassageAsync(
        GemmaPassagePayload payload,
        string? rawPassageText,
        IReadOnlyList<ReadingQuestionGroupOutline> rawQuestionGroupOutlines,
        IReadOnlyList<PdfRawQuestionInstructionPreviewDto>? reviewedQuestionGroups,
        int passageNumber,
        int runningQuestionNumber,
        CancellationToken cancellationToken)
    {
        var rawQuestionGroupOutlineMap = BuildRawQuestionGroupOutlineMap(rawQuestionGroupOutlines);
        var rawQuestionGroupContexts = BuildRawQuestionGroupContextMap(
            rawQuestionGroupOutlines,
            rawPassageText,
            reviewedQuestionGroups);
        var passageTitle = string.IsNullOrWhiteSpace(payload.PassageTitle)
            ? $"Reading Passage {passageNumber}"
            : payload.PassageTitle.Trim();
        var aiPassageContent = NormalizePassageContent(payload.PassageContent, passageTitle);
        var rawPassageContent = NormalizePassageContent(rawPassageText, passageTitle);
        var passageContent = FinalizePassageContent(
            aiPassageContent,
            rawPassageContent,
            rawQuestionGroupOutlineMap);
        var orderedQuestions = (payload.Questions ?? [])
            .Select((question, index) => new IndexedQuestion(question, index))
            .OrderBy(x => ParseQuestionNumber(ReadJsonAsText(x.Question.QuestionNumber)) ?? int.MaxValue)
            .ThenBy(x => x.Index)
            .ToList();

        var groupBuilders = new List<QuestionGroupBuilder>();
        QuestionGroupBuilder? currentGroup = null;

        foreach (var indexed in orderedQuestions)
        {
            var rawQuestion = indexed.Question;
            var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(rawQuestion.QuestionNumber));
            var rawGroupContext =
                parsedQuestionNumber.HasValue &&
                rawQuestionGroupContexts.TryGetValue(parsedQuestionNumber.Value, out var resolvedRawGroupContext)
                    ? resolvedRawGroupContext
                    : null;
            var questionTypeText = ReadJsonAsText(rawQuestion.QuestionType);
            var questionText = ReadJsonAsText(rawQuestion.QuestionText);
            var answerText = ReadJsonAsText(rawQuestion.Answer);
            var explanationText = ReadJsonAsText(rawQuestion.Explanation);
            var aiMappedQuestionType = MapQuestionType(questionTypeText);
            var mappedQuestionType = ResolveMappedQuestionType(rawGroupContext?.GroupType, aiMappedQuestionType);
            var normalizedQuestionContent = NormalizeQuestionContent(mappedQuestionType, questionText, parsedQuestionNumber);
            var boundaryToken = rawGroupContext?.BoundaryToken ?? ExtractExplicitGroupBoundaryToken(mappedQuestionType, questionText);

            if (currentGroup is null ||
                !string.Equals(currentGroup.GroupType, mappedQuestionType, StringComparison.Ordinal) ||
                ShouldStartNewQuestionGroup(currentGroup, boundaryToken))
            {
                currentGroup = new QuestionGroupBuilder(mappedQuestionType, boundaryToken, rawGroupContext);
                groupBuilders.Add(currentGroup);
            }

            var questionNumber = runningQuestionNumber++;
            var options = BuildOptions(
                ExtractOptions(rawQuestion.Options),
                mappedQuestionType,
                answerText);
            currentGroup.Questions.Add(new CreateQuestionDto(
                QuestionNumber: questionNumber,
                Content: normalizedQuestionContent,
                CorrectAnswer: answerText?.Trim(),
                Explanation: string.IsNullOrWhiteSpace(explanationText) ? null : explanationText.Trim(),
                Points: 1,
                Options: options));
        }

        var questionGroups = new List<CreateQuestionGroupDto>(groupBuilders.Count);
        foreach (var builder in groupBuilders)
        {
            var (normalizedQuestions, sharedInstruction, assetsData) = NormalizeGroupQuestions(
                builder.GroupType,
                builder.Questions,
                builder.RawInstruction,
                builder.RawBlockText);
            var finalGroupType = NormalizeGroupTypeByQuestionCount(builder.GroupType, normalizedQuestions);
            if (string.Equals(finalGroupType, "SENTENCE_COMPLETION", StringComparison.Ordinal))
            {
                normalizedQuestions = await TryRepairSentenceCompletionQuestionSetWithGemmaAsync(
                    normalizedQuestions,
                    passageContent,
                    rawPassageText,
                    builder,
                    cancellationToken);
            }
            var contentData = BuildGroupContentData(finalGroupType, sharedInstruction, normalizedQuestions);
            (normalizedQuestions, assetsData) = ApplyGroupVisualAssets(
                finalGroupType,
                normalizedQuestions,
                assetsData,
                builder.RawContext);
            sharedInstruction = string.IsNullOrWhiteSpace(builder.RawInstruction)
                ? sharedInstruction
                : builder.RawInstruction;
            var startQuestion = builder.Questions.Count > 0
                ? normalizedQuestions.Min(q => q.QuestionNumber)
                : null;

            var endQuestion = builder.Questions.Count > 0
                ? normalizedQuestions.Max(q => q.QuestionNumber)
                : null;

            questionGroups.Add(new CreateQuestionGroupDto(
                GroupType: finalGroupType,
                Instruction: ResolveGroupInstruction(finalGroupType, sharedInstruction),
                ContentData: contentData,
                AssetsData: assetsData,
                StartQuestion: startQuestion,
                EndQuestion: endQuestion,
                Questions: normalizedQuestions));
        }

        return (
            Passage: new CreateReadingPassageDto(
                PassageNumber: passageNumber,
                Title: passageTitle,
                ParagraphsData: passageContent,
                AssetsData: null,
                QuestionGroups: questionGroups),
            NextRunningQuestionNumber: runningQuestionNumber);
    }

    private async Task<List<CreateQuestionDto>> TryRepairSentenceCompletionQuestionSetWithGemmaAsync(
        List<CreateQuestionDto> questions,
        string passageContent,
        string? rawPassageText,
        QuestionGroupBuilder builder,
        CancellationToken cancellationToken)
    {
        if (questions.Count <= 1 ||
            string.IsNullOrWhiteSpace(passageContent) ||
            string.IsNullOrWhiteSpace(builder.RawBlockText))
        {
            return questions;
        }

        try
        {
            var prompt = BuildSentenceCompletionTemplateRepairPrompt(
                passageContent,
                builder.RawInstruction,
                builder.RawBlockText,
                builder.RawContext?.QuestionPreview,
                questions);
            var rawResponse = await RequestGemmaJsonCompletionWithRetryAsync(prompt, cancellationToken);
            if (!TryDeserializeSentenceCompletionTemplateMap(rawResponse, out var templateMap, out var parseError))
            {
                logger.LogWarning(
                    "Gemma sentence-completion template repair returned invalid JSON for range {StartQuestion}-{EndQuestion}: {Error}",
                    builder.RawContext?.StartQuestion ?? questions.Min(question => question.QuestionNumber ?? 0),
                    builder.RawContext?.EndQuestion ?? questions.Max(question => question.QuestionNumber ?? 0),
                    parseError);
                return questions;
            }

            if (templateMap.Count == 0)
            {
                return questions;
            }

            var rebuiltQuestions = new List<CreateQuestionDto>(questions.Count);
            foreach (var question in questions)
            {
                if (!question.QuestionNumber.HasValue ||
                    !templateMap.TryGetValue(question.QuestionNumber.Value, out var template))
                {
                    return questions;
                }

                var normalizedTemplate = NormalizeQuestionBody(
                    "SENTENCE_COMPLETION",
                    template,
                    question.QuestionNumber);
                if (!IsValidSentenceCompletionTemplate(normalizedTemplate, question.QuestionNumber.Value))
                {
                    return questions;
                }

                rebuiltQuestions.Add(question with
                {
                    Content = normalizedTemplate
                });
            }

            return rebuiltQuestions;
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Gemma sentence-completion template repair failed unexpectedly for range {StartQuestion}-{EndQuestion}.",
                builder.RawContext?.StartQuestion ?? questions.Min(question => question.QuestionNumber ?? 0),
                builder.RawContext?.EndQuestion ?? questions.Max(question => question.QuestionNumber ?? 0));
            return questions;
        }
    }

    private static string BuildSentenceCompletionTemplateRepairPrompt(
        string passageContent,
        string? instruction,
        string rawBlockText,
        string? questionPreview,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        var questionsJson = JsonSerializer.Serialize(
            questions
                .Where(question => question.QuestionNumber.HasValue)
                .Select(question => new
                {
                    question_number = question.QuestionNumber,
                    current_candidate = CollapseWhitespaceForPrompt(question.Content, 260),
                    answer = question.CorrectAnswer?.Trim() ?? string.Empty
                }),
            JsonOptions);

        return $$"""
            Bạn là bộ máy tái dựng SENTENCE_COMPLETION cho đề IELTS Reading.

            NHIỆM VỤ:
            - Dùng PASSAGE + QUESTION_BLOCK_RAW + ANSWER để xác định chính xác vị trí ô trống của từng câu.
            - Với mỗi question_number, trả lại đúng một sentence template đã chèn token [Qx] vào chỗ cần điền.

            QUY TẮC CỨNG:
            - Mỗi template phải chứa ĐÚNG 1 token có dạng [Qn] tương ứng question_number của chính nó.
            - Không được thêm token thứ hai, không được giữ các token [Qm] khác, không được để "___" nếu đã có [Qn].
            - Không được đặt [Qn] ở cuối câu nếu ô trống thực tế nằm ở giữa câu.
            - Giữ wording gần đề gốc nhất có thể; chỉ sửa lỗi OCR, dính chữ, mất khoảng trắng khi hiển nhiên.
            - Được phép dùng ANSWER để đọc hiểu và xác định từ/cụm từ nào đang bị thiếu rồi đặt [Qn] đúng vị trí.
            - Nếu raw block bị lỗi kiểu số câu chèn vào giữa câu, phải hiểu đó là số câu chứ không phải nội dung câu.
            - Không trả lời giải thích, không paraphrase toàn bộ sentence, không thêm instruction.

            TRẢ VỀ DUY NHẤT JSON:
            {
              "templates": [
                {
                  "question_number": 1,
                  "template": "A decrease in crime in the Netherlands and parts of the US is attributable more to the [Q1] than to their incarceration."
                }
              ]
            }

            PASSAGE:
            {{BuildPromptMultilineBlock(passageContent, 9000)}}

            INSTRUCTION:
            {{BuildPromptMultilineBlock(instruction, 600)}}

            QUESTION_PREVIEW:
            {{BuildPromptMultilineBlock(questionPreview, 1400)}}

            QUESTION_BLOCK_RAW:
            {{BuildPromptMultilineBlock(rawBlockText, 4000)}}

            QUESTIONS_JSON:
            {{questionsJson}}
            """;
    }

    private static string BuildPromptMultilineBlock(string? text, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(text)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..maxLength].TrimEnd();
    }

    private static bool TryDeserializeSentenceCompletionTemplateMap(
        string rawResponse,
        out Dictionary<int, string> templateMap,
        out string error)
    {
        templateMap = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeSentenceCompletionTemplateCandidate(candidate, out templateMap, out var parseError))
                {
                    return true;
                }

                error = parseError ?? "Unknown parse error";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeSentenceCompletionTemplateCandidate(
        string candidateJson,
        out Dictionary<int, string> templateMap,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var payload = DeserializeSentenceCompletionTemplatePayload(workingJson);
                templateMap = ConvertSentenceCompletionTemplatePayloadToMap(payload);
                return true;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        templateMap = [];
        return false;
    }

    private static SentenceCompletionTemplateResponse DeserializeSentenceCompletionTemplatePayload(string json)
    {
        var objectPayload = JsonSerializer.Deserialize<SentenceCompletionTemplateResponse>(json, JsonOptions);
        if (objectPayload?.Templates is not null)
        {
            return objectPayload;
        }

        var arrayPayload = JsonSerializer.Deserialize<List<SentenceCompletionTemplateItem>>(json, JsonOptions);
        return new SentenceCompletionTemplateResponse
        {
            Templates = arrayPayload ?? []
        };
    }

    private static Dictionary<int, string> ConvertSentenceCompletionTemplatePayloadToMap(
        SentenceCompletionTemplateResponse payload)
    {
        var map = new Dictionary<int, string>();
        foreach (var item in payload.Templates ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(item.QuestionNumber));
            if (!questionNumber.HasValue || questionNumber.Value <= 0)
            {
                continue;
            }

            var template = UnescapeExtractedText(item.Template ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(template))
            {
                continue;
            }

            map[questionNumber.Value] = template;
        }

        return map;
    }

    private static bool IsValidSentenceCompletionTemplate(string? template, int questionNumber)
    {
        if (string.IsNullOrWhiteSpace(template))
        {
            return false;
        }

        var normalized = Regex.Replace(template, @"\s+", " ").Trim();
        var expectedToken = $"[Q{questionNumber}]";
        if (!normalized.Contains(expectedToken, StringComparison.Ordinal))
        {
            return false;
        }

        var tokens = Regex.Matches(normalized, @"\[Q\d+\]");
        if (tokens.Count != 1 || !string.Equals(tokens[0].Value, expectedToken, StringComparison.Ordinal))
        {
            return false;
        }

        var withoutToken = normalized.Replace(expectedToken, "___", StringComparison.Ordinal);
        if (LooksLikeAnyStrongInstructionLine(withoutToken) || QuestionRangeBoundaryRegex().IsMatch(withoutToken))
        {
            return false;
        }

        var wordCount = Regex.Matches(withoutToken, @"[A-Za-z][A-Za-z'’\-]*").Count;
        return wordCount >= 4 && normalized.Length <= 320;
    }

    private static Dictionary<int, ReadingQuestionGroupOutline> BuildRawQuestionGroupOutlineMap(
        IReadOnlyList<ReadingQuestionGroupOutline> rawQuestionGroupOutlines)
    {
        var result = new Dictionary<int, ReadingQuestionGroupOutline>();
        foreach (var outline in rawQuestionGroupOutlines)
        {
            for (var questionNumber = outline.StartQuestion; questionNumber <= outline.EndQuestion; questionNumber++)
            {
                result[questionNumber] = outline;
            }
        }

        return result;
    }

    private static Dictionary<int, RawQuestionGroupContext> BuildRawQuestionGroupContextMap(
        IReadOnlyList<ReadingQuestionGroupOutline> rawQuestionGroupOutlines,
        string? rawPassageText,
        IReadOnlyList<PdfRawQuestionInstructionPreviewDto>? reviewedQuestionGroups = null)
    {
        var reviewBlocks = string.IsNullOrWhiteSpace(rawPassageText)
            ? []
            : BuildQuestionGroupReviewBlocks(rawPassageText, rawQuestionGroupOutlines);
        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);
        var outlineRangeMap = rawQuestionGroupOutlines
            .GroupBy(outline => (outline.StartQuestion, outline.EndQuestion))
            .ToDictionary(group => group.Key, group => group.First());

        var result = new Dictionary<int, RawQuestionGroupContext>();
        if (reviewedQuestionGroups is { Count: > 0 })
        {
            foreach (var reviewedGroup in reviewedQuestionGroups
                .Where(group => group.StartQuestion > 0 && group.EndQuestion >= group.StartQuestion)
                .GroupBy(group => (group.StartQuestion, group.EndQuestion))
                .Select(group => group.First())
                .OrderBy(group => group.StartQuestion))
            {
                reviewBlockMap.TryGetValue((reviewedGroup.StartQuestion, reviewedGroup.EndQuestion), out var block);
                outlineRangeMap.TryGetValue((reviewedGroup.StartQuestion, reviewedGroup.EndQuestion), out var outline);

                var context = new RawQuestionGroupContext(
                    StartQuestion: reviewedGroup.StartQuestion,
                    EndQuestion: reviewedGroup.EndQuestion,
                    BoundaryToken: BuildQuestionGroupRangeBoundaryToken(reviewedGroup.StartQuestion, reviewedGroup.EndQuestion),
                    Instruction: string.IsNullOrWhiteSpace(reviewedGroup.Instruction)
                        ? outline?.Instruction
                        : reviewedGroup.Instruction,
                    GroupType: reviewedGroup.GroupType ?? outline?.GroupType,
                    BlockText: block?.BlockText,
                    QuestionPreview: !string.IsNullOrWhiteSpace(reviewedGroup.QuestionPreview)
                        ? reviewedGroup.QuestionPreview
                        : block?.QuestionPreview,
                    VisualPreviewItems: reviewedGroup.VisualPreviewItems,
                    VisualPreviewNote: reviewedGroup.VisualPreviewNote,
                    DiagramPreviewPageNumber: reviewedGroup.DiagramPreviewPageNumber,
                    DiagramPreviewNote: reviewedGroup.DiagramPreviewNote);

                for (var questionNumber = reviewedGroup.StartQuestion; questionNumber <= reviewedGroup.EndQuestion; questionNumber++)
                {
                    result[questionNumber] = context;
                }
            }

            foreach (var outline in rawQuestionGroupOutlines)
            {
                var isAlreadyCovered = Enumerable
                    .Range(outline.StartQuestion, outline.EndQuestion - outline.StartQuestion + 1)
                    .All(result.ContainsKey);
                if (isAlreadyCovered)
                {
                    continue;
                }

                reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
                var context = new RawQuestionGroupContext(
                    StartQuestion: outline.StartQuestion,
                    EndQuestion: outline.EndQuestion,
                    BoundaryToken: outline.BoundaryToken ?? BuildQuestionGroupRangeBoundaryToken(outline.StartQuestion, outline.EndQuestion),
                    Instruction: outline.Instruction,
                    GroupType: outline.GroupType,
                    BlockText: block?.BlockText,
                    QuestionPreview: block?.QuestionPreview,
                    VisualPreviewItems: null,
                    VisualPreviewNote: null,
                    DiagramPreviewPageNumber: null,
                    DiagramPreviewNote: null);

                for (var questionNumber = outline.StartQuestion; questionNumber <= outline.EndQuestion; questionNumber++)
                {
                    result[questionNumber] = context;
                }
            }

            return result;
        }

        foreach (var outline in rawQuestionGroupOutlines)
        {
            reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
            var context = new RawQuestionGroupContext(
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                BoundaryToken: outline.BoundaryToken ?? BuildQuestionGroupRangeBoundaryToken(outline.StartQuestion, outline.EndQuestion),
                Instruction: outline.Instruction,
                GroupType: outline.GroupType,
                BlockText: block?.BlockText,
                QuestionPreview: block?.QuestionPreview,
                VisualPreviewItems: null,
                VisualPreviewNote: null,
                DiagramPreviewPageNumber: null,
                DiagramPreviewNote: null);

            for (var questionNumber = outline.StartQuestion; questionNumber <= outline.EndQuestion; questionNumber++)
            {
                result[questionNumber] = context;
            }
        }

        return result;
    }

    private static string BuildQuestionGroupRangeBoundaryToken(int startQuestion, int endQuestion) =>
        $"RANGE:{startQuestion}-{endQuestion}";

    private static string NormalizePassageContent(string? passageContent, string? passageTitle = null)
    {
        if (string.IsNullOrWhiteSpace(passageContent))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(passageContent)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = NormalizeExtractedSpacing(normalized);
        normalized = PassageNoiseLineRegex().Replace(normalized, string.Empty);
        normalized = PassageQuestionIntroLineRegex().Replace(normalized, string.Empty);
        normalized = StripInlinePassageFooterNoise(normalized);
        normalized = TrimPassageAtQuestionBoundary(normalized);
        normalized = NormalizePassageParagraphBreaks(normalized);
        normalized = RemoveLeadingRepeatedPassageTitle(normalized, passageTitle);

        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        return normalized.Trim();
    }

    private static string StripInlinePassageFooterNoise(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var noiseMatch = InlinePassageFooterNoiseRegex().Match(line);
            if (noiseMatch.Success && noiseMatch.Index >= 0)
            {
                line = line[..noiseMatch.Index];
            }

            lines[i] = line;
        }

        return string.Join("\n", lines);
    }

    private static string TrimPassageAtQuestionBoundary(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var boundaryMatch = PassageQuestionBoundaryLineRegex().Match(content);
        if (!boundaryMatch.Success || boundaryMatch.Index <= 0)
        {
            return content;
        }

        var trimmed = content[..boundaryMatch.Index].TrimEnd();
        return string.IsNullOrWhiteSpace(trimmed) ? content : trimmed;
    }

    private static string NormalizePassageParagraphBreaks(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalized = content;
        var hasStructuredLabels = HasStructuredParagraphLabels(normalized);
        // Nối lại các viết tắt bị vỡ dòng kiểu "D.\nC." để tránh hiểu nhầm "C." là nhãn đoạn.
        normalized = BrokenAbbreviationAcrossLinesRegex().Replace(normalized, ".");
        if (hasStructuredLabels)
        {
            normalized = CollapsedPassageParagraphBoundaryRegex().Replace(normalized, "\n\n");
            normalized = Regex.Replace(
                normalized,
                @"(?m)(?<!\b[A-Z]\.)(?<!\n)\n(?=\s*(?:\*\*)?[A-H](?:\s*[).:\-]|[.])?(?:\*\*)?(?:\s+\S.*)?$)",
                "\n\n");
            normalized = Regex.Replace(
                normalized,
                @"(?m)^\s*\*\*(?<label>[A-H])(?:\s*[).:\-]|[.])?\s*\*\*\s*\n\s*(?<text>\S.*)$",
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
            normalized = Regex.Replace(
                normalized,
                @"(?m)^\s*(?<label>[A-H])(?:(?:\s*[).:\-]|[.])\s*|\s+)\n\s*(?<text>\S.*)$",
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
        }

        normalized = Regex.Replace(normalized, @"[ \t]*\n[ \t]*", "\n");
        normalized = Regex.Replace(normalized, @"(?<!\n)\n(?!\n)", " ");
        normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        normalized = Regex.Replace(normalized, @" *\n\n *", "\n\n");
        if (hasStructuredLabels)
        {
            normalized = MarkdownLabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
            normalized = LabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
            normalized = StandaloneMarkdownLabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    return $"**{label}.**";
                });
            normalized = StandaloneLabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    return $"**{label}.**";
                });
            normalized = MissingBlankLineBeforeLabeledPassageRegex().Replace(normalized, "\n\n");
        }

        normalized = NormalizeSpeakerAttributionLines(normalized);
        normalized = OrphanLeadingMarkdownMarkerRegex().Replace(normalized, string.Empty);
        normalized = OrphanTrailingMarkdownMarkerRegex().Replace(normalized, string.Empty);
        normalized = RemoveOrphanMarkdownMarkersByLine(normalized);
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        return normalized;
    }

    private static string RecoverStructuredParagraphLabels(string aiPassageContent, string rawPassageContent)
    {
        if (string.IsNullOrWhiteSpace(rawPassageContent))
        {
            return aiPassageContent;
        }

        var aiRun = GetLongestStructuredParagraphLabelRun(aiPassageContent);
        var rawRun = GetLongestStructuredParagraphLabelRun(rawPassageContent);

        if (rawRun >= 2 && aiRun < rawRun)
        {
            return rawPassageContent;
        }

        return aiPassageContent;
    }

    private static string FinalizePassageContent(
        string aiPassageContent,
        string rawPassageContent,
        IReadOnlyDictionary<int, ReadingQuestionGroupOutline> rawQuestionGroupContexts)
    {
        var preferredContent = RecoverStructuredParagraphLabels(aiPassageContent, rawPassageContent);
        if (HasStructuredParagraphLabels(preferredContent))
        {
            return preferredContent;
        }

        if (!ShouldForceParagraphLabeling(rawQuestionGroupContexts))
        {
            return preferredContent;
        }

        var rawAutoLabeledContent = AutoLabelParagraphBlocks(rawPassageContent);
        if (HasStructuredParagraphLabels(rawAutoLabeledContent))
        {
            return rawAutoLabeledContent;
        }

        var preferredAutoLabeledContent = AutoLabelParagraphBlocks(preferredContent);
        return HasStructuredParagraphLabels(preferredAutoLabeledContent)
            ? preferredAutoLabeledContent
            : preferredContent;
    }

    private static bool ShouldForceParagraphLabeling(
        IReadOnlyDictionary<int, ReadingQuestionGroupOutline> rawQuestionGroupContexts)
    {
        if (rawQuestionGroupContexts.Count == 0)
        {
            return false;
        }

        var distinctContexts = rawQuestionGroupContexts.Values
            .GroupBy(context => (context.StartQuestion, context.EndQuestion, context.BoundaryToken))
            .Select(group => group.First());

        foreach (var context in distinctContexts)
        {
            if (string.Equals(context.GroupType, "MATCHING_HEADINGS", StringComparison.Ordinal) ||
                string.Equals(context.GroupType, "MATCHING_INFO", StringComparison.Ordinal))
            {
                return true;
            }

            if (!string.IsNullOrWhiteSpace(context.Instruction) &&
                Regex.IsMatch(context.Instruction, @"\bparagraphs?\b", RegexOptions.IgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string AutoLabelParagraphBlocks(string content)
    {
        if (string.IsNullOrWhiteSpace(content) || HasStructuredParagraphLabels(content))
        {
            return content;
        }

        var normalized = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return content;
        }

        var paragraphBlocks = normalized
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(block => Regex.Replace(block, @"\s+", " ").Trim())
            .Where(block => !string.IsNullOrWhiteSpace(block))
            .Where(block => block.Length >= 25 || SentenceEndingPunctuationRegex().IsMatch(block))
            .ToList();
        if (paragraphBlocks.Count < 3 || paragraphBlocks.Count > 8)
        {
            return content;
        }

        var labeledParagraphs = paragraphBlocks
            .Select((block, index) =>
            {
                var label = (char)('A' + index);
                return $"**{label}.**\n\n{block}";
            });

        return string.Join("\n\n", labeledParagraphs).Trim();
    }

    private static bool HasStructuredParagraphLabels(string content)
    {
        return GetLongestStructuredParagraphLabelRun(content) >= 2;
    }

    private static int GetLongestStructuredParagraphLabelRun(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return 0;
        }

        var labels = ExtractStructuredParagraphLabels(content);

        if (labels.Count < 2)
        {
            return 0;
        }

        var longestRun = 1;
        var currentRun = 1;
        for (var i = 1; i < labels.Count; i++)
        {
            if (labels[i] == labels[i - 1] + 1)
            {
                currentRun++;
                if (currentRun > longestRun)
                {
                    longestRun = currentRun;
                }
            }
            else
            {
                currentRun = 1;
            }
        }

        return longestRun;
    }

    private static List<char> ExtractStructuredParagraphLabels(string content) =>
        Regex.Matches(
                content,
                @"(?m)^\s*(?:\*\*)?(?<label>[A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?(?:\s+\S.*)?$")
            .Select(match => match.Groups["label"].Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => char.ToUpperInvariant(value[0]))
            .Distinct()
            .OrderBy(ch => ch)
            .ToList();

    private static string RemoveOrphanMarkdownMarkersByLine(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            lines[i] = RemoveOrphanMarkdownMarkersFromLine(line);
        }

        return string.Join('\n', lines);
    }

    private static string RemoveOrphanMarkdownMarkersFromLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return line;
        }

        var working = line.Trim();
        if (working.Length == 0)
        {
            return string.Empty;
        }

        working = RemoveSingleOrphanPairFromLine(working, "**");
        working = RemoveSingleOrphanPairFromLine(working, "__");
        working = Regex.Replace(working, @"^(?:\\\*\\\*|\\_\\_)\s+", string.Empty);
        working = Regex.Replace(working, @"\s+(?:\\\*\\\*|\\_\\_)$", string.Empty);
        return working;
    }

    private static string RemoveSingleOrphanPairFromLine(string line, string marker)
    {
        if (string.IsNullOrWhiteSpace(line) || string.IsNullOrWhiteSpace(marker))
        {
            return line;
        }

        var occurrenceCount = CountOccurrences(line, marker);
        if (occurrenceCount == 1)
        {
            if (line.StartsWith(marker, StringComparison.Ordinal))
            {
                return line[marker.Length..].TrimStart();
            }

            if (line.EndsWith(marker, StringComparison.Ordinal))
            {
                return line[..^marker.Length].TrimEnd();
            }
        }

        return line;
    }

    private static int CountOccurrences(string text, string token)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrEmpty(token))
        {
            return 0;
        }

        var count = 0;
        var index = 0;
        while (true)
        {
            index = text.IndexOf(token, index, StringComparison.Ordinal);
            if (index < 0)
            {
                break;
            }

            count++;
            index += token.Length;
        }

        return count;
    }

    private static string RemoveLeadingRepeatedPassageTitle(string content, string? passageTitle)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalizedTitle = NormalizeComparableTitle(passageTitle);
        if (string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return content.Trim();
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n')
            .ToList();
        if (lines.Count == 0)
        {
            return content.Trim();
        }

        var changed = false;
        while (true)
        {
            var firstIndex = lines.FindIndex(line => !string.IsNullOrWhiteSpace(line));
            if (firstIndex < 0)
            {
                break;
            }

            var firstLineNormalized = NormalizeComparableTitle(lines[firstIndex]);
            if (string.IsNullOrWhiteSpace(firstLineNormalized))
            {
                break;
            }

            if (string.Equals(firstLineNormalized, normalizedTitle, StringComparison.Ordinal))
            {
                lines[firstIndex] = string.Empty;
                changed = true;
                continue;
            }

            var headingWithoutPrefix = Regex.Replace(
                firstLineNormalized,
                @"^(?:reading\s+)?passage\s*[0-9OoIl\|]+\s*[:\-]?\s*",
                string.Empty,
                RegexOptions.IgnoreCase).Trim();
            if (string.Equals(headingWithoutPrefix, normalizedTitle, StringComparison.Ordinal))
            {
                lines[firstIndex] = string.Empty;
                changed = true;
                continue;
            }

            if (Regex.IsMatch(firstLineNormalized, @"^(?:reading\s+)?passage\s*[0-9OoIl\|]+\s*$", RegexOptions.IgnoreCase))
            {
                var secondIndex = -1;
                for (var i = firstIndex + 1; i < lines.Count; i++)
                {
                    if (!string.IsNullOrWhiteSpace(lines[i]))
                    {
                        secondIndex = i;
                        break;
                    }
                }

                if (secondIndex > firstIndex)
                {
                    var secondLineNormalized = NormalizeComparableTitle(lines[secondIndex]);
                    if (string.Equals(secondLineNormalized, normalizedTitle, StringComparison.Ordinal))
                    {
                        lines[firstIndex] = string.Empty;
                        lines[secondIndex] = string.Empty;
                        changed = true;
                        continue;
                    }
                }
            }

            break;
        }

        var result = string.Join('\n', lines);
        if (!changed)
        {
            return result.Trim();
        }

        result = Regex.Replace(result, @"\n{3,}", "\n\n");
        return result.Trim();
    }

    private static string NormalizeComparableTitle(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(value)
            .Replace("\r\n", " ")
            .Replace('\r', ' ')
            .Replace('\n', ' ');
        normalized = Regex.Replace(normalized, @"[^\p{L}\p{N}\s]+", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ");
        return normalized.Trim().ToLowerInvariant();
    }

    private static string NormalizeLabeledPassageText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var cleaned = text.Trim();
        cleaned = Regex.Replace(cleaned, @"^\s*(?:\*{2,}|_{2,})\s+", string.Empty);
        cleaned = Regex.Replace(cleaned, @"\s+(?:\*{2,}|_{2,})\s*$", string.Empty);
        cleaned = Regex.Replace(cleaned, @"[ \t]{2,}", " ");
        return cleaned.Trim();
    }

    private static string NormalizeSpeakerAttributionLines(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalized = InlineSpeakerAttributionRegex().Replace(
            content,
            match =>
            {
                var quote = match.Groups["quote"].Value;
                var speaker = match.Groups["speaker"].Value.Trim();
                return $"{quote}\n\n{speaker}";
            });

        var lines = normalized
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        var rebuiltLines = new List<string>(lines.Length + 8);
        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                if (rebuiltLines.Count > 0 && rebuiltLines[^1].Length > 0)
                {
                    rebuiltLines.Add(string.Empty);
                }

                continue;
            }

            var signatureMatch = SpeakerSignatureLineRegex().Match(line);
            if (signatureMatch.Success)
            {
                var speaker = signatureMatch.Groups["speaker"].Value.Trim();
                if (rebuiltLines.Count > 0 && rebuiltLines[^1].Length > 0)
                {
                    rebuiltLines.Add(string.Empty);
                }

                rebuiltLines.Add($"***{speaker}***");
                rebuiltLines.Add(string.Empty);
                continue;
            }

            rebuiltLines.Add(line);
        }

        var rebuilt = string.Join("\n", rebuiltLines);
        return Regex.Replace(rebuilt, @"\n{3,}", "\n\n").Trim();
    }

    private static string? NormalizeQuestionContent(string mappedQuestionType, string? questionText, int? questionNumber = null)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return questionText?.Trim();
        }

        var normalized = UnescapeExtractedText(questionText)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        if (mappedQuestionType != "SENTENCE_COMPLETION")
        {
            normalized = NormalizeExtractedSpacing(normalized);
            normalized = RemoveSelectionMarkers(normalized);
            return normalized;
        }

        normalized = NormalizeExtractedSpacing(normalized);
        normalized = RemoveSelectionMarkers(normalized, preserveGapSpacing: true);
        normalized = ReplaceTrailingGapNumberWithPlaceholder(normalized, questionNumber);
        if (BlankPlaceholderRegex().IsMatch(normalized))
        {
            return NormalizeSentenceCompletionSpacing(normalized);
        }

        var withGapPlaceholder = MissingBlankGapRegex().Replace(normalized, " ___ ");
        if (BlankPlaceholderRegex().IsMatch(withGapPlaceholder))
        {
            return NormalizeSentenceCompletionSpacing(withGapPlaceholder);
        }

        normalized = ReplaceInlineGapNumberWithPlaceholder(normalized, questionNumber);
        if (BlankPlaceholderRegex().IsMatch(normalized))
        {
            return NormalizeSentenceCompletionSpacing(normalized);
        }

        if (SentenceEndingPunctuationRegex().IsMatch(normalized))
        {
            return NormalizeSentenceCompletionSpacing(
                SentenceEndingPunctuationRegex().Replace(normalized, " ___$1", 1));
        }

        return NormalizeSentenceCompletionSpacing(normalized + " ___");
    }

    private static string ReplaceTrailingGapNumberWithPlaceholder(string content, int? questionNumber)
    {
        if (string.IsNullOrWhiteSpace(content) || !questionNumber.HasValue)
        {
            return content;
        }

        return Regex.Replace(
            content,
            $@"\s*\b{questionNumber.Value}\b(?<punct>\s*[.?!])?\s*$",
            " ___${punct}",
            RegexOptions.IgnoreCase);
    }

    private static string ReplaceInlineGapNumberWithPlaceholder(string content, int? questionNumber)
    {
        if (string.IsNullOrWhiteSpace(content) || !questionNumber.HasValue)
        {
            return content;
        }

        var matches = Regex.Matches(
            content,
            $@"(?<!\d){Regex.Escape(questionNumber.Value.ToString(CultureInfo.InvariantCulture))}(?!\d)",
            RegexOptions.IgnoreCase);

        foreach (Match match in matches)
        {
            if (!match.Success)
            {
                continue;
            }

            var prefix = content[..match.Index];
            var suffix = content[(match.Index + match.Length)..];
            if (string.IsNullOrWhiteSpace(prefix) || string.IsNullOrWhiteSpace(suffix))
            {
                continue;
            }

            var trimmedPrefix = prefix.TrimEnd();
            var trimmedSuffix = suffix.TrimStart();
            if (trimmedPrefix.Length == 0)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(trimmedSuffix))
            {
                continue;
            }

            var suffixProbe = trimmedSuffix.Length <= 24
                ? trimmedSuffix
                : trimmedSuffix[..24];
            if (BlankPlaceholderRegex().IsMatch(suffixProbe) || Regex.IsMatch(trimmedSuffix, @"^[_\-.]{2,}"))
            {
                continue;
            }

            var precedingTokenMatch = Regex.Match(trimmedPrefix, @"([A-Za-z][A-Za-z'’\-]*|\d{4}s?|\d{4})\s*$");
            if (!precedingTokenMatch.Success)
            {
                continue;
            }

            var normalized = $"{trimmedPrefix} ___ {trimmedSuffix}";
            normalized = Regex.Replace(normalized, @"\s{2,}", " ");
            return normalized.Trim();
        }

        return content;
    }

    private static string UnescapeExtractedText(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        return value
            .Replace("\\r\\n", "\n")
            .Replace("\\n", "\n")
            .Replace("\\r", "\n")
            .Replace("\\t", "\t")
            .Replace("\\\"", "\"");
    }

    private static string NormalizeSentenceCompletionSpacing(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n[ \t]+", "\n");
        normalized = Regex.Replace(normalized, @"\s*___\s*", " ___ ");
        normalized = Regex.Replace(normalized, @"(?:\s*___\s*){2,}", " ___ ");
        normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");
        return normalized.Trim();
    }

    private static string RemoveSelectionMarkers(string value, bool preserveGapSpacing = false)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = SelectionMarkerRegex().Replace(value, " ");
        if (!preserveGapSpacing)
        {
            normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        }

        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n[ \t]+", "\n");
        return normalized.Trim();
    }

    private static string NormalizeExtractedSpacing(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        // Ghép từ bị ngắt dòng bằng dấu gạch nối ở cuối dòng.
        normalized = HyphenatedWordAcrossLinesRegex().Replace(normalized, string.Empty);
        // Với ngắt dòng mềm giữa 2 chữ thường, nối bằng khoảng trắng để tránh dính chữ.
        normalized = SoftLineBreakBetweenLowercaseWordsRegex().Replace(normalized, " ");

        normalized = FixKnownGluedWordsRegex().Replace(
            normalized,
            match => match.Groups["prefix"].Value + " " + match.Groups["suffix"].Value);

        return normalized;
    }

    private static (List<CreateQuestionDto> Questions, string? SharedInstruction, string? AssetsData) NormalizeGroupQuestions(
        string mappedQuestionType,
        List<CreateQuestionDto> sourceQuestions,
        string? preferredInstruction = null,
        string? rawBlockText = null)
    {
        var normalizedQuestions = sourceQuestions
            .Select(question => question with
            {
                Content = NormalizeQuestionBody(mappedQuestionType, question.Content, question.QuestionNumber),
                CorrectAnswer = NormalizeAnswerByGroupType(mappedQuestionType, question.CorrectAnswer)
            })
            .ToList();

        if (string.Equals(mappedQuestionType, "SENTENCE_COMPLETION", StringComparison.Ordinal))
        {
            normalizedQuestions = RepairSentenceCompletionQuestionSet(normalizedQuestions, rawBlockText);
        }

        var sharedInstruction = ExtractSharedInstructionLine(mappedQuestionType, normalizedQuestions);
        var effectiveInstruction = string.IsNullOrWhiteSpace(preferredInstruction)
            ? sharedInstruction
            : preferredInstruction;
        if (!string.IsNullOrWhiteSpace(effectiveInstruction))
        {
            normalizedQuestions = normalizedQuestions
                .Select(question => question with
                {
                    Content = RemoveLeadingInstructionLine(mappedQuestionType, question.Content, effectiveInstruction)
                })
                .ToList();

            normalizedQuestions = normalizedQuestions
                .Select(question => question with
                {
                    Content = NormalizeQuestionBody(mappedQuestionType, question.Content, question.QuestionNumber)
                })
                .ToList();
        }

        if (string.Equals(mappedQuestionType, "MCQ_CHOOSE_N", StringComparison.Ordinal))
        {
            normalizedQuestions = NormalizeChooseNQuestionSet(normalizedQuestions);
        }
        else if (string.Equals(mappedQuestionType, "MCQ_MULTIPLE", StringComparison.Ordinal))
        {
            normalizedQuestions = NormalizeSharedMultiSelectQuestionSet(normalizedQuestions);
        }

        string? assetsData = null;
        if (string.Equals(mappedQuestionType, "FLOWCHART_COMPLETION", StringComparison.Ordinal))
        {
            (normalizedQuestions, assetsData) = NormalizeFlowchartQuestionSet(normalizedQuestions, rawBlockText);
        }

        return (normalizedQuestions, effectiveInstruction, assetsData);
    }

    private static List<CreateQuestionDto> RepairSentenceCompletionQuestionSet(
        List<CreateQuestionDto> questions,
        string? rawBlockText)
    {
        if (questions.Count == 0 || string.IsNullOrWhiteSpace(rawBlockText))
        {
            return questions;
        }

        var orderedQuestionNumbers = questions
            .Select(question => question.QuestionNumber)
            .Where(questionNumber => questionNumber.HasValue)
            .Select(questionNumber => questionNumber!.Value)
            .Distinct()
            .OrderBy(questionNumber => questionNumber)
            .ToList();
        if (orderedQuestionNumbers.Count == 0)
        {
            return questions;
        }

        var source = BuildSentenceCompletionRepairSource(rawBlockText, orderedQuestionNumbers[0]);
        if (string.IsNullOrWhiteSpace(source))
        {
            return questions;
        }

        var anchorMap = LocateSentenceCompletionQuestionAnchors(source, orderedQuestionNumbers);
        if (anchorMap.Count == 0)
        {
            return questions;
        }

        var candidateMap = BuildSentenceCompletionRawCandidateMap(source, orderedQuestionNumbers, anchorMap);
        if (candidateMap.Count == 0)
        {
            return questions;
        }

        return questions
            .Select(question =>
            {
                if (!question.QuestionNumber.HasValue ||
                    !candidateMap.TryGetValue(question.QuestionNumber.Value, out var rawCandidate))
                {
                    return question;
                }

                var normalizedCandidate = NormalizeQuestionBody(
                    "SENTENCE_COMPLETION",
                    rawCandidate,
                    question.QuestionNumber);
                if (!ShouldPreferSentenceCompletionCandidate(question.Content, normalizedCandidate))
                {
                    return question;
                }

                return question with { Content = normalizedCandidate };
            })
            .ToList();
    }

    private static string BuildSentenceCompletionRepairSource(string rawBlockText, int startQuestion)
    {
        var instruction = TryExtractInstructionFromBlockText(rawBlockText, startQuestion);
        var preview = BuildQuestionPreview(rawBlockText, instruction, startQuestion);
        var normalizedRawBlock = NormalizeSentenceCompletionRepairSource(rawBlockText);
        var normalizedPreview = NormalizeSentenceCompletionRepairSource(preview);

        if (string.IsNullOrWhiteSpace(normalizedRawBlock))
        {
            return normalizedPreview;
        }

        if (string.IsNullOrWhiteSpace(normalizedPreview))
        {
            return normalizedRawBlock;
        }

        if (normalizedRawBlock.Contains(normalizedPreview, StringComparison.OrdinalIgnoreCase))
        {
            return normalizedRawBlock;
        }

        if (normalizedPreview.Contains(normalizedRawBlock, StringComparison.OrdinalIgnoreCase))
        {
            return normalizedPreview;
        }

        return string.Join("\n", [normalizedRawBlock, normalizedPreview]);
    }

    private static string NormalizeSentenceCompletionRepairSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return string.Empty;
        }

        source = source
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        source = Regex.Replace(source, @"(?i)\bAccess\s+https?://\S+\b", " ");
        source = Regex.Replace(source, @"(?i)\bhttps?://\S+\b", " ");
        source = Regex.Replace(source, @"(?i)\bfor\s+more\s+practices\b", " ");
        source = Regex.Replace(source, @"(?i)\bpage\s*\d+\b", " ");
        source = Regex.Replace(source, @"[ \t]+\n", "\n");
        source = Regex.Replace(source, @"\n[ \t]+", "\n");
        source = Regex.Replace(source, @"[ \t]{2,}", " ");
        source = Regex.Replace(source, @"\n{3,}", "\n\n");
        return source.Trim();
    }

    private static Dictionary<int, int> LocateSentenceCompletionQuestionAnchors(
        string source,
        IReadOnlyList<int> orderedQuestionNumbers)
    {
        var result = new Dictionary<int, int>();
        var searchIndex = 0;

        foreach (var questionNumber in orderedQuestionNumbers)
        {
            var anchorIndex = FindSentenceCompletionQuestionAnchor(source, questionNumber, searchIndex);
            if (anchorIndex < 0)
            {
                anchorIndex = FindSentenceCompletionQuestionAnchor(source, questionNumber, 0);
            }

            if (anchorIndex < 0)
            {
                continue;
            }

            result[questionNumber] = anchorIndex;
            searchIndex = Math.Min(source.Length, anchorIndex + 1);
        }

        return result;
    }

    private static int FindSentenceCompletionQuestionAnchor(string source, int questionNumber, int startIndex)
    {
        if (string.IsNullOrWhiteSpace(source) || questionNumber <= 0)
        {
            return -1;
        }

        startIndex = Math.Clamp(startIndex, 0, source.Length);
        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var matches = Regex.Matches(
            source[startIndex..],
            $@"(?<!\d){escapedQuestionNumber}(?!\d)",
            RegexOptions.IgnoreCase);

        var bestIndex = -1;
        var bestScore = int.MinValue;
        foreach (Match match in matches)
        {
            if (!match.Success)
            {
                continue;
            }

            var candidateIndex = startIndex + match.Index;
            var score = ScoreSentenceCompletionQuestionAnchor(source, candidateIndex, match.Length);
            if (score > bestScore)
            {
                bestScore = score;
                bestIndex = candidateIndex;
            }
        }

        return bestScore >= 4 ? bestIndex : -1;
    }

    private static int ScoreSentenceCompletionQuestionAnchor(string source, int index, int length)
    {
        if (string.IsNullOrWhiteSpace(source) || index < 0 || index >= source.Length)
        {
            return int.MinValue;
        }

        var previousChar = index > 0 ? source[index - 1] : '\0';
        var nextChar = index + length < source.Length ? source[index + length] : '\0';
        if ("-–—‑−".IndexOf(previousChar) >= 0 || "-–—‑−".IndexOf(nextChar) >= 0)
        {
            return int.MinValue;
        }

        var windowStart = Math.Max(0, index - 24);
        var windowEnd = Math.Min(source.Length, index + length + 24);
        var window = source[windowStart..windowEnd];
        if (QuestionRangeBoundaryRegex().IsMatch(window))
        {
            return int.MinValue;
        }

        var prefix = source[..index].TrimEnd();
        var suffix = source[(index + length)..].TrimStart();
        var score = 0;

        if (Regex.IsMatch(prefix, @"[A-Za-z][A-Za-z'’\-]*\s*$"))
        {
            score += 5;
        }

        if (Regex.IsMatch(suffix, @"^(?:___\b|\(?[A-Za-z][A-Za-z'’\-]*)"))
        {
            score += 5;
        }

        if (previousChar is ' ' or '(' or '[' || char.IsLetter(previousChar))
        {
            score += 2;
        }

        if (nextChar is ' ' or ')' or ']' or '.' or ',' || char.IsLetter(nextChar))
        {
            score += 2;
        }

        if (Regex.IsMatch(window, @"(?i)\bquestions?\s+\d"))
        {
            score -= 10;
        }

        return score;
    }

    private static Dictionary<int, string> BuildSentenceCompletionRawCandidateMap(
        string source,
        IReadOnlyList<int> orderedQuestionNumbers,
        IReadOnlyDictionary<int, int> anchorMap)
    {
        var result = new Dictionary<int, string>();

        for (var index = 0; index < orderedQuestionNumbers.Count; index++)
        {
            var questionNumber = orderedQuestionNumbers[index];
            if (!anchorMap.TryGetValue(questionNumber, out var anchorIndex))
            {
                continue;
            }

            int? nextAnchorIndex = null;
            for (var nextIndex = index + 1; nextIndex < orderedQuestionNumbers.Count; nextIndex++)
            {
                if (anchorMap.TryGetValue(orderedQuestionNumbers[nextIndex], out var resolvedNextAnchorIndex))
                {
                    nextAnchorIndex = resolvedNextAnchorIndex;
                    break;
                }
            }

            var candidate = ExtractSentenceCompletionRawCandidate(source, anchorIndex, nextAnchorIndex);
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            result[questionNumber] = candidate;
        }

        return result;
    }

    private static string? ExtractSentenceCompletionRawCandidate(
        string source,
        int anchorIndex,
        int? nextAnchorIndex)
    {
        if (string.IsNullOrWhiteSpace(source) || anchorIndex < 0 || anchorIndex >= source.Length)
        {
            return null;
        }

        var start = FindSentenceCompletionCandidateStart(source, anchorIndex);
        var end = FindSentenceCompletionCandidateEnd(source, anchorIndex, nextAnchorIndex);
        if (end <= start)
        {
            return null;
        }

        var candidate = source[start..end]
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        candidate = Regex.Replace(candidate, @"[ \t]+\n", "\n");
        candidate = Regex.Replace(candidate, @"\n[ \t]+", "\n");
        candidate = Regex.Replace(candidate, @"[ \t]{2,}", " ");
        candidate = Regex.Replace(candidate, @"\n{3,}", "\n\n");
        candidate = candidate.Trim();

        if (string.IsNullOrWhiteSpace(candidate) || LooksLikeAnyStrongInstructionLine(candidate))
        {
            return null;
        }

        return candidate;
    }

    private static int FindSentenceCompletionCandidateStart(string source, int anchorIndex)
    {
        for (var index = anchorIndex - 1; index >= 0; index--)
        {
            if (IsSentenceCompletionBoundaryChar(source[index]))
            {
                return index + 1;
            }
        }

        return 0;
    }

    private static int FindSentenceCompletionCandidateEnd(string source, int anchorIndex, int? nextAnchorIndex)
    {
        var hardLimit = nextAnchorIndex.HasValue && nextAnchorIndex.Value > anchorIndex
            ? nextAnchorIndex.Value
            : source.Length;

        for (var index = anchorIndex; index < hardLimit; index++)
        {
            if (IsSentenceCompletionBoundaryChar(source[index]))
            {
                return index + 1;
            }
        }

        return hardLimit;
    }

    private static bool IsSentenceCompletionBoundaryChar(char value) =>
        value is '.' or '?' or '!' or '\n' or '\r';

    private static bool ShouldPreferSentenceCompletionCandidate(string? existingContent, string? candidateContent) =>
        ScoreSentenceCompletionCandidate(candidateContent) > ScoreSentenceCompletionCandidate(existingContent);

    private static int ScoreSentenceCompletionCandidate(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return 0;
        }

        var normalized = Regex.Replace(content, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return 0;
        }

        var score = 0;
        if (BlankPlaceholderRegex().IsMatch(normalized))
        {
            score += 8;
            var placeholderIndex = normalized.IndexOf("___", StringComparison.Ordinal);
            if (placeholderIndex > 0)
            {
                score += 2;
            }

            if (placeholderIndex >= 0 && placeholderIndex + 3 < normalized.Length)
            {
                score += 3;
            }
            else
            {
                score -= 1;
            }
        }

        var wordCount = Regex.Matches(normalized, @"[A-Za-z][A-Za-z'’\-]*").Count;
        score += Math.Min(8, wordCount);
        if (wordCount >= 6)
        {
            score += 2;
        }

        if (normalized.Length is >= 24 and <= 220)
        {
            score += 2;
        }
        else if (normalized.Length > 260)
        {
            score -= 4;
        }

        if (LooksLikeAnyStrongInstructionLine(normalized) || QuestionRangeBoundaryRegex().IsMatch(normalized))
        {
            score -= 10;
        }

        return score;
    }

    private static string NormalizeGroupTypeByQuestionCount(
        string mappedQuestionType,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        if (questions.Count <= 1 && string.Equals(mappedQuestionType, "SENTENCE_COMPLETION", StringComparison.Ordinal))
        {
            return "SHORT_ANSWER";
        }

        if (questions.Count <= 1 && string.Equals(mappedQuestionType, "MCQ_CHOOSE_N", StringComparison.Ordinal))
        {
            return "MCQ_MULTIPLE";
        }

        return mappedQuestionType;
    }

    private static (List<CreateQuestionDto> Questions, string? AssetsData) ApplyGroupVisualAssets(
        string mappedQuestionType,
        List<CreateQuestionDto> questions,
        string? assetsData,
        RawQuestionGroupContext? rawContext)
    {
        var previewItems = rawContext?.VisualPreviewItems?
            .Where(item => !string.IsNullOrWhiteSpace(item.ImageDataUrl))
            .ToList();
        if (previewItems is not { Count: > 0 })
        {
            return (questions, assetsData);
        }

        if (string.Equals(mappedQuestionType, "MATCHING_VISUALS", StringComparison.Ordinal))
        {
            return (
                Questions: ApplyMatchingVisualPreviewOptions(questions, previewItems),
                AssetsData: BuildMatchingVisualAssetsData(previewItems, rawContext?.VisualPreviewNote));
        }

        var primaryPreviewItem = previewItems[0];
        if (string.Equals(mappedQuestionType, "FLOWCHART_COMPLETION", StringComparison.Ordinal))
        {
            return (
                Questions: questions,
                AssetsData: BuildFlowchartAssetsData(
                    assetsData,
                    primaryPreviewItem,
                    rawContext?.DiagramPreviewPageNumber ?? primaryPreviewItem.PageNumber,
                    rawContext?.DiagramPreviewNote ?? rawContext?.VisualPreviewNote));
        }

        if (string.Equals(mappedQuestionType, "MAP_LABELLING", StringComparison.Ordinal))
        {
            return (
                Questions: questions,
                AssetsData: BuildMapLabellingAssetsData(
                    primaryPreviewItem,
                    rawContext?.DiagramPreviewPageNumber ?? primaryPreviewItem.PageNumber,
                    rawContext?.DiagramPreviewNote ?? rawContext?.VisualPreviewNote));
        }

        return (questions, assetsData);
    }

    private static List<CreateQuestionDto> ApplyMatchingVisualPreviewOptions(
        List<CreateQuestionDto> questions,
        IReadOnlyList<PdfRawVisualPreviewItemDto> previewItems)
    {
        if (questions.Count == 0 || previewItems.Count == 0)
        {
            return questions;
        }

        var existingOptionCount = questions
            .Select(question => question.Options.Count)
            .DefaultIfEmpty(0)
            .Max();
        var targetOptionCount = Math.Max(existingOptionCount, previewItems.Count);

        return questions
            .Select(question =>
            {
                var answerTokens = SplitAnswerTokens(question.CorrectAnswer);
                var normalizedOptions = Enumerable
                    .Range(0, targetOptionCount)
                    .Select(index =>
                    {
                        var imageUrl = index < previewItems.Count
                            ? previewItems[index].ImageDataUrl
                            : string.Empty;
                        var optionLabel = ((char)('A' + index)).ToString();
                        var isCorrect =
                            answerTokens.Contains(optionLabel) ||
                            (index < question.Options.Count && question.Options[index].IsCorrect);

                        return new CreateQuestionOptionDto(
                            OptionText: imageUrl,
                            ImageUrl: null,
                            IsCorrect: isCorrect,
                            OrderIndex: index);
                    })
                    .ToList();

                return question with { Options = normalizedOptions };
            })
            .ToList();
    }

    private static string BuildFlowchartAssetsData(
        string? currentAssetsData,
        PdfRawVisualPreviewItemDto previewItem,
        int? pageNumber,
        string? note)
    {
        var answerMode = "text_input";
        if (!string.IsNullOrWhiteSpace(currentAssetsData))
        {
            try
            {
                using var document = JsonDocument.Parse(currentAssetsData);
                if (document.RootElement.ValueKind == JsonValueKind.Object &&
                    document.RootElement.TryGetProperty("answerMode", out var answerModeElement))
                {
                    var parsedAnswerMode = answerModeElement.GetString();
                    if (!string.IsNullOrWhiteSpace(parsedAnswerMode))
                    {
                        answerMode = parsedAnswerMode.Trim();
                    }
                }
            }
            catch
            {
                // Ignore malformed legacy assets and rebuild a stable payload.
            }
        }

        return JsonSerializer.Serialize(new FlowchartGroupAssetsData(
            Layout: "flowchart_completion_image",
            ImageUrl: previewItem.ImageDataUrl,
            AnswerMode: answerMode,
            PageNumber: pageNumber,
            Note: note));
    }

    private static string BuildMapLabellingAssetsData(
        PdfRawVisualPreviewItemDto previewItem,
        int? pageNumber,
        string? note) =>
        JsonSerializer.Serialize(new MapLabellingGroupAssetsData(
            Layout: "map_labelling",
            ImageUrl: previewItem.ImageDataUrl,
            Width: 720,
            Zoom: 100,
            PageNumber: pageNumber,
            Note: note));

    private static string BuildMatchingVisualAssetsData(
        IReadOnlyList<PdfRawVisualPreviewItemDto> previewItems,
        string? note) =>
        JsonSerializer.Serialize(new MatchingVisualGroupAssetsData(
            Layout: "matching_visuals",
            Images: previewItems
                .Select(item => item.ImageDataUrl)
                .Where(imageDataUrl => !string.IsNullOrWhiteSpace(imageDataUrl))
                .ToList(),
            PageNumbers: previewItems
                .Select(item => item.PageNumber)
                .Distinct()
                .OrderBy(pageNumber => pageNumber)
                .ToList(),
            Note: note));

    private static (List<CreateQuestionDto> Questions, string? AssetsData) NormalizeFlowchartQuestionSet(
        List<CreateQuestionDto> questions,
        string? rawBlockText)
    {
        if (questions.Count == 0)
        {
            return (questions, null);
        }

        var sharedOptionTexts = questions
            .Select(question => question.Options
                .Select(option => option.OptionText?.Trim())
                .Where(option => !string.IsNullOrWhiteSpace(option))
                .Select(option => option!)
                .ToList())
            .Where(HasMeaningfulMcqOptionSet)
            .OrderByDescending(optionList => optionList.Count)
            .ThenByDescending(optionList => optionList.Sum(text => text.Length))
            .FirstOrDefault();

        if ((sharedOptionTexts is null || sharedOptionTexts.Count == 0) &&
            !string.IsNullOrWhiteSpace(rawBlockText))
        {
            var extractedOptions = ExtractLabeledOptionsFromRawSnippet(rawBlockText, 0);
            if (HasMeaningfulMcqOptionSet(extractedOptions))
            {
                sharedOptionTexts = extractedOptions;
            }
        }

        if (sharedOptionTexts is null || !HasMeaningfulMcqOptionSet(sharedOptionTexts))
        {
            return (questions, null);
        }

        var normalizedQuestions = new List<CreateQuestionDto>(questions.Count);
        foreach (var question in questions)
        {
            var normalizedAnswer = NormalizeFlowchartSharedOptionAnswer(question.CorrectAnswer, sharedOptionTexts);
            var normalizedOptions = BuildOptions(sharedOptionTexts, "FLOWCHART_COMPLETION", normalizedAnswer);

            normalizedQuestions.Add(question with
            {
                Content = ShouldClearFlowchartQuestionContent(question.Content, question.QuestionNumber)
                    ? null
                    : question.Content,
                CorrectAnswer = normalizedAnswer,
                Options = normalizedOptions
            });
        }

        var assetsData = JsonSerializer.Serialize(new FlowchartGroupAssetsData(
            Layout: "flowchart_completion_image",
            ImageUrl: string.Empty,
            AnswerMode: "shared_option_bank"));

        return (normalizedQuestions, assetsData);
    }

    private static string? NormalizeFlowchartSharedOptionAnswer(string? rawAnswer, IReadOnlyList<string> sharedOptionTexts)
    {
        if (string.IsNullOrWhiteSpace(rawAnswer) || sharedOptionTexts.Count == 0)
        {
            return rawAnswer?.Trim();
        }

        var answerTokens = SplitAnswerTokens(rawAnswer);
        var firstLetterToken = answerTokens.FirstOrDefault(token =>
            IsSingleLetterAnswerToken(token) &&
            IsWithinOptionRange(token, sharedOptionTexts.Count));
        if (!string.IsNullOrWhiteSpace(firstLetterToken))
        {
            return firstLetterToken;
        }

        var normalizedRawAnswer = NormalizeToken(RemoveSelectionMarkers(UnescapeExtractedText(rawAnswer.Trim())));
        var stripOptionLabelPrefix = ShouldStripOptionLabelPrefix("FLOWCHART_COMPLETION", sharedOptionTexts);

        for (var index = 0; index < sharedOptionTexts.Count; index++)
        {
            var optionLabel = ((char)('A' + index)).ToString();
            var normalizedOptionText = NormalizeToken(
                NormalizeOptionTextForDisplay(sharedOptionTexts[index], index, stripOptionLabelPrefix));
            if (string.Equals(normalizedRawAnswer, normalizedOptionText, StringComparison.Ordinal) ||
                answerTokens.Contains(normalizedOptionText))
            {
                return optionLabel;
            }
        }

        return rawAnswer.Trim();
    }

    private static bool ShouldClearFlowchartQuestionContent(string? content, int? questionNumber)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return true;
        }

        var normalized = Regex.Replace(content, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return true;
        }

        if (questionNumber.HasValue &&
            Regex.IsMatch(normalized, $@"^(?:Q\s*)?{questionNumber.Value}\s*(?:[.):\-]|_{{2,}}|\.\.\.|…|\s)*$", RegexOptions.IgnoreCase))
        {
            return true;
        }

        return Regex.IsMatch(normalized, @"^(?:Q\s*)?\d{1,2}\s*$", RegexOptions.IgnoreCase);
    }

    private static bool ShouldStartNewQuestionGroup(QuestionGroupBuilder currentGroup, string? boundaryToken)
    {
        if (string.IsNullOrWhiteSpace(boundaryToken))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(currentGroup.BoundaryToken))
        {
            return currentGroup.Questions.Count > 0;
        }

        return !string.Equals(currentGroup.BoundaryToken, boundaryToken, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractExplicitGroupBoundaryToken(string mappedQuestionType, string? questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return null;
        }

        var lines = questionText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();
        if (lines.Count == 0)
        {
            return null;
        }

        var firstLine = lines[0].Trim();
        var rangeMatch = QuestionRangeBoundaryRegex().Match(firstLine);
        if (rangeMatch.Success)
        {
            var start = ParseOcrQuestionNumber(rangeMatch.Groups["start"].Value);
            var end = ParseOcrQuestionNumber(rangeMatch.Groups["end"].Value);
            if (start > 0 && end >= start)
            {
                return $"RANGE:{start}-{end}";
            }
        }

        var instructionLine = ExtractStrongInstructionLine(mappedQuestionType, lines);
        return string.IsNullOrWhiteSpace(instructionLine)
            ? null
            : $"INSTR:{NormalizeToken(instructionLine)}";
    }

    private static string ResolveGroupInstruction(string mappedQuestionType, string? sharedInstruction)
    {
        if (!string.IsNullOrWhiteSpace(sharedInstruction) &&
            mappedQuestionType is not "MCQ_SINGLE")
        {
            return sharedInstruction.Trim();
        }

        return BuildInstruction(mappedQuestionType);
    }

    private static string? BuildGroupContentData(
        string mappedQuestionType,
        string? sharedInstruction,
        List<CreateQuestionDto> questions)
    {
        if (string.Equals(mappedQuestionType, "MCQ_MULTIPLE", StringComparison.Ordinal) &&
            questions.Count > 1)
        {
            for (var index = 0; index < questions.Count; index++)
            {
                questions[index] = questions[index] with { Content = string.Empty };
            }

            return BuildListeningMultiSelectContentData(string.Empty);
        }

        if (!string.Equals(mappedQuestionType, "SENTENCE_COMPLETION", StringComparison.Ordinal))
        {
            return null;
        }

        if (questions.Count <= 1)
        {
            return null;
        }

        var templateLines = questions
            .OrderBy(question => question.QuestionNumber ?? int.MaxValue)
            .Select(BuildSentenceCompletionTemplateLine)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();

        if (templateLines.Count == 0)
        {
            return null;
        }

        for (var index = 0; index < questions.Count; index++)
        {
            questions[index] = questions[index] with { Content = null };
        }

        return string.Join("\n", templateLines);
    }

    private static string BuildListeningMultiSelectContentData(string prompt)
    {
        var payload = new
        {
            layout = "listening_multi_select",
            prompt = prompt ?? string.Empty
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    private static string BuildSentenceCompletionTemplateLine(CreateQuestionDto question)
    {
        var content = question.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content) || !question.QuestionNumber.HasValue)
        {
            return string.Empty;
        }

        var placeholderToken = $"[Q{question.QuestionNumber.Value}]";
        if (content.Contains(placeholderToken, StringComparison.Ordinal))
        {
            return content;
        }

        if (BlankPlaceholderRegex().IsMatch(content))
        {
            return BlankPlaceholderRegex().Replace(content, placeholderToken, 1);
        }

        return $"{content} {placeholderToken}".Trim();
    }

    private static string? NormalizeQuestionBody(string mappedQuestionType, string? questionText, int? questionNumber)
    {
        var normalized = NormalizeQuestionContent(mappedQuestionType, questionText, questionNumber);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        var cleaned = normalized
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        cleaned = RemoveLeadingQuestionRangeHeading(cleaned) ?? string.Empty;

        if (questionNumber.HasValue)
        {
            cleaned = Regex.Replace(
                cleaned,
                $@"^\s*{questionNumber.Value}\s*[).:\-]?\s*",
                string.Empty,
                RegexOptions.IgnoreCase);
        }

        if (mappedQuestionType is "MATCHING_HEADINGS" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MCQ_CHOOSE_N")
        {
            cleaned = LeadingQuestionNumberRegex().Replace(cleaned, string.Empty, 1);
        }

        return cleaned.Trim();
    }

    private static string? NormalizeAnswerByGroupType(string mappedQuestionType, string? rawAnswer)
    {
        if (string.IsNullOrWhiteSpace(rawAnswer))
        {
            return rawAnswer?.Trim();
        }

        if (mappedQuestionType is not "MCQ_CHOOSE_N" and not "MCQ_MULTIPLE")
        {
            return rawAnswer.Trim();
        }

        var normalizedTokens = SplitAnswerTokens(rawAnswer)
            .Select(token => token.Trim())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => IsSingleLetterAnswerToken(token) ? token.ToUpperInvariant() : token)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return normalizedTokens.Count == 0
            ? rawAnswer.Trim()
            : string.Join("|", normalizedTokens);
    }

    private static string? ExtractSharedInstructionLine(
        string mappedQuestionType,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        if (questions.Count < 2)
        {
            return null;
        }

        var firstLines = questions
            .Select(question => GetFirstMeaningfulLine(question.Content))
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => line!.Trim())
            .ToList();

        if (firstLines.Count < 2)
        {
            return null;
        }

        var mostCommon = firstLines
            .GroupBy(line => line, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ThenByDescending(group => group.Key.Length)
            .FirstOrDefault();

        if (mostCommon is null)
        {
            return ExtractLeadingInstructionLineFromFirstQuestion(mappedQuestionType, questions);
        }

        var minimumRequired = Math.Max(2, (int)Math.Ceiling(questions.Count * 0.6d));
        if (mostCommon.Count() < minimumRequired)
        {
            return ExtractLeadingInstructionLineFromFirstQuestion(mappedQuestionType, questions);
        }

        var candidate = mostCommon.First().Trim();
        if (!LooksLikeInstructionLine(mappedQuestionType, candidate))
        {
            return ExtractLeadingInstructionLineFromFirstQuestion(mappedQuestionType, questions);
        }

        return candidate;
    }

    private static string? ExtractLeadingInstructionLineFromFirstQuestion(
        string mappedQuestionType,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        if (questions.Count < 2)
        {
            return null;
        }

        var lines = GetMeaningfulLines(questions[0].Content);
        var instructionLines = ExtractLeadingInstructionLines(mappedQuestionType, lines);
        if (instructionLines.Count == 0)
        {
            return null;
        }

        return string.Join(" ", instructionLines)
            .Replace("  ", " ")
            .Trim();
    }

    private static string? GetFirstMeaningfulLine(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var lines = text
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return lines.FirstOrDefault();
    }

    private static List<string> GetMeaningfulLines(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        return text
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => line.Trim())
            .ToList();
    }

    private static string? ExtractStrongInstructionLine(string mappedQuestionType, IReadOnlyList<string> lines)
    {
        var instructionLines = ExtractLeadingInstructionLines(mappedQuestionType, lines);
        return instructionLines.Count == 0
            ? null
            : instructionLines[0];
    }

    private static List<string> ExtractLeadingInstructionLines(string mappedQuestionType, IReadOnlyList<string> lines)
    {
        if (lines.Count == 0)
        {
            return [];
        }

        var result = new List<string>();
        var instructionStarted = false;

        foreach (var line in lines)
        {
            if (QuestionRangeBoundaryRegex().IsMatch(line))
            {
                continue;
            }

            if (LeadingQuestionNumberRegex().IsMatch(line) ||
                LooksLikeQuestionBodyLine(line) ||
                TryParseLabeledOptionLine(line, out _, out _))
            {
                break;
            }

            if (!instructionStarted)
            {
                if (!LooksLikeStrongInstructionLine(mappedQuestionType, line))
                {
                    break;
                }

                result.Add(line.Trim());
                instructionStarted = true;
                continue;
            }

            if (AccessOrPageNoiseRegex().IsMatch(line) ||
                ReviewSectionHeadingRegex().IsMatch(line) ||
                LooseAnswerSectionHeadingRegex().IsMatch(line))
            {
                break;
            }

            result.Add(line.Trim());
        }

        return result;
    }

    private static bool LooksLikeInstructionLine(string mappedQuestionType, string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        if (mappedQuestionType is "MATCHING_HEADINGS" &&
            (line.Contains("paragraph", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("heading", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (mappedQuestionType is "MCQ_CHOOSE_N" &&
            (line.Contains("following", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("in any order", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("corresponding letters", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return SharedInstructionLineRegex().IsMatch(line);
    }

    private static bool LooksLikeStrongInstructionLine(string mappedQuestionType, string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        if (ChooseCorrectAnswerOrAnswersRegex().IsMatch(line) ||
            ChooseNStatementsInstructionRegex().IsMatch(line) ||
            FillInBlankInstructionRegex().IsMatch(line) ||
            MatchingInfoInstructionRegex().IsMatch(line) ||
            MatchingHeadingsInstructionRegex().IsMatch(line) ||
            ContainsTfngInstruction(line) ||
            ContainsYnngInstruction(line))
        {
            return true;
        }

        if (mappedQuestionType == "MCQ_CHOOSE_N" &&
            (line.Contains("choose", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("letters", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("following statements", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (mappedQuestionType == "SENTENCE_COMPLETION" &&
            (line.Contains("complete the following", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("no more than", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    private static bool LooksLikeAnyStrongInstructionLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        return ChooseCorrectAnswerOrAnswersRegex().IsMatch(line) ||
               ChooseNStatementsInstructionRegex().IsMatch(line) ||
               FillInBlankInstructionRegex().IsMatch(line) ||
               MatchingInfoInstructionRegex().IsMatch(line) ||
               MatchingHeadingsInstructionRegex().IsMatch(line) ||
               ContainsTfngInstruction(line) ||
               ContainsYnngInstruction(line) ||
               (line.Contains("choose", StringComparison.OrdinalIgnoreCase) &&
                line.Contains("letters", StringComparison.OrdinalIgnoreCase));
    }

    private static bool LooksLikeQuestionBodyLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var normalized = Regex.Replace(line, @"\s+", " ").Trim();
        if (normalized.Contains("___", StringComparison.Ordinal))
        {
            return true;
        }

        if (!Regex.IsMatch(normalized, @"\b\d{1,2}\b\s*[.?!]?\s*$"))
        {
            return false;
        }

        var prefix = Regex.Replace(normalized, @"\b\d{1,2}\b\s*[.?!]?\s*$", string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return false;
        }

        var wordCount = Regex.Matches(prefix, @"[A-Za-z][A-Za-z'’\-]*").Count;
        return wordCount >= 4;
    }

    private static string? RemoveLeadingInstructionLine(string mappedQuestionType, string? questionContent, string sharedInstruction)
    {
        if (string.IsNullOrWhiteSpace(questionContent) || string.IsNullOrWhiteSpace(sharedInstruction))
        {
            return questionContent?.Trim();
        }

        var withoutRangeHeading = RemoveLeadingQuestionRangeHeading(questionContent)?.Trim();
        var directlyRemoved = TryRemoveInstructionPrefix(withoutRangeHeading, sharedInstruction);
        if (!string.Equals(directlyRemoved, withoutRangeHeading, StringComparison.Ordinal))
        {
            return directlyRemoved;
        }

        var lines = GetMeaningfulLines(questionContent);
        if (lines.Count == 0)
        {
            return questionContent?.Trim();
        }

        if (QuestionRangeBoundaryRegex().IsMatch(lines[0]))
        {
            lines.RemoveAt(0);
        }

        if (lines.Count == 0)
        {
            return questionContent?.Trim();
        }

        var instructionLines = ExtractLeadingInstructionLines(mappedQuestionType, lines);
        if (instructionLines.Count == 0)
        {
            return RemoveLeadingQuestionRangeHeading(questionContent)?.Trim();
        }

        var normalizedSharedInstruction = Regex.Replace(sharedInstruction, @"\s+", " ").Trim();
        var normalizedDetectedInstruction = Regex.Replace(string.Join(" ", instructionLines), @"\s+", " ").Trim();
        if (!string.Equals(normalizedSharedInstruction, normalizedDetectedInstruction, StringComparison.OrdinalIgnoreCase) &&
            !normalizedDetectedInstruction.StartsWith(normalizedSharedInstruction, StringComparison.OrdinalIgnoreCase))
        {
            return RemoveLeadingQuestionRangeHeading(questionContent)?.Trim();
        }

        lines = lines.Skip(instructionLines.Count).ToList();
        return string.Join('\n', lines).Trim();
    }

    private static string TryRemoveInstructionPrefix(string? questionContent, string sharedInstruction)
    {
        if (string.IsNullOrWhiteSpace(questionContent) || string.IsNullOrWhiteSpace(sharedInstruction))
        {
            return questionContent?.Trim() ?? string.Empty;
        }

        var normalizedContent = Regex.Replace(questionContent, @"\s+", " ").Trim();
        var normalizedInstruction = Regex.Replace(sharedInstruction, @"\s+", " ").Trim();
        if (!normalizedContent.StartsWith(normalizedInstruction, StringComparison.OrdinalIgnoreCase))
        {
            return questionContent.Trim();
        }

        return normalizedContent[normalizedInstruction.Length..].Trim();
    }

    private static string? RemoveLeadingQuestionRangeHeading(string? questionContent)
    {
        if (string.IsNullOrWhiteSpace(questionContent))
        {
            return questionContent?.Trim();
        }

        var normalized = questionContent
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var lines = normalized
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        if (lines.Count == 0)
        {
            return normalized;
        }

        if (!QuestionRangeBoundaryRegex().IsMatch(lines[0]))
        {
            return normalized;
        }

        lines.RemoveAt(0);
        return lines.Count == 0
            ? string.Empty
            : string.Join('\n', lines).Trim();
    }

    private static List<CreateQuestionDto> NormalizeChooseNQuestionSet(List<CreateQuestionDto> questions)
    {
        if (questions.Count == 0)
        {
            return questions;
        }

        var normalizedQuestions = questions
            .Select(question => question with
            {
                CorrectAnswer = NormalizeAnswerByGroupType("MCQ_CHOOSE_N", question.CorrectAnswer)
            })
            .ToList();

        var optionSets = normalizedQuestions
            .Select(question => question.Options
                .Select(option => RemoveSelectionMarkers(option.OptionText?.Trim() ?? string.Empty))
                .Where(option => !string.IsNullOrWhiteSpace(option))
                .ToList())
            .ToList();

        var sharedOptionTexts = optionSets
            .Where(optionList => optionList.Count > 0)
            .OrderByDescending(optionList => optionList.Count)
            .ThenByDescending(optionList => optionList.Sum(text => text.Length))
            .FirstOrDefault();

        if (sharedOptionTexts is null || sharedOptionTexts.Count == 0)
        {
            return normalizedQuestions;
        }

        var distinctOptionSignatures = optionSets
            .Where(optionList => optionList.Count > 0)
            .Select(optionList => string.Join(
                "\u001F",
                optionList.Select(option => NormalizeToken(option))))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var hasSingleSharedOptionBank = distinctOptionSignatures.Count <= 1;
        if (!hasSingleSharedOptionBank)
        {
            return normalizedQuestions;
        }

        for (var index = 0; index < normalizedQuestions.Count; index++)
        {
            var question = normalizedQuestions[index];
            var currentOptionTexts = optionSets[index];
            var needsSharedOptions = currentOptionTexts.Count == 0 ||
                                     currentOptionTexts.All(IsOptionLabelOnly) ||
                                     currentOptionTexts.Count < sharedOptionTexts.Count;
            if (!needsSharedOptions)
            {
                continue;
            }

            normalizedQuestions[index] = question with
            {
                Options = BuildOptions(sharedOptionTexts, "MCQ_CHOOSE_N", question.CorrectAnswer)
            };
        }

        return normalizedQuestions;
    }

    private static List<CreateQuestionDto> NormalizeSharedMultiSelectQuestionSet(List<CreateQuestionDto> questions)
    {
        if (questions.Count == 0)
        {
            return questions;
        }

        var normalizedQuestions = questions
            .Select(question => question with
            {
                CorrectAnswer = NormalizeAnswerByGroupType("MCQ_MULTIPLE", question.CorrectAnswer)
            })
            .ToList();

        var sharedOptionTexts = normalizedQuestions
            .Select(question => question.Options
                .Select(option => RemoveSelectionMarkers(option.OptionText?.Trim() ?? string.Empty))
                .Where(option => !string.IsNullOrWhiteSpace(option))
                .ToList())
            .Where(optionList => optionList.Count > 0)
            .OrderByDescending(optionList => optionList.Count)
            .ThenByDescending(optionList => optionList.Sum(text => text.Length))
            .FirstOrDefault();

        if (sharedOptionTexts is null || sharedOptionTexts.Count == 0)
        {
            return normalizedQuestions;
        }

        for (var index = 0; index < normalizedQuestions.Count; index++)
        {
            normalizedQuestions[index] = normalizedQuestions[index] with
            {
                Options = BuildOptions(sharedOptionTexts, "MCQ_MULTIPLE", normalizedQuestions[index].CorrectAnswer)
            };
        }

        return normalizedQuestions;
    }

    private static List<CreateQuestionOptionDto> BuildOptions(
        List<string>? rawOptions,
        string mappedQuestionType,
        string? answer)
    {
        var options = rawOptions?
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Select(option => RemoveSelectionMarkers(UnescapeExtractedText(option.Trim())))
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .ToList() ?? [];

        if (options.Count == 0 && string.Equals(mappedQuestionType, "TFNG", StringComparison.Ordinal))
        {
            options = ["TRUE", "FALSE", "NOT GIVEN"];
        }
        else if (options.Count == 0 && string.Equals(mappedQuestionType, "YNNG", StringComparison.Ordinal))
        {
            options = ["YES", "NO", "NOT GIVEN"];
        }

        if (!IsOptionBasedType(mappedQuestionType))
        {
            return [];
        }

        var answerTokens = SplitAnswerTokens(answer);
        var result = new List<CreateQuestionOptionDto>(options.Count);
        var stripOptionLabelPrefix = ShouldStripOptionLabelPrefix(mappedQuestionType, options);

        for (var i = 0; i < options.Count; i++)
        {
            var optionText = NormalizeOptionTextForDisplay(options[i], i, stripOptionLabelPrefix);
            if (IsMcqType(mappedQuestionType) && IsOptionLabelOnly(optionText))
            {
                optionText = string.Empty;
            }

            var optionLabel = ((char)('A' + i)).ToString();
            var normalizedOptionText = NormalizeToken(optionText);
            var isCorrect =
                answerTokens.Contains(optionLabel) ||
                answerTokens.Contains(normalizedOptionText) ||
                answerTokens.Any(token =>
                    token.StartsWith(optionLabel + ".", StringComparison.Ordinal) ||
                    token.StartsWith(optionLabel + " ", StringComparison.Ordinal));

            result.Add(new CreateQuestionOptionDto(
                OptionText: optionText,
                ImageUrl: null,
                IsCorrect: isCorrect,
                OrderIndex: i));
        }

        return result;
    }

    private static bool ShouldStripOptionLabelPrefix(string mappedQuestionType, IReadOnlyList<string> options)
    {
        if (mappedQuestionType is not "MCQ_SINGLE" and not "MCQ_MULTIPLE" and not "MCQ_CHOOSE_N" and not "FLOWCHART_COMPLETION")
        {
            return false;
        }

        if (options.Count < 2)
        {
            return false;
        }

        var labeledCount = 0;
        foreach (var option in options)
        {
            if (OptionStartsWithLetterLabelRegex().IsMatch(option) ||
                OptionStartsWithLetterSpaceRegex().IsMatch(option))
            {
                labeledCount++;
            }
        }

        return labeledCount >= Math.Max(2, options.Count / 2);
    }

    private static string NormalizeOptionTextForDisplay(string optionText, int optionIndex, bool stripLabelPrefix)
    {
        if (string.IsNullOrWhiteSpace(optionText))
        {
            return optionText;
        }

        var expectedLabel = ((char)('A' + optionIndex)).ToString();
        var text = RemoveSelectionMarkers(optionText).Trim();

        if (!stripLabelPrefix)
        {
            return NormalizeExtractedSpacing(text).Trim();
        }

        var labeledMatch = OptionStartsWithLetterLabelRegex().Match(text);
        if (labeledMatch.Success &&
            string.Equals(labeledMatch.Groups["label"].Value, expectedLabel, StringComparison.OrdinalIgnoreCase))
        {
            text = labeledMatch.Groups["text"].Value.Trim();
        }
        else
        {
            var spacedLabelMatch = OptionStartsWithLetterSpaceRegex().Match(text);
            if (spacedLabelMatch.Success &&
                string.Equals(spacedLabelMatch.Groups["label"].Value, expectedLabel, StringComparison.OrdinalIgnoreCase))
            {
                text = spacedLabelMatch.Groups["text"].Value.Trim();
            }
        }

        // Trường hợp OCR cho ra "A A ..." => bỏ nhãn trùng lần 2.
        var duplicateLabelMatch = OptionStartsWithLetterSpaceRegex().Match(text);
        if (duplicateLabelMatch.Success &&
            string.Equals(duplicateLabelMatch.Groups["label"].Value, expectedLabel, StringComparison.OrdinalIgnoreCase))
        {
            text = duplicateLabelMatch.Groups["text"].Value.Trim();
        }

        return NormalizeExtractedSpacing(text).Trim();
    }

    private static HashSet<string> SplitAnswerTokens(string? answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return [];
        }

        var tokens = Regex.Split(answer, @"\s*(?:\||,|/|;|&|\band\b)\s*", RegexOptions.IgnoreCase)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => NormalizeToken(token))
            .ToHashSet(StringComparer.Ordinal);

        return tokens;
    }

    private static int? ParseQuestionNumber(string? rawQuestionNumber)
    {
        if (string.IsNullOrWhiteSpace(rawQuestionNumber))
        {
            return null;
        }

        var match = Regex.Match(rawQuestionNumber, @"\d+");
        if (!match.Success)
        {
            return null;
        }

        return int.TryParse(match.Value, out var number) ? number : null;
    }

    private static string NormalizeToken(string value) =>
        Regex.Replace(value.Trim(), @"\s+", " ").ToUpperInvariant();

    private static string? ReadJsonAsText(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.ToString(),
        JsonValueKind.True => bool.TrueString,
        JsonValueKind.False => bool.FalseString,
        JsonValueKind.Undefined or JsonValueKind.Null => null,
        _ => element.ToString()
    };

    private static List<string> ExtractOptions(JsonElement optionsElement)
    {
        if (optionsElement.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return [];
        }

        if (optionsElement.ValueKind != JsonValueKind.Array)
        {
            var fallbackOption = ReadJsonAsText(optionsElement);
            if (string.IsNullOrWhiteSpace(fallbackOption))
            {
                return [];
            }

            var normalizedFallbackOption = RemoveSelectionMarkers(fallbackOption.Trim());
            return string.IsNullOrWhiteSpace(normalizedFallbackOption) ? [] : [normalizedFallbackOption];
        }

        var options = new List<string>();
        foreach (var item in optionsElement.EnumerateArray())
        {
            var optionValue = item.ValueKind switch
            {
                JsonValueKind.String => item.GetString(),
                JsonValueKind.Number => item.ToString(),
                JsonValueKind.True => bool.TrueString,
                JsonValueKind.False => bool.FalseString,
                JsonValueKind.Object => ReadOptionObject(item),
                _ => null
            };

            if (!string.IsNullOrWhiteSpace(optionValue))
            {
                var normalizedOptionValue = RemoveSelectionMarkers(optionValue.Trim());
                if (!string.IsNullOrWhiteSpace(normalizedOptionValue))
                {
                    options.Add(normalizedOptionValue);
                }
            }
        }

        return options;
    }

    private static string? ReadOptionObject(JsonElement optionObject)
    {
        var label = TryReadOptionProperty(optionObject, "label");
        var text =
            TryReadOptionProperty(optionObject, "text") ??
            TryReadOptionProperty(optionObject, "content") ??
            TryReadOptionProperty(optionObject, "statement") ??
            TryReadOptionProperty(optionObject, "value");
        var optionText = TryReadOptionProperty(optionObject, "optionText");

        // Ưu tiên text đầy đủ, tránh trường hợp optionText chỉ là "A/B/C".
        if (!string.IsNullOrWhiteSpace(text) && !IsSingleLetterOptionLabel(text))
        {
            return text;
        }

        if (!string.IsNullOrWhiteSpace(optionText))
        {
            if (!IsSingleLetterOptionLabel(optionText) || string.IsNullOrWhiteSpace(text))
            {
                return optionText;
            }
        }

        if (!string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        if (!string.IsNullOrWhiteSpace(label))
        {
            return label;
        }

        return optionObject.ToString();
    }

    private static string? TryReadOptionProperty(JsonElement optionObject, string propertyName)
    {
        if (!optionObject.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return ReadJsonAsText(value);
    }

    private static bool IsSingleLetterOptionLabel(string value)
    {
        var normalized = value.Trim().Trim('.', ')', ':').ToUpperInvariant();
        return normalized.Length == 1 && normalized[0] is >= 'A' and <= 'Z';
    }

    private static bool IsOptionBasedType(string mappedQuestionType) =>
        mappedQuestionType is "MCQ_SINGLE" or "MCQ_MULTIPLE" or "MCQ_CHOOSE_N" or "TFNG" or "YNNG" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MATCHING_HEADINGS" or "FLOWCHART_COMPLETION";

    private static string BuildInstruction(string mappedQuestionType) => mappedQuestionType switch
    {
        "MCQ_SINGLE" => "Choose the correct answer.",
        "MCQ_MULTIPLE" => "Choose all correct answers.",
        "MCQ_CHOOSE_N" => "Choose the correct answer or answers for each question.",
        "TFNG" => "Do the following statements agree with the information in the passage? (TRUE/FALSE/NOT GIVEN)",
        "YNNG" => "Do the following statements agree with the writer's claims? (YES/NO/NOT GIVEN)",
        "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MATCHING_HEADINGS" => "Match each statement with the correct option.",
        "FLOWCHART_COMPLETION" => "Complete the flowchart with the correct answers.",
        "SENTENCE_COMPLETION" => "Complete the sentences with words from the passage.",
        _ => "Answer the following questions."
    };

    private static string ResolveMappedQuestionType(string? rawGroupType, string aiMappedQuestionType)
    {
        var normalizedRawGroupType = NormalizeGroupType(rawGroupType);
        if (string.IsNullOrWhiteSpace(normalizedRawGroupType))
        {
            return aiMappedQuestionType;
        }

        if (string.Equals(normalizedRawGroupType, aiMappedQuestionType, StringComparison.Ordinal))
        {
            return normalizedRawGroupType;
        }

        // AI question typing is more trustworthy than raw heuristics when the raw parser
        // falls back to a completion type but the AI found an explicit matching / choose-N / TFNG pattern.
        if (normalizedRawGroupType is "SENTENCE_COMPLETION" or "SUMMARY_COMPLETION" &&
            aiMappedQuestionType is "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MATCHING_HEADINGS" or "MCQ_CHOOSE_N" or "MCQ_MULTIPLE" or "TFNG" or "YNNG")
        {
            return aiMappedQuestionType;
        }

        // The AI mapper defaults to MCQ_SINGLE for unknown values, so keep the raw type when AI is generic.
        if (aiMappedQuestionType == "MCQ_SINGLE" && normalizedRawGroupType != "MCQ_SINGLE")
        {
            return normalizedRawGroupType;
        }

        return normalizedRawGroupType;
    }

    private static string MapQuestionType(string? rawQuestionType)
    {
        var normalized = NormalizeQuestionTypeToken(rawQuestionType);

        return normalized switch
        {
            "MULTIPLECHOICE" => "MCQ_SINGLE",
            "MULTIPLECHOICESINGLE" => "MCQ_SINGLE",
            "MCQSINGLE" => "MCQ_SINGLE",
            "MCQMULTIPLE" => "MCQ_MULTIPLE",
            "MULTIPLECHOICEMULTIPLE" => "MCQ_MULTIPLE",
            "MCQCHOOSEN" => "MCQ_CHOOSE_N",
            "MULTIPLECHOICECHOOSEN" => "MCQ_CHOOSE_N",
            "TRUEFALSENOTGIVEN" => "TFNG",
            "YESNONOTGIVEN" => "YNNG",
            "FILLINBLANKS" => "SENTENCE_COMPLETION",
            "FILLINBLANK" => "SENTENCE_COMPLETION",
            "SENTENCECOMPLETION" => "SENTENCE_COMPLETION",
            "MATCHING" => "MATCHING_INFO",
            "MATCHINGINFO" => "MATCHING_INFO",
            "MATCHINGINFORMATION" => "MATCHING_INFO",
            "MATCHINGFEATURES" => "MATCHING_FEATURES",
            "MATCHINGVISUALS" => "MATCHING_VISUALS",
            "MATCHINGDRAWINGS" => "MATCHING_VISUALS",
            "MATCHINGIMAGES" => "MATCHING_VISUALS",
            "MATCHINGHEADINGS" => "MATCHING_HEADINGS",
            "FLOWCHARTCOMPLETION" => "FLOWCHART_COMPLETION",
            "MAPLABELLING" => "MAP_LABELLING",
            "MAPLABELING" => "MAP_LABELLING",
            "DIAGRAMLABELLING" => "MAP_LABELLING",
            "DIAGRAMLABELING" => "MAP_LABELLING",
            _ => "MCQ_SINGLE"
        };
    }

    private static string BuildVirtualPdfUrl(string fileName)
    {
        var safeFileName = Regex.Replace(fileName.Trim(), @"[^a-zA-Z0-9\.\-_]", "_");
        return $"upload://pdf/{Guid.NewGuid():N}/{safeFileName}";
    }

    private static string BuildUserPrompt(string passageText) => $$"""
        Dưới đây là văn bản thô của một phần thi IELTS Reading. Hãy phân tích và trả về cấu trúc JSON theo đúng định dạng sau:

        {
          "passage_title": "Tiêu đề bài đọc",
          "passage_content": "Toàn bộ nội dung bài đọc, chia thành các đoạn văn bằng ký tự xuống dòng \n\n",
          "questions": [
            {
              "question_number": "Số thứ tự câu hỏi (ví dụ: 1, 2, 3...)",
              "question_type": "Loại câu hỏi (MultipleChoice / MultipleChoiceMultiple / MultipleChoiceChooseN / TrueFalseNotGiven / YesNoNotGiven / FillInBlanks / MatchingInfo / MatchingHeadings / MatchingFeatures / MatchingVisuals / FlowchartCompletion / MapLabelling)",
              "question_text": "Nội dung câu hỏi",
              "options": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C"],
              "answer": "Đáp án chính xác được trích xuất (nếu văn bản có đính kèm đáp án)",
              "explanation": "Giải thích ngắn vì sao chọn đáp án, lấy từ Review and Explanations nếu có, nếu không có thì để chuỗi rỗng"
            }
          ]
        }

        QUY TẮC CỨNG:
        - Bạn chỉ là bộ máy trích xuất dữ liệu, KHÔNG phải thí sinh làm bài.
        - QUY TRÌNH XỬ LÝ CÂU HỎI VÀ CHIA NHÓM: BẮT BUỘC tuân thủ theo đúng thứ tự BƯỚC 1 -> BƯỚC 2 -> BƯỚC 3 dưới đây, không được đảo thứ tự.
        - BƯỚC 1 - XÁC ĐỊNH RANH GIỚI NHÓM BẰNG TỪ KHÓA: BẮT BUỘC dùng cụm "Questions X-Y" trong raw text để làm mốc cắt group. Có bao nhiêu cụm "Questions X-Y" thì tạo bấy nhiêu group. TUYỆT ĐỐI không được gộp 18-22 với 23-26.
        - BƯỚC 2 - TÁCH BẠCH INSTRUCTION VÀ ĐỀ BÀI: ngay bên dưới "Questions X-Y" là instruction của group. PHẢI copy nguyên văn instruction này vào field instruction của group. PHẢI dừng lấy instruction ngay khi gặp số thứ tự câu hỏi đầu tiên (ví dụ 31). KHÔNG ĐƯỢC nhét instruction vào question_text của câu đầu tiên.
        - BƯỚC 3 - XỬ LÝ MCQ_CHOOSE_N: nếu group "Questions X-Y" có NHIỀU câu con đánh số và mỗi câu yêu cầu chọn đáp án đúng/các đáp án đúng, PHẢI giữ toàn bộ dải đó trong MỘT GROUP DUY NHẤT có question_type = MultipleChoiceChooseN. KHÔNG ĐƯỢC xé thành nhiều group nhỏ khác loại. Trong group đó, các câu con 18,19,20,21,22 vẫn phải giữ nguyên numbering riêng theo schema hiện tại. Nếu block dùng chung một answer bank A-H/A-F thì mọi câu cùng dùng shared options đó; nếu mỗi câu có option riêng thì phải giữ option riêng cho từng câu.
        - IGNORE GLOBAL HEADER: TUYỆT ĐỐI KHÔNG dùng cụm "Questions X-Y" nếu nó nằm trong câu mồi kiểu "You should spend about 20 minutes..." hoặc "...which are based on Reading Passage..." vì đó không phải instruction block thật.
        - TAG CLUSTER RULE: nếu raw text bị dính kiểu "Questions 27-29Questions 30-34", phải coi toàn bộ dải tag liên tiếp đó là một cụm heading; instruction nằm sau tag cuối cùng của cụm, không nằm giữa passage.
        - STOP POINT RULE: khi cắt instruction, phải dừng NGAY trước số thứ tự câu hỏi đầu tiên kể cả khi bị dính chữ như "27What", "14but", hoặc "1 ".
        - SANITY CHECK: nếu phần instruction vừa bóc dài trên 1000 ký tự thì coi như đã bắt nhầm passage/content và phải bỏ cụm đó để tìm cụm "Questions X-Y" tiếp theo.
        - Giữ nguyên thứ tự câu hỏi gốc, không bỏ sót câu.
        - Giữ nguyên thứ tự lựa chọn A/B/C/... đúng như đề gốc, không được đảo vị trí.
        - Với passage_content: chỉ giữ ngắt đoạn thật bằng "\n\n"; mọi xuống dòng đơn bị đứt giữa câu phải nối lại bằng khoảng trắng để frontend tự word-wrap.
        - Với passage_content: dùng Markdown cho định dạng (ví dụ **A.** cho đầu đoạn cần nhấn mạnh), không chèn HTML.
        - Các phần chữ cần nhấn mạnh trong nguồn (in đậm/in nghiêng) phải map sang Markdown tương ứng (**bold**, *italic*), không bỏ mất định dạng.
        - Với passage có nhãn đoạn A./B./C....: bắt buộc format theo mẫu `**A.**` rồi xuống dòng mới tới nội dung đoạn.
        - passage_content phải DỪNG NGAY khi bắt đầu phần câu hỏi (Questions..., Do the following statements..., Choose the correct answer..., Solution:, Review and Explanations...).
        - Tuyệt đối không để lọt footer/rác như "Access https://...", "page 3" vào passage_content.
        - QUY TẮC CHIA NHÓM CÂU HỎI (GROUP BOUNDARY): mỗi khi thấy tiêu đề "Questions X-Y", BẮT BUỘC đóng group hiện tại và mở một group mới chỉ cho đúng dải X-Y đó.
        - Nếu giữa tiêu đề "Questions X-Y" và câu hỏi thực tế có footer/rác như "Access https://...", "page 7", vẫn phải coi đó là cùng một block mới; bỏ qua hoàn toàn các dòng rác chen giữa.
        - TUYỆT ĐỐI KHÔNG gộp hai dải khác nhau thành một group lớn (ví dụ cấm gộp 18-22 và 23-26 thành group 18-26).
        - Phân tích question_type độc lập cho từng group "Questions X-Y"; question_type của group sau không được ghi đè group trước.
        - Với câu có cụm "Which paragraph contains", question_type bắt buộc là MatchingInfo (không phải MatchingHeadings).
        - Với nhóm instruction kiểu "The text has ... paragraphs (A-G)", ưu tiên phân loại MatchingHeadings.
        - Với câu có cụm "Choose the correct answer or answers", nếu group chỉ có 1 câu thì question_type bắt buộc là MultipleChoiceMultiple; nếu group có nhiều câu con đánh số thì question_type bắt buộc là MultipleChoiceChooseN.
        - Với nhóm instruction kiểu "FIVE of the following statements are true... in any order", question_type bắt buộc là MultipleChoiceChooseN.
        - Ký tự checkbox/ô vuông như "☐", "☑", "☒", "□" chỉ là rác layout PDF; phải bỏ qua hoàn toàn khi xác định question_type và khi trích xuất option text.
        - QUY TẮC CHỐNG LỆCH SỐ CÂU: với dạng Choose N statements cho dải câu (ví dụ 18-22), BẮT BUỘC tách thành từng câu RIÊNG (18, 19, 20, 21, 22), không gộp thành một câu range.
        - Trong cùng block Choose N statements, question_text và danh sách options (A-H) của các câu có thể giống nhau; answer của từng câu phải map tuần tự theo Answer Key (ví dụ 18:A, 19:C, 20:D, 21:E, 22:H).
        - Nếu group 18-22 là MultipleChoiceChooseN thì phải giữ nguyên MultipleChoiceChooseN cho toàn group đó, kể cả khi group 23-26 phía sau là MultipleChoiceMultiple.
        - OPTION TEXT MANDATORY: với MultipleChoiceChooseN, mảng options TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ chứa chữ cái trần "A", "B", "C", "D"...; mỗi option bắt buộc phải có đầy đủ nội dung text.
        - Nếu raw text của block MultipleChoiceChooseN bị dính kiểu "A B C D E F G H" và đây là shared answer bank của group, BẠN BẮT BUỘC phải kéo xuống phần "Review and Explanations" để khôi phục đầy đủ nội dung của từng option.
        - Trả về ["A", "B", "C"] hoặc checkbox không có text bên cạnh là LỖI NGHIÊM TRỌNG; output đúng phải có dạng ["A. ...", "B. ...", "C. ..."] hoặc text đầy đủ tương đương.
        - Không được làm thay đổi/sụp số thứ tự câu hỏi; phải giữ nguyên numbering như văn bản nguồn.
        - Nếu một block là TRUE/FALSE/NOT GIVEN thì toàn block phải cùng loại TrueFalseNotGiven; không tự đổi sang YesNoNotGiven.
        - Không được lặp lại instruction chung vào từng question_text; question_text chỉ chứa nội dung riêng của câu đó.
        - Với dạng chọn letter, options phải là nội dung đầy đủ, không chỉ trả nhãn A/B/C.
        - Nếu options bị thiếu nội dung (chỉ còn nhãn A/B/C hoặc rỗng), bắt buộc dò trong phần Review and Explanations của cùng passage để khôi phục.
        - Cấm tuyệt đối tạo options rỗng cho câu MCQ (MCQ_SINGLE/MCQ_MULTIPLE/MCQ_CHOOSE_N).
        - Với MultipleChoiceChooseN, mỗi question là một câu con riêng trong cùng group; mỗi question có thể có 1 hoặc nhiều đáp án đúng. Nếu block dùng chung một answer bank thì options có thể giống nhau giữa các câu; nếu không thì mỗi câu giữ option riêng.
        - QUY TẮC SỐNG CÒN CHO MCQ: TUYỆT ĐỐI KHÔNG BAO GIỜ được tạo option rỗng (chỉ có A/B/C không có nội dung).
        - Nếu text câu hỏi bị mất nội dung options, BẮT BUỘC kéo xuống "Review and Explanations" để khôi phục text cho TẤT CẢ options trước khi sang câu tiếp theo.
        - LUẬT CHỐNG LỖI DÍNH CỘT PDF: nếu thấy cụm nhãn bị gom kiểu "A B C D E F G H" rồi sau đó là một khối câu dính liền, phải tự tách khối câu thành các mệnh đề riêng (dựa vào dấu chấm câu/chữ hoa đầu câu) và map tuần tự vào A, B, C, D... theo đúng thứ tự.
        - Ví dụ: "A B C D Câu một.Câu hai.Câu ba.Câu bốn." => ["A. Câu một.", "B. Câu hai.", "C. Câu ba.", "D. Câu bốn."].
        - CẢNH BÁO LỖI LẮP SAI OPTIONS: tuyệt đối không lắp text option của câu này sang câu khác.
        - Khi khôi phục options phải bám đúng question_number, đối chiếu đúng phần review/explanations của chính câu đó.
        - Không tự thêm bớt lựa chọn (ví dụ đề chỉ A,B,C thì không được tạo thêm D).
        - Ví dụ dạng "So, the answer ... must be A. mornings" => phải khôi phục option A là "mornings" cho câu tương ứng.
        - Với dạng điền từ/câu hoàn thành, phải giữ dấu chỗ trống bằng "___" đúng vị trí trong câu hỏi.
        - Tuyệt đối không tự giải đề hay tự suy luận đáp án.
        - Answer phải lấy ưu tiên từ "Review and Explanations".
        - Nghiêm cấm dùng chuỗi "Solution:" bị dính chữ (ví dụ 1C2D3F... hoặc 1822A,C,D,E,H) làm nguồn đáp án.
        - Explanation phải trích xuất từ phần Review and Explanations; không tự bịa hoặc tự viết mới.
        - Không paraphrase đáp án điền từ; phải giữ nguyên đúng từ trong nguồn.
        - Tự động sửa lỗi dính chữ do OCR/PDF (missing spaces), ví dụ "tolearn" -> "to learn", nhưng không đổi nghĩa.

        Nội dung văn bản thô cần xử lý:
        {{passageText}}
        """;

    private static string BuildGemmaCompatiblePrompt(string passageText) => $$"""
        {{SystemPrompt}}

        ---

        {{BuildUserPrompt(passageText)}}
        """;

    private static string BuildRawReviewStructurePrompt(
        string rawText,
        IReadOnlyList<string> deterministicPassages,
        string answerZone,
        string reviewZone)
    {
        var candidatePassages = deterministicPassages.Count == 0
            ? "[NONE]"
            : string.Join(
                "\n\n---\n\n",
                deterministicPassages.Select((passage, index) =>
                    $"[PASSAGE_CANDIDATE_{index + 1}]\n{passage}"));

        return $$"""
            Bạn là hệ thống review text thô IELTS Reading sau khi scan PDF.

            Nhiệm vụ:
            1. Từ text thô và các candidate có sẵn, chia tài liệu thành 3 passage nếu có thể.
            2. Tách riêng phần solution/answer section.
            3. Tách riêng phần review and explanations nếu có.

            Trả về DUY NHẤT JSON thuần với schema:
            {
              "passages": [
                {
                  "passage_number": 1,
                  "title": "Reading Passage 1",
                  "question_range": "Questions 1-13",
                  "raw_text": "exact raw text for the full passage block"
                }
              ],
              "solution_section_raw": "exact raw text",
              "review_section_raw": "exact raw text"
            }

            Quy tắc bắt buộc:
            - Copy nguyên văn raw_text từ nguồn, không paraphrase.
            - Nếu title không rõ, dùng "Reading Passage X".
            - Nếu question_range không chắc, để chuỗi rỗng.
            - solution_section_raw chỉ chứa phần solution/answer key, CHỈ gồm đáp án; không được nuốt sang review/explanations.
            - review_section_raw chỉ chứa phần review/explanations.
            - Không thêm markdown fence, không giải thích.

            RAW_TEXT:
            {{rawText}}

            DETERMINISTIC_PASSAGE_CANDIDATES:
            {{candidatePassages}}

            DETERMINISTIC_SOLUTION_SECTION:
            {{answerZone}}

            DETERMINISTIC_REVIEW_SECTION:
            {{reviewZone}}
            """;
    }

    private static string BuildPassageQuestionGroupReviewPrompt(
        PdfRawReviewPassageSeedDto passage,
        IReadOnlyList<QuestionGroupReviewContextBlock> reviewBlocks)
    {
        var deterministicGroupSeeds = reviewBlocks.Count == 0
            ? "[NONE]"
            : string.Join(
                "\n\n---\n\n",
                reviewBlocks.Select(block => $$"""
                    TAGS: {{block.Tags}}
                    INSTRUCTION: {{block.Instruction}}
                    QUESTION_PREVIEW:
                    {{block.QuestionPreview ?? "[EMPTY]"}}
                    HEURISTIC_GROUP_TYPE: {{block.HeuristicGroupType ?? "[UNKNOWN]"}}
                    HEURISTIC_EVIDENCE: {{block.TypeEvidence ?? "[NONE]"}}
                    """));

        return $$"""
        Bạn là hệ thống bóc instruction IELTS Reading từ text thô của MỘT passage.

        Trả về DUY NHẤT JSON thuần với schema:
        {
          "question_groups": [
            {
              "start_question": 1,
              "end_question": 4,
              "tags": "Questions 1-4",
              "instruction": "Complete the summary below. Choose NO MORE THAN TWO WORDS...",
              "group_type": "SUMMARY_COMPLETION",
              "question_preview": "14 plant ... 15 ... A B C D ...",
              "type_evidence": "Detected from instruction + actual question wording + option layout."
            }
          ]
        }

        Quy tắc:
        - Chỉ extract instruction của nhóm câu hỏi, không lấy nội dung câu hỏi.
        - Bỏ qua global header kiểu "You should spend about 20 minutes..."
        - Nếu gặp cụm dính như "Questions 1-4Questions 5-6", phải tách đúng boundary.
        - instruction phải dừng ngay trước câu đầu tiên.
        - group_type phải được xác định bằng CẢ 3 nguồn: instruction, nội dung câu hỏi, và options/layout trong question block. KHÔNG được nhìn instruction một mình.
        - TAXONOMY RULE BẮT BUỘC:
          + Nếu instruction có chữ "summary" NHƯNG câu trả lời phải tự điền trực tiếp từ passage, không có word bank/options/list sẵn, hãy map về SENTENCE_COMPLETION.
          + Chỉ map SUMMARY_COMPLETION khi block "summary" có answer bank sẵn như list of words / answers from the box / write the correct letter A-F.
          + Cụm "Write the correct letter A-F" một mình KHÔNG đủ để map MATCHING_FEATURES. Nếu block là summary + word bank thì vẫn phải là SUMMARY_COMPLETION.
        - Nếu question block có list A-H/CATEGORY và câu hỏi dạng classify/match, phải cân nhắc MATCHING_FEATURES.
        - Nếu instruction kiểu "Choose one drawing (A-D) to match each ..." hoặc tương tự, có lựa chọn là hình/drawing/diagram/figure/projection dùng chung cho nhiều câu, hãy map MATCHING_VISUALS, không gộp vào MATCHING_FEATURES.
        - Nếu instruction là "Complete each sentence with the correct ending, A-E below" hoặc tương tự, và bên dưới có shared option list A-E/A-H cho nhiều câu, PHẢI coi đó là matching-type. Trong hệ thống này hãy map về MATCHING_FEATURES, KHÔNG được gán SENTENCE_COMPLETION.
        - Nếu instruction là "Choose ONE phrase from the list below (A-G) to complete each of the following sentences" hoặc tương tự, có shared phrase list và câu đánh số bên dưới, cũng phải coi là matching-type. Trong hệ thống này hãy map về MATCHING_FEATURES, KHÔNG được gán SENTENCE_COMPLETION.
        - Nếu question block có nhiều câu con đánh số và mỗi câu là dạng multiple choice, phải cân nhắc MCQ_CHOOSE_N. Shared option list A-H chỉ là một trường hợp con, không phải điều kiện bắt buộc.
        - Nếu instruction kiểu "According to the text, FIVE of the following statements are true. Write the corresponding letters in answer boxes ... in any order", phải map MCQ_CHOOSE_N, KHÔNG được map SUMMARY_COMPLETION.
        - Nếu instruction kiểu "Choose two letters, A-E" / "Choose three letters" / "Choose the correct answer or answers": nếu group chỉ có 1 câu thì map MCQ_MULTIPLE; nếu group có nhiều câu con đánh số thì map MCQ_CHOOSE_N.
        - Nếu instruction nêu rõ "write TRUE / FALSE / NOT GIVEN" hoặc "write YES / NO / NOT GIVEN", phải ưu tiên map TFNG hoặc YNNG trước các loại completion như TABLE_COMPLETION.
        - Chỉ map TFNG hoặc YNNG khi instruction hoặc answer labels nêu rõ TRUE/FALSE/NOT GIVEN hoặc YES/NO/NOT GIVEN. Không được map TFNG/YNNG chỉ vì block bị lẫn token từ phần khác.
        - group_type ưu tiên các loại: MATCHING_HEADINGS, MATCHING_INFO, MATCHING_FEATURES, MATCHING_VISUALS, MCQ_SINGLE, MCQ_MULTIPLE, MCQ_CHOOSE_N, SENTENCE_COMPLETION, SUMMARY_COMPLETION, TABLE_COMPLETION, FLOWCHART_COMPLETION, SHORT_ANSWER, TFNG, YNNG.
        - `question_preview` phải chứa snippet ngắn từ chính câu hỏi/options mà bạn dùng để phân loại type.
        - `type_evidence` phải nói ngắn gọn vì sao type đó được chọn dựa trên question/options.
        - Không thêm markdown fence, không giải thích.

        PASSAGE_NUMBER: {{passage.PassageNumber}}
        PASSAGE_TITLE: {{passage.Title}}
        QUESTION_RANGE_HINT: {{passage.QuestionRange}}

        DETERMINISTIC_GROUP_SEEDS:
        {{deterministicGroupSeeds}}

        PASSAGE_RAW_TEXT:
        {{passage.RawText}}
        """;
    }

    private static string BuildAnswerSectionReviewPrompt(string solutionSectionRaw) => $$"""
        Bạn là hệ thống bóc đáp án IELTS Reading từ text thô của phần solution/answer key.

        Trả về DUY NHẤT JSON thuần với schema:
        {
          "answers": [
            {
              "question_number": 1,
              "answer": "A"
            }
          ]
        }

        Quy tắc:
        - Chỉ lấy đáp án có trong nguồn.
        - answer giữ nguyên đúng text nguồn.
        - Nếu phần source chứa review/explanations dài dòng thì chỉ lấy đáp án, không copy giải thích vào answer.
        - Nếu một câu không có đáp án rõ ràng thì không trả câu đó.
        - Không giải thích, không markdown fence.

        SOLUTION_SECTION_RAW:
        {{solutionSectionRaw}}
        """;

    private static string BuildExplanationSectionReviewPrompt(string reviewSectionRaw) => $$"""
        Bạn là hệ thống bóc explanation IELTS Reading từ text thô của phần Review and Explanations.

        Trả về DUY NHẤT JSON thuần với schema:
        {
          "explanations": [
            {
              "question_number": 1,
              "answer": "A",
              "explanation": "exact explanation text from source"
            }
          ]
        }

        Quy tắc:
        - explanation phải bám đúng text nguồn, không tự viết mới.
        - Nếu có đáp án đi kèm thì map vào answer.
        - Nếu một câu không có explanation rõ ràng thì không trả câu đó.
        - Không giải thích ngoài JSON, không markdown fence.

        REVIEW_SECTION_RAW:
        {{reviewSectionRaw}}
        """;

    private const string SystemPrompt =
        """
        Bạn là hệ thống trích xuất dữ liệu IELTS Reading từ PDF.

        Yêu cầu BẮT BUỘC:

        Trả về kết quả duy nhất dưới dạng JSON thuần túy.
        Không giải thích, không thêm markdown/json fence, không thêm bất kỳ văn bản nào ngoài chuỗi JSON.
        CHỈ được phép trích xuất dữ liệu; TUYỆT ĐỐI không đóng vai thí sinh làm bài.
        QUY TRÌNH XỬ LÝ CÂU HỎI VÀ CHIA NHÓM: BẮT BUỘC tuân thủ theo đúng thứ tự BƯỚC 1 -> BƯỚC 2 -> BƯỚC 3.
        BƯỚC 1 - XÁC ĐỊNH RANH GIỚI NHÓM: dùng cụm "Questions X-Y" trong raw text làm group boundary duy nhất. Có bao nhiêu "Questions X-Y" thì phải có bấy nhiêu group. TUYỆT ĐỐI không gộp 18-22 với 23-26.
        BƯỚC 2 - TÁCH INSTRUCTION: dòng instruction nằm ngay dưới "Questions X-Y" phải được copy nguyên văn vào instruction của group. PHẢI dừng instruction khi gặp số thứ tự câu hỏi đầu tiên. KHÔNG ĐƯỢC nhét instruction vào question_text của câu đầu tiên.
        BƯỚC 3 - XỬ LÝ MCQ_CHOOSE_N: nếu một dải "Questions X-Y" có NHIỀU câu con đánh số và mỗi câu yêu cầu chọn đáp án đúng/các đáp án đúng, toàn bộ dải X-Y phải ở trong MỘT GROUP DUY NHẤT có question_type = MultipleChoiceChooseN. Không được xé dải đó thành nhiều group nhỏ khác loại. Các câu con bên trong group vẫn giữ numbering riêng (ví dụ 18,19,20,21,22). Nếu block dùng chung một answer bank A-H/A-F thì các câu trong group cùng chia sẻ answer bank đó; nếu mỗi câu có option riêng thì phải giữ option riêng cho từng câu.
        IGNORE GLOBAL HEADER: TUYỆT ĐỐI KHÔNG dùng cụm "Questions X-Y" nếu nó nằm trong câu mồi kiểu "You should spend about 20 minutes..." hoặc "...which are based on Reading Passage..." vì đó không phải instruction block thật.
        TAG CLUSTER RULE: nếu raw text bị dính kiểu "Questions 27-29Questions 30-34", phải coi toàn bộ dải tag liên tiếp đó là một cụm heading; instruction nằm sau tag cuối cùng của cụm.
        STOP POINT RULE: khi cắt instruction, phải dừng NGAY trước số thứ tự câu hỏi đầu tiên kể cả khi bị dính chữ như "27What", "14but", hoặc "1 ".
        SANITY CHECK: nếu instruction bóc ra dài trên 1000 ký tự thì coi như đã bắt nhầm passage/content và phải bỏ cụm đó.
        Nghiêm cấm tự suy luận đáp án từ passage.
        Mọi "answer" phải bám 100% theo Review and Explanations nếu có.
        Nếu không có đáp án rõ ràng trong nguồn, "answer" phải là chuỗi rỗng.
        Nghiêm cấm dùng chuỗi "Solution:" bị dính chữ (ví dụ 1C2D3F... hoặc 1822A,C,D,E,H) làm nguồn đáp án.
        Nếu có phần giải thích trong Review and Explanations thì phải map vào field "explanation" cho đúng số câu; nếu không có thì để chuỗi rỗng.
        Nếu options bị thiếu (chỉ còn A/B/C hoặc rỗng), bắt buộc tìm lại trong Review and Explanations.
        Với dạng Choose N statements theo dải câu (ví dụ 18-22), phải trả ra từng câu riêng đúng số thứ tự 18, 19, 20, 21, 22; không gộp thành một câu.
        Không được làm lệch numbering của câu hỏi so với văn bản nguồn.
        Với câu MCQ, options không được rỗng; nếu thiếu phải phục hồi từ Review and Explanations.
        QUY TẮC SỐNG CÒN CHO MCQ: nghiêm cấm trả option dạng nhãn trống "A"/"B"/"C" không có text.
        Nếu phần câu hỏi bị rớt text option do OCR/cột, bắt buộc đối chiếu chéo Review and Explanations để khôi phục đủ text cho từng option.
        Nếu gặp cụm nhãn dính cột kiểu "A B C D ... + khối câu dính", phải tự tách khối câu và map tuần tự vào từng nhãn theo thứ tự.
        CẢNH BÁO LỖI LẮP SAI OPTIONS: không được hoán đổi options giữa các câu; phải đối chiếu đúng theo question_number của chính câu đó.
        Không tự ý thêm/bớt option so với cấu trúc gốc của câu hỏi.
        Phân loại question_type theo instruction gốc:
        - "Which paragraph contains" => MatchingInfo.
        - "Choose the correct answer." => MultipleChoice.
        - "Choose the correct answer or answers" => nếu chỉ có 1 câu thì MultipleChoiceMultiple; nếu cùng instruction đó áp cho nhiều câu con trong cùng dải thì MultipleChoiceChooseN.
        - Block TRUE/FALSE/NOT GIVEN phải đồng nhất, không tự đổi sang YES/NO/NOT GIVEN.
        - FEW-SHOT TEMPLATE CẮT INSTRUCTION: raw "Complete the following sentences using NO MORE THAN THREE WORDS... Another example ... is 31" => instruction phải là "Complete the following sentences using NO MORE THAN THREE WORDS..." và question 31 phải là "Another example ... is ___".
        - FEW-SHOT TEMPLATE MCQ_CHOOSE_N: nếu raw "A B C D E F G H McCarthy claims... The cost... Most British..." là shared answer bank của cả group, options phải bung ra thành ["A. McCarthy claims ...", "B. The cost ...", "C. Most British ...", ...], không được để label trống.
        Giữ nguyên thứ tự câu hỏi và thứ tự options như đề gốc.
        Với passage_content, chỉ giữ ngắt đoạn thật bằng "\n\n"; xuống dòng đơn giữa câu phải nối lại thành khoảng trắng.
        passage_content phải dùng Markdown cho định dạng in đậm/in nghiêng khi cần, không dùng HTML.
        Các phần chữ nhấn mạnh trong nguồn phải được giữ lại bằng Markdown (**bold**, *italic*), không làm mất format.
        Với passage có nhãn đoạn A./B./C....: phải trả về dạng `**A.**` rồi xuống dòng mới tới nội dung đoạn.
        passage_content phải dừng ngay trước phần Questions/Solution/Review and Explanations.
        Không để lọt footer/rác như "Access https://..." hoặc "page 3" vào passage_content.
        Mỗi khi gặp heading "Questions X-Y", phải đóng block trước và mở block mới cho đúng dải X-Y đó; tuyệt đối không gộp 2 heading khác nhau thành một block lớn.
        Nếu có footer/rác như "Access https://..." hoặc "page 7" chen giữa heading "Questions X-Y" và câu đầu tiên, vẫn phải giữ nguyên boundary của block mới và bỏ qua các dòng rác.
        Phân tích question_type độc lập cho từng block "Questions X-Y"; block sau không được làm đổi question_type của block trước.
        Ký tự checkbox/ô vuông như "☐", "☑", "☒", "□" chỉ là rác layout PDF, không mang nghĩa câu hỏi hay option.
        OPTION TEXT MANDATORY: với MultipleChoiceChooseN, options TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ là "A", "B", "C"... mà phải có text đầy đủ cho từng option.
        Nếu raw text chỉ còn "A B C D E F G H" và block thật sự dùng shared answer bank, BẠN BẮT BUỘC phải kéo xuống "Review and Explanations" để khôi phục nguyên văn nội dung từng option.
        Việc trả về options rỗng, label-only, hoặc checkbox-only cho MultipleChoiceChooseN là LỖI NGHIÊM TRỌNG.
        Sửa lỗi dính chữ do OCR/PDF khi hiển nhiên (missing spaces), không thay đổi nghĩa.
        """;

    [GeneratedRegex(@"(?im)^\s*reading\s*passage\s*(?<number>[1-3]|one|two|three)\b")]
    private static partial Regex ReadingPassageRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))reading\s*passage\s*(?<number>[1-3]|one|two|three)(?=\b|[A-Z])")]
    private static partial Regex InlineReadingPassageRegex();

    [GeneratedRegex(@"(?im)^\s*(?:reading\s+)?passage\s*(?<number>[1-3]|one|two|three)\b")]
    private static partial Regex FallbackPassageRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))(?:reading\s+)?passage\s*(?<number>[1-3]|one|two|three)(?=\b|[A-Z])")]
    private static partial Regex InlineFallbackPassageRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer\s*key(?:s)?|answers?|solution(?:s)?|đáp\s*án)\s*[:\-]?\s*(?:\([^)]+\))?\s*$")]
    private static partial Regex SolutionSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer(?:\s*key(?:s)?)?|answers?|solution(?:s)?)\b.*$")]
    private static partial Regex LooseSolutionSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer\s*key(?:s)?|answers?|solution(?:s)?|review\s+and\s+explanations?|explanation(?:s)?|đáp\s*án)\s*[:\-]?\s*(?:\([^)]+\))?\s*$")]
    private static partial Regex AnswerSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer(?:\s*key(?:s)?)?|answers?|solution(?:s)?|review\s+and\s+explanations?|explanation(?:s)?)\b.*$")]
    private static partial Regex LooseAnswerSectionHeadingRegex();

    [GeneratedRegex(@"(?is)\bsolution\s*:\s*(?=\s*(?:\d|Q|question\b|answer\b|TRUE|FALSE|YES|NO|NOT\b|[A-Za-z]))")]
    private static partial Regex InlineSolutionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*review\s+and\s+explanations?\b.*$")]
    private static partial Regex ReviewSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*question\s+\d{1,2}\b")]
    private static partial Regex ExplanationQuestionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:question\s*)?(?<number>\d{1,2})\s*[).:\-]\s*")]
    private static partial Regex ExplanationBlockStartRegex();

    [GeneratedRegex(@"(?is)(?<!\d)(?<range>Q?\s*\d{1,2}(?:\s*(?:to|[-–—])\s*Q?\s*\d{1,2})?)\s*Answer\s*:\s*(?<raw>.*?)(?=(?<!\d)Q?\s*\d{1,2}(?:\s*(?:to|[-–—])\s*Q?\s*\d{1,2})?\s*Answer\s*:|$)")]
    private static partial Regex ReviewAnswerEntryRegex();

    [GeneratedRegex(@"(?ix)
        (?<=[A-Za-z0-9])
        (?=
            The\s+keywords?|
            Keywords?\s*in\s*Questions?|
            Similar\s*words?\s*in\s*Passage|
            In\s+this\s+question|
            From\s+these|
            At\s+paragraph|
            According\s+to|
            Throughout\s+the\s+passage|
            Q\s*\d+\s*:|
            Q\s*\d+\s*(?:to|[-–—])\s*Q?\s*\d+\b|
            Note\s*:|
            page\s*\d+\b|
            Access\s+https?://
        )")]
    private static partial Regex GluedReviewMarkerRegex();

    [GeneratedRegex(@"(?ix)
        \b(
            The\s+keywords?|
            Keywords?\s*in\s*Questions?|
            Similar\s*words?\s*in\s*Passage|
            In\s+this\s+question|
            From\s+these|
            At\s+paragraph|
            According\s+to|
            Throughout\s+the\s+passage|
            Q\s*\d+\s*:|
            Q\s*\d+\s*(?:to|[-–—])\s*Q?\s*\d+\b|
            Note\s*:|
            page\s*\d+\b|
            Access\s+https?://
        )")]
    private static partial Regex ReviewExplanationMarkerRegex();

    [GeneratedRegex(@"(?im)^\s*(?:\d{1,2}\s*[).:\-]\s*[A-Za-z0-9][^\n]*|\d{1,2}\s+[A-Za-z][^\n]*)$")]
    private static partial Regex AnswerEntryLineRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))Questions?\s*(?<start>[0-9OoIl\|]{1,2})\s*(?:-|–|—|‑|−|to)\s*(?<end>[0-9OoIl\|]{1,2})\b")]
    private static partial Regex QuestionRangeBoundaryRegex();

    [GeneratedRegex(@"(?i)\bQuestion\s*(?<number>[0-9OoIl\|]{1,3})(?=\b|[A-Za-z])")]
    private static partial Regex SingleQuestionBoundaryRegex();

    [GeneratedRegex(@"(?im)^\s*(?:you\s+should\s+spend\s+about\s+\d+\s+minutes?.*|which\s+are\s+based\s+on\s+reading\s+passage\s+\d+.*|write\s+your\s+answers?.*|on\s+your\s+answer\s+sheet.*|access\s+https?://\S+.*|https?://\S*ieltsonlinetests\.com\S*.*|page\s*\d+\s*)$")]
    private static partial Regex PassageNoiseLineRegex();

    [GeneratedRegex(@"(?im)^\s*(?:you\s+should\s+spend\s+about\s+\d+\s+minutes?\s+on\s+)?questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,3}\s*,?\s*which\s+are\s+based\s+on\s*(?:this\s+passage|reading\s+passage\s*[0-9OoIl\|]{1,2}\s+below)\.?\s*$")]
    private static partial Regex PassageQuestionIntroLineRegex();

    [GeneratedRegex(@"(?i)\b(?:page\s*\d+\s*)?(?:access\s+https?://|https?://\S*ieltsonlinetests\.com)\b")]
    private static partial Regex InlinePassageFooterNoiseRegex();

    [GeneratedRegex(@"(?im)^\s*(?:questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,2}\b|question\s*[0-9OoIl\|]{1,2}\b|do\s+the\s+following\s+statements\b|complete\s+the\s+following\s+sentences\b|according\s+to\s+the\s+information\s+given\b|for\s+each\s+question\b|in\s+boxes?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,2}\b|the\s+text\s+has\s+\d+\s+paragraphs?\b|choose\s+the\s+required\s+letters\b|choose\s+the\s+correct\s+answer(?:\s+or\s+answers?)?\b|solution\s*:|review\s+and\s+explanations?\b)\b.*$")]
    private static partial Regex PassageQuestionBoundaryLineRegex();

    [GeneratedRegex(@"(?<!\b[A-Z]\.)(?<=[\.\?!""'”’\)\]])\s*(?=(?:\*\*)?[A-H](?:\s*[).:\-]|[.])?(?:\*\*)?\s+)")]
    private static partial Regex CollapsedPassageParagraphBoundaryRegex();

    [GeneratedRegex(@"(?m)(?<=\b[A-Z])\.\s*\n\s*(?=[A-Z]\.)")]
    private static partial Regex BrokenAbbreviationAcrossLinesRegex();

    [GeneratedRegex(@"(?m)^\s*\*\*(?<label>[A-H])(?:\s*[).:\-]|[.])?\s*\*\*\s*(?<text>\S.*)$")]
    private static partial Regex MarkdownLabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)^\s*(?<label>[A-H])(?:(?:\s*[).:\-]|[.])\s*|\s+)(?<text>\S.*)$")]
    private static partial Regex LabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)^\s*\*\*(?<label>[A-H])(?:\s*[).:\-]|[.])?\s*\*\*\s*$")]
    private static partial Regex StandaloneMarkdownLabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)^\s*(?<label>[A-H])(?:\s*[).:\-]|[.])?\s*$")]
    private static partial Regex StandaloneLabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)(?<!^)(?<!\n\n)(?=^\*\*[A-H](?:\s*[).:\-]|[.])?\s*\*\*)")]
    private static partial Regex MissingBlankLineBeforeLabeledPassageRegex();

    [GeneratedRegex(@"(?<quote>[’'""”])\s+(?<speaker>[A-Z][\p{L}'’\.-]+(?:\s+[A-Z][\p{L}'’\.-]+){1,6}\s+\((?:[^()\n]{3,220})\))")]
    private static partial Regex InlineSpeakerAttributionRegex();

    [GeneratedRegex(@"^\s*(?:\*\*\*)?(?<speaker>[A-Z][\p{L}'’\.-]+(?:\s+[A-Z][\p{L}'’\.-]+){1,6}\s+\((?:[^()\n]{3,220})\))(?:\*\*\*)?\s*$")]
    private static partial Regex SpeakerSignatureLineRegex();

    [GeneratedRegex(@"(?m)^[\s\u200B-\u200D\uFEFF]*(?:\*{2,}|_{2,})\s+(?=\S)")]
    private static partial Regex OrphanLeadingMarkdownMarkerRegex();

    [GeneratedRegex(@"(?m)(?<=\S)\s+(?:\*{2,}|_{2,})\s*$")]
    private static partial Regex OrphanTrailingMarkdownMarkerRegex();

    [GeneratedRegex(@"^\s*```(?:json)?\s*|\s*```\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex JsonFenceRegex();

    [GeneratedRegex(@"""passage_content""\s*:\s*""", RegexOptions.IgnoreCase)]
    private static partial Regex PassageContentStartRegex();

    [GeneratedRegex(@"""\s*,\s*""questions""\s*:", RegexOptions.IgnoreCase)]
    private static partial Regex PassageContentEndRegex();

    [GeneratedRegex(@"'(?<key>[A-Za-z_][A-Za-z0-9_]*)'\s*:")]
    private static partial Regex SingleQuotedPropertyRegex();

    [GeneratedRegex(@"(?<=\{|,)\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*:")]
    private static partial Regex UnquotedPropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*(""(?:[A-Za-z_][A-Za-z0-9_]*)""\s*:)")]
    private static partial Regex MissingCommaBeforePropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*([A-Za-z_][A-Za-z0-9_]*\s*:)")]
    private static partial Regex MissingCommaBeforeUnquotedPropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*('(?:[A-Za-z_][A-Za-z0-9_]*)'\s*:)")]
    private static partial Regex MissingCommaBeforeSingleQuotedPropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*((?:true|false|null|True|False|None)\b)")]
    private static partial Regex MissingCommaBeforeLiteralRegex();

    [GeneratedRegex(@"([:\[,]\s*)(?<literal>True|False|None)(\s*(?:,|\}|\]))")]
    private static partial Regex PythonLiteralRegex();

    [GeneratedRegex(@":\s*'(?<value>(?:[^'\\]|\\.)*)'(?=\s*(?:,|\}|\]))")]
    private static partial Regex SingleQuotedValueRegex();

    [GeneratedRegex(@",\s*([\}\]])")]
    private static partial Regex TrailingCommaRegex();

    [GeneratedRegex(@"retry in\s*(?<seconds>\d+(?:\.\d+)?)s", RegexOptions.IgnoreCase)]
    private static partial Regex RetryInSecondsRegex();

    [GeneratedRegex("\"retryDelay\"\\s*:\\s*\"(?<seconds>\\d+(?:\\.\\d+)?)s\"", RegexOptions.IgnoreCase)]
    private static partial Regex RetryDelaySecondsRegex();

    [GeneratedRegex(@"(?im)^\s*(?<number>\d{1,2})\s*[).:\-]?\s*(?<answer>.+?)\s*$")]
    private static partial Regex SingleAnswerLineRegex();

    [GeneratedRegex(@"(?ix)
        (?<!\d)
        (?<number>\d{1,2})
        \s*[).:\-]?\s*
        (?<answer>
            NOT\ GIVEN|
            TRUE|
            FALSE|
            YES|
            NO|
            [A-H]|
            [A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*){0,4}
        )
        (?=
            \s*(?:\d{1,2}\s*[).:\-]?)|
            \s*$
        )")]
    private static partial Regex CompactAnswerPairRegex();

    [GeneratedRegex(@"(?ix)
        (?<!\d)
        (?<number>\d{1,2})
        \s*
        (?<answer>
            NOT\s*GIVEN|
            TRUE|
            FALSE|
            YES|
            NO|
            [A-H]
        )
        (?=
            \d|
            \s|
            $|
            [).:\-]
        )")]
    private static partial Regex UltraCompactAnswerPairRegex();

    [GeneratedRegex(@"(?ix)
        (?<!\d)
        (?<number>\d{1,2})
        \s*[).:\-]?\s*
        (?<answer>
            NOT\ GIVEN|
            TRUE|
            FALSE|
            YES|
            NO|
            [A-H]|
            [A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*){0,6}
        )
        (?=
            \s+\d{1,2}\s*[).:\-]?|
            \s*$
        )")]
    private static partial Regex AnswerPairInLineRegex();

    [GeneratedRegex(@"^(?<label>[A-H])\s*[).:\-]\s*(?<text>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex AnswerStartsWithLabelRegex();

    [GeneratedRegex(@"^(?<answer>.+?)(?:\s*(?:[-–—]|because|since|therefore|=>)\s+.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex AnswerBeforeExplanationRegex();

    [GeneratedRegex(@"^(?:TRUE|FALSE|YES|NO|NOT\s+GIVEN|[A-H])(?:[).:\-]|\s)+(?<explanation>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex LeadingAnswerTokenRegex();

    [GeneratedRegex(@"(?i)\b(?:access\s+https?://|https?://|page\s*\d+)\b")]
    private static partial Regex AccessOrPageNoiseRegex();

    [GeneratedRegex(@"(?im)^\s*access\s*$")]
    private static partial Regex StandaloneAccessLineRegex();

    [GeneratedRegex(@"(?i)\b(?:https?://|access\b|open\s+this\s+url|how\s+to\s+use|on\s+your\s+computer|ways?\s+to\s+access|reading\s+passage|answer\s+sheet|ieltsonlinetests|page\s*\d+|questions?\b)\b")]
    private static partial Regex AnswerKeyNoiseHintRegex();

    [GeneratedRegex(@"(?i)(?:\d{1,2}\s*[A-H]){3,}")]
    private static partial Regex CompactAnswerBlobRegex();

    [GeneratedRegex(@"^\s*(?<label>[A-H])\s*[).:\-]\s*(?<text>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex OptionStartsWithLetterLabelRegex();

    [GeneratedRegex(@"^\s*(?<label>[A-H])\s+(?<text>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex OptionStartsWithLetterSpaceRegex();

    [GeneratedRegex(@"^\s*\d{1,2}\s*[).:\-]?\s+")]
    private static partial Regex LeadingQuestionNumberRegex();

    [GeneratedRegex(@"\b(TRUE|FALSE|NOT\s+GIVEN)\b", RegexOptions.IgnoreCase)]
    private static partial Regex TrueFalseNotGivenRegex();

    [GeneratedRegex(@"\b(YES|NO|NOT\s+GIVEN)\b", RegexOptions.IgnoreCase)]
    private static partial Regex YesNoNotGivenRegex();

    [GeneratedRegex(@"\b(choose|write)\b.*\b(letter|letters)\b|\bA\s*-\s*H\b", RegexOptions.IgnoreCase)]
    private static partial Regex MatchingInstructionRegex();

    [GeneratedRegex(@"\bwhich\s+paragraphs?\s+contain(?:s)?\b|\bwhich\s+paragraph\s+contains\b", RegexOptions.IgnoreCase)]
    private static partial Regex MatchingInfoInstructionRegex();

    [GeneratedRegex(@"\bheadings?\b|\bparagraphs?\s*\(\s*[A-Z]\s*-\s*[A-Z]\s*\)|\bparagraph\s+[A-Z]\b", RegexOptions.IgnoreCase)]
    private static partial Regex MatchingHeadingsInstructionRegex();

    [GeneratedRegex(@"\bchoose\s+the\s+correct\s+answer(?:\s+or\s+answers?)?\b|\bchoose\s+the\s+correct\s+answers?\b", RegexOptions.IgnoreCase)]
    private static partial Regex ChooseCorrectAnswerOrAnswersRegex();

    [GeneratedRegex(@"\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\b|\bchoose\s+the\s+correct\s+answers?\b", RegexOptions.IgnoreCase)]
    private static partial Regex ChooseCorrectAnswersOnlyRegex();

    [GeneratedRegex(@"\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b\s+of\s+the\s+following\s+(statements?|options?)\b|\bin\s+any\s+order\b|\bcorresponding\s+letters?\b", RegexOptions.IgnoreCase)]
    private static partial Regex ChooseNStatementsInstructionRegex();

    [GeneratedRegex(@"\b(which|choose|according|match|write|complete|paragraph|headings?|statements?|following|correct)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SharedInstructionLineRegex();

    [GeneratedRegex(@"^[A-H]$", RegexOptions.IgnoreCase)]
    private static partial Regex SingleLetterAnswerRegex();

    [GeneratedRegex(@"^\s*[A-H]\s*(?:[).:\-]\s*)?(?:[A-H])?\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex OptionLabelOnlyRegex();

    [GeneratedRegex(@"[\u2610-\u2612\u25A1\u25A3\u25FB\u25FC]")]
    private static partial Regex SelectionMarkerRegex();

    [GeneratedRegex(@"\b(fill|complete|no\s+more\s+than|one\s+word|two\s+words)\b", RegexOptions.IgnoreCase)]
    private static partial Regex FillInBlankInstructionRegex();

    [GeneratedRegex(@"(?<=\p{L})-\n(?=\p{L})")]
    private static partial Regex HyphenatedWordAcrossLinesRegex();

    [GeneratedRegex(@"(?<=[a-z0-9,;:])\n(?=[a-z])")]
    private static partial Regex SoftLineBreakBetweenLowercaseWordsRegex();

    [GeneratedRegex(@"\b(?<prefix>to|their|getting|no)(?<suffix>learn|teachers|thrive|them|evidence)\b", RegexOptions.IgnoreCase)]
    private static partial Regex FixKnownGluedWordsRegex();

    [GeneratedRegex(@"_{2,}|\[Q\d+\]|\.\.\.", RegexOptions.IgnoreCase)]
    private static partial Regex BlankPlaceholderRegex();

    [GeneratedRegex(@"(?<=\S)[ \t]{4,}(?=\S)")]
    private static partial Regex MissingBlankGapRegex();

    [GeneratedRegex(@"([.?!])\s*$")]
    private static partial Regex SentenceEndingPunctuationRegex();

    private sealed record PdfGenerationProgressPayload(
        Guid UploadId,
        Guid UploadedBy,
        string Status,
        int ProgressPercent,
        string Stage,
        string Message,
        int? PassageNumber,
        int? TotalPassages,
        Guid? ExamId,
        string? ClientRequestId);

    private readonly record struct PassageMarker(int Number, int StartIndex);
    private readonly record struct PassageQuestionSegment(
        int SegmentIndex,
        int SegmentCount,
        int StartQuestion,
        int EndQuestion,
        string Text);
    private readonly record struct QuestionRangeSegment(
        int StartQuestion,
        int EndQuestion,
        int StartIndex);

    private sealed record IndexedQuestion(GemmaQuestionPayload Question, int Index);

    private sealed class QuestionGroupBuilder(string groupType, string? boundaryToken, RawQuestionGroupContext? rawContext)
    {
        public string GroupType { get; } = groupType;
        public string? BoundaryToken { get; } = boundaryToken;
        public RawQuestionGroupContext? RawContext { get; } = rawContext;
        public string? RawInstruction { get; } = rawContext?.Instruction;
        public string? RawBlockText { get; } = rawContext?.BlockText;
        public List<CreateQuestionDto> Questions { get; } = [];
    }

    private sealed record RawQuestionGroupContext(
        int StartQuestion,
        int EndQuestion,
        string? BoundaryToken,
        string? Instruction,
        string? GroupType,
        string? BlockText,
        string? QuestionPreview,
        IReadOnlyList<PdfRawVisualPreviewItemDto>? VisualPreviewItems,
        string? VisualPreviewNote,
        int? DiagramPreviewPageNumber,
        string? DiagramPreviewNote);

    private sealed class GemmaPassagePayload
    {
        [JsonPropertyName("passage_title")]
        public string? PassageTitle { get; set; }

        [JsonPropertyName("passage_content")]
        public string? PassageContent { get; set; }

        [JsonPropertyName("questions")]
        public List<GemmaQuestionPayload>? Questions { get; set; }
    }

    private sealed class GemmaQuestionPayload
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("question_type")]
        public JsonElement QuestionType { get; set; }

        [JsonPropertyName("question_text")]
        public JsonElement QuestionText { get; set; }

        [JsonPropertyName("options")]
        public JsonElement Options { get; set; }

        [JsonPropertyName("answer")]
        public JsonElement Answer { get; set; }

        [JsonPropertyName("explanation")]
        public JsonElement Explanation { get; set; }
    }

    private sealed record MultiSelectContentData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("prompt")] string Prompt);

    private sealed record FlowchartGroupAssetsData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("imageUrl")] string ImageUrl,
        [property: JsonPropertyName("answerMode")] string AnswerMode,
        [property: JsonPropertyName("pageNumber")] int? PageNumber = null,
        [property: JsonPropertyName("note")] string? Note = null);

    private sealed record MapLabellingGroupAssetsData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("imageUrl")] string ImageUrl,
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("zoom")] int Zoom,
        [property: JsonPropertyName("pageNumber")] int? PageNumber = null,
        [property: JsonPropertyName("note")] string? Note = null);

    private sealed record MatchingVisualGroupAssetsData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("images")] IReadOnlyList<string> Images,
        [property: JsonPropertyName("pageNumbers")] IReadOnlyList<int> PageNumbers,
        [property: JsonPropertyName("note")] string? Note = null);

    private sealed record FallbackAnswerCandidate(
        int QuestionNumber,
        string QuestionType,
        string QuestionText,
        IReadOnlyList<string> Options,
        string CurrentAnswer);

    private sealed record FallbackAnswerMappingResult(
        int AppliedCount,
        HashSet<int> VerifiedQuestionNumbers);

    private sealed record FallbackOptionCandidate(
        int QuestionNumber,
        string QuestionType,
        string QuestionText,
        IReadOnlyList<string> ExpectedOptionLabels,
        IReadOnlyList<string> CurrentOptions);

    private sealed class FallbackAnswerResponse
    {
        [JsonPropertyName("answers")]
        public List<FallbackAnswerItem>? Answers { get; set; }
    }

    private sealed class FallbackAnswerItem
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("answer")]
        public string? Answer { get; set; }
    }

    private sealed class FallbackOptionResponse
    {
        [JsonPropertyName("options")]
        public List<FallbackOptionItem>? Options { get; set; }
    }

    private sealed class FallbackOptionItem
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("options")]
        public List<string>? Options { get; set; }
    }

    private sealed class RawReviewStructureResponse
    {
        [JsonPropertyName("passages")]
        public List<RawReviewStructurePassage>? Passages { get; set; }

        [JsonPropertyName("solution_section_raw")]
        public string? SolutionSectionRaw { get; set; }

        [JsonPropertyName("review_section_raw")]
        public string? ReviewSectionRaw { get; set; }
    }

    private sealed class RawReviewStructurePassage
    {
        [JsonPropertyName("passage_number")]
        public int PassageNumber { get; set; }

        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("question_range")]
        public string? QuestionRange { get; set; }

        [JsonPropertyName("raw_text")]
        public string? RawText { get; set; }
    }

    private sealed class RawReviewQuestionGroupsResponse
    {
        [JsonPropertyName("question_groups")]
        public List<RawReviewQuestionGroupItem>? QuestionGroups { get; set; }
    }

    private sealed class RawReviewQuestionGroupItem
    {
        [JsonPropertyName("start_question")]
        public int StartQuestion { get; set; }

        [JsonPropertyName("end_question")]
        public int EndQuestion { get; set; }

        [JsonPropertyName("tags")]
        public string? Tags { get; set; }

        [JsonPropertyName("instruction")]
        public string? Instruction { get; set; }

        [JsonPropertyName("group_type")]
        public string? GroupType { get; set; }

        [JsonPropertyName("question_preview")]
        public string? QuestionPreview { get; set; }

        [JsonPropertyName("type_evidence")]
        public string? TypeEvidence { get; set; }
    }

    private sealed class RawReviewAnswersResponse
    {
        [JsonPropertyName("answers")]
        public List<RawReviewAnswerItem>? Answers { get; set; }
    }

    private sealed class RawReviewAnswerItem
    {
        [JsonPropertyName("question_number")]
        public int QuestionNumber { get; set; }

        [JsonPropertyName("answer")]
        public string? Answer { get; set; }
    }

    private sealed class RawReviewExplanationsResponse
    {
        [JsonPropertyName("explanations")]
        public List<RawReviewExplanationItem>? Explanations { get; set; }
    }

    private sealed class SentenceCompletionTemplateResponse
    {
        [JsonPropertyName("templates")]
        public List<SentenceCompletionTemplateItem>? Templates { get; set; }
    }

    private sealed class SentenceCompletionTemplateItem
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("template")]
        public string? Template { get; set; }
    }

    private sealed class RawReviewExplanationItem
    {
        [JsonPropertyName("question_number")]
        public int QuestionNumber { get; set; }

        [JsonPropertyName("answer")]
        public string? Answer { get; set; }

        [JsonPropertyName("explanation")]
        public string? Explanation { get; set; }
    }

    private sealed record OpenAiChatCompletionRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("messages")] IReadOnlyList<OpenAiChatMessage> Messages,
        [property: JsonPropertyName("temperature")] double Temperature);

    private sealed record OpenAiChatMessage(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string Content);

    private sealed class OpenAiChatCompletionResponse
    {
        [JsonPropertyName("choices")]
        public List<OpenAiChoice>? Choices { get; set; }
    }

    private sealed class OpenAiChoice
    {
        [JsonPropertyName("message")]
        public OpenAiMessage? Message { get; set; }
    }

    private sealed class OpenAiMessage
    {
        [JsonPropertyName("content")]
        public string? Content { get; set; }
    }

    private readonly record struct PdfTextExtractionResult(
        string RawText,
        int PageCount,
        string Engine,
        IReadOnlyList<PdfExtractedPage> Pages,
        byte[] PdfBytes);

    private sealed record PdfExtractedPage(
        int PageNumber,
        string RawText,
        double PageHeight,
        IReadOnlyList<PdfExtractedWord> Words,
        IReadOnlyList<PdfExtractedPageImage> Images);

    private sealed record PdfExtractedWord(
        string Text,
        double TopFromPageTop,
        double BottomFromPageTop,
        double Left,
        double Right);

    private sealed record PdfExtractedWordLine(
        string Text,
        string NormalizedText,
        double TopFromPageTop,
        double BottomFromPageTop,
        double Left,
        double Right);

    private sealed record PdfExtractedPageImage(
        string DataUrl,
        double PageCoverage,
        int PixelArea,
        int WidthInSamples,
        int HeightInSamples,
        double TopFromPageTop,
        double BottomFromPageTop,
        double Left,
        double Right);

    private sealed record DiagramPreviewCropBounds(
        double TopRatio,
        double BottomRatio,
        bool HasExplicitBottomBoundary,
        bool HasExplicitInstructionBoundary);

    private sealed record QuestionGroupReviewContextBlock(
        int StartQuestion,
        int EndQuestion,
        string Tags,
        string Instruction,
        string? QuestionPreview,
        string? BlockText,
        string? HeuristicGroupType,
        string? TypeEvidence);
}
