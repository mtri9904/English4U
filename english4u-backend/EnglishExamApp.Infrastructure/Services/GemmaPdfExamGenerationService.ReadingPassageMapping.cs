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

}
