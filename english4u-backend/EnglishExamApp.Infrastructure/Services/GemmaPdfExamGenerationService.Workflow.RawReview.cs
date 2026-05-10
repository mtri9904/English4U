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
}
