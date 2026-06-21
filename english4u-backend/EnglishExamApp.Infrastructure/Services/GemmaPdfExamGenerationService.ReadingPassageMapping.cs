using System.Net;
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

public sealed partial class GemmaPdfExamGenerationService
{

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
        var aiPassageContent = NormalizeAiPassageContent(payload.PassageContent, passageTitle);
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
                    : BuildGeminiQuestionGroupContext(rawQuestion, parsedQuestionNumber);
            rawGroupContext = PreferGeminiInstructionContext(rawGroupContext, rawQuestion, parsedQuestionNumber);
            var questionTypeText = ReadJsonAsText(rawQuestion.QuestionType);
            var questionText = SanitizeQuestionContentForStorage(
                ReadJsonAsText(rawQuestion.QuestionText),
                parsedQuestionNumber);
            var answerText = SanitizeAnswerForStorage(ReadJsonAsText(rawQuestion.Answer));
            var explanationText = SanitizeExplanationForStorage(ReadJsonAsText(rawQuestion.Explanation));
            var rawOptions = ExtractOptions(rawQuestion.Options);
            var aiMappedQuestionType = TryMapQuestionType(questionTypeText);
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
                rawOptions,
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
            var finalGroupType = ReconcileGroupTypeByEvidence(
                builder.GroupType,
                SanitizeInstructionForStorage(builder.RawInstruction),
                builder.Questions);
            var (normalizedQuestions, sharedInstruction, assetsData) = NormalizeGroupQuestions(
                finalGroupType,
                builder.Questions,
                SanitizeInstructionForStorage(builder.RawInstruction),
                builder.RawBlockText,
                passageContent);
            if (string.Equals(finalGroupType, "SENTENCE_COMPLETION", StringComparison.OrdinalIgnoreCase))
            {
                normalizedQuestions = await TryRepairSentenceCompletionQuestionSetWithGemmaAsync(
                    normalizedQuestions,
                    passageContent,
                    rawPassageText,
                    builder,
                    cancellationToken);
            }
            var contentData = BuildGroupContentData(finalGroupType, sharedInstruction, normalizedQuestions, builder);
            (normalizedQuestions, assetsData) = ApplyGroupVisualAssets(
                finalGroupType,
                normalizedQuestions,
                assetsData,
                builder.RawContext);
            sharedInstruction = string.IsNullOrWhiteSpace(builder.RawInstruction)
                ? sharedInstruction
                : SanitizeInstructionForStorage(builder.RawInstruction);
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
                OptionLabelType: string.Equals(finalGroupType, "MATCHING_HEADINGS", StringComparison.OrdinalIgnoreCase) ? "roman" : "alpha",
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

    private static RawQuestionGroupContext? BuildGeminiQuestionGroupContext(
        GemmaQuestionPayload question,
        int? parsedQuestionNumber,
        RawQuestionGroupContext? fallbackContext = null)
    {
        var instruction = ReadJsonAsText(question.Instruction);
        var questionGroup = ReadJsonAsText(question.QuestionGroup);
        var mappedType = TryMapQuestionType(ReadJsonAsText(question.QuestionType));
        if (string.IsNullOrWhiteSpace(instruction) &&
            string.IsNullOrWhiteSpace(questionGroup) &&
            string.IsNullOrWhiteSpace(mappedType))
        {
            return fallbackContext;
        }

        if (!parsedQuestionNumber.HasValue && fallbackContext is null)
        {
            return null;
        }

        var effectiveInstruction = string.IsNullOrWhiteSpace(instruction)
            ? fallbackContext?.Instruction
            : instruction;
        var effectiveGroupType = ResolveMappedQuestionType(fallbackContext?.GroupType, mappedType);
        var parsedGroupRange = TryParseGeminiQuestionGroupRange(questionGroup);

        var boundaryToken = !string.IsNullOrWhiteSpace(questionGroup)
            ? $"AI-GROUP:{NormalizeToken(questionGroup)}"
            : !string.IsNullOrWhiteSpace(instruction)
                ? $"AI-INSTR:{NormalizeToken(instruction)}"
                : fallbackContext?.BoundaryToken;
        var startQuestion = parsedGroupRange?.Start ?? parsedQuestionNumber ?? fallbackContext?.StartQuestion ?? 0;
        var endQuestion = parsedGroupRange?.End ?? parsedQuestionNumber ?? fallbackContext?.EndQuestion ?? startQuestion;
        return new RawQuestionGroupContext(
            StartQuestion: startQuestion,
            EndQuestion: endQuestion,
            BoundaryToken: boundaryToken,
            Instruction: effectiveInstruction,
            GroupType: effectiveGroupType,
            BlockText: fallbackContext?.BlockText,
            QuestionPreview: fallbackContext?.QuestionPreview,
            VisualPreviewItems: fallbackContext?.VisualPreviewItems,
            VisualPreviewNote: fallbackContext?.VisualPreviewNote,
            DiagramPreviewPageNumber: fallbackContext?.DiagramPreviewPageNumber,
            DiagramPreviewNote: fallbackContext?.DiagramPreviewNote);
    }

