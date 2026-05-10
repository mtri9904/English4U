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
using EnglishExamApp.Application.Realtime;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService
{



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
private static string BuildVirtualPdfUrl(string fileName)
    {
        var safeFileName = Regex.Replace(fileName.Trim(), @"[^a-zA-Z0-9\.\-_]", "_");
        return $"upload://pdf/{Guid.NewGuid():N}/{safeFileName}";
    }
}
