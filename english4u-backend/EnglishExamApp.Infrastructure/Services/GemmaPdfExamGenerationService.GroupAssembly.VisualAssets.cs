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
            Regex.IsMatch(normalized, $@"^(?:Q\s*)?{questionNumber.Value}\s*(?:[.):\-]|_{{2,}}|\.\.\.|â€¦|\s)*$", RegexOptions.IgnoreCase))
        {
            return true;
        }

        return Regex.IsMatch(normalized, @"^(?:Q\s*)?\d{1,2}\s*$", RegexOptions.IgnoreCase);
    }
}