    private static (int Start, int End)? TryParseGeminiQuestionGroupRange(string? questionGroup)
    {
        if (string.IsNullOrWhiteSpace(questionGroup))
        {
            return null;
        }

        var match = Regex.Match(
            questionGroup,
            @"(?i)(?:questions?\s*)?(?<start>\d{1,2})\s*(?:-|to|\u2013|\u2014)\s*(?<end>\d{1,2})");
        if (!match.Success ||
            !int.TryParse(match.Groups["start"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var start) ||
            !int.TryParse(match.Groups["end"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var end) ||
            start <= 0 ||
            end < start ||
            end - start > 20)
        {
            return null;
        }

        return (start, end);
    }

    private static RawQuestionGroupContext? PreferGeminiInstructionContext(
        RawQuestionGroupContext? rawGroupContext,
        GemmaQuestionPayload question,
        int? parsedQuestionNumber)
    {
        return BuildGeminiQuestionGroupContext(question, parsedQuestionNumber, rawGroupContext);
    }

    private static bool IsContaminatedRawInstruction(string? rawInstruction, string geminiInstruction)
    {
        if (string.IsNullOrWhiteSpace(rawInstruction))
        {
            return false;
        }

        var normalizedRaw = Regex.Replace(rawInstruction, @"\s+", " ").Trim();
        var normalizedGemini = Regex.Replace(geminiInstruction, @"\s+", " ").Trim();
        if (normalizedGemini.Length == 0)
        {
            return false;
        }

        var rawRangeCount = Regex.Matches(normalizedRaw, @"(?i)\bquestions?\s+\d{1,2}\s*(?:-|to|–|—)\s*\d{1,2}\b").Count;
        var hasPdfNoise = Regex.IsMatch(normalizedRaw, @"(?i)\b(?:page\s*\d+|access|reading\s+passage\s+\d)\b");
        var rawIsMuchLonger = normalizedRaw.Length > Math.Max(240, normalizedGemini.Length * 3);
        var geminiInstructionIndex = normalizedRaw.IndexOf(normalizedGemini, StringComparison.OrdinalIgnoreCase);
        var hasContaminatingPrefix = geminiInstructionIndex > 20 &&
            Regex.IsMatch(
                normalizedRaw[..geminiInstructionIndex],
                @"(?i)(?:^|[^\d])\d{1,2}\s*[A-Za-z]|[A-Za-z]{4,}\s+\d{1,2}\b|(?:questions?\s*)?\d{1,2}\s*(?:-|to|â€“|â€”)\s*\d{1,2}");
        var embeddedRangeMatch = Regex.Match(normalizedRaw, @"(?i)\bquestions?\s*\d{1,2}\s*(?:-|to|â€“|â€”)\s*\d{1,2}\b");
        if (embeddedRangeMatch.Success && embeddedRangeMatch.Index > 10)
        {
            hasContaminatingPrefix = true;
        }
        if (geminiInstructionIndex > 10 &&
            Regex.IsMatch(normalizedRaw[..geminiInstructionIndex], @"(?i)\d{1,2}\s*[A-Za-z]|[A-Za-z]{4,}\s+\d{1,2}|(?:YES|NO|NOT\s+GIVEN|TRUE|FALSE)", RegexOptions.IgnoreCase))
        {
            hasContaminatingPrefix = true;
        }

        return hasContaminatingPrefix || rawIsMuchLonger && (hasPdfNoise || rawRangeCount >= 2);
    }

}
