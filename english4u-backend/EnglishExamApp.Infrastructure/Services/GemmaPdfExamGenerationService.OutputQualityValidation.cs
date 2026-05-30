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
    private static void ValidateCreateExamDtoQuality(CreateExamDto createExamDto)
    {
        var issues = new List<string>();
        var readingPassages = createExamDto.Sections
            .SelectMany(section => section.ReadingPassages ?? [])
            .OrderBy(passage => passage.PassageNumber ?? int.MaxValue)
            .ToList();

        if (readingPassages.Count != 3)
        {
            issues.Add($"Expected 3 reading passages before saving, got {readingPassages.Count}.");
        }

        var allQuestions = new List<CreateQuestionDto>();
        foreach (var passage in readingPassages)
        {
            var passageLabel = $"Passage {passage.PassageNumber ?? 0}";
            if (string.IsNullOrWhiteSpace(passage.ParagraphsData))
            {
                issues.Add($"{passageLabel} has empty passage content.");
            }
            else if (IsReviewOrSolutionArtifact(passage.ParagraphsData))
            {
                issues.Add($"{passageLabel} passage content contains review/solution artifacts.");
            }

            foreach (var group in passage.QuestionGroups.OrderBy(group => group.StartQuestion ?? int.MaxValue))
            {
                ValidateOutputGroupQuality(passageLabel, group, issues);
                allQuestions.AddRange(group.Questions);
            }
        }

        var questionNumbers = allQuestions
            .Select(question => question.QuestionNumber)
            .Where(number => number.HasValue)
            .Select(number => number!.Value)
            .ToList();
        var missingNumbers = Enumerable.Range(1, 40)
            .Except(questionNumbers)
            .OrderBy(number => number)
            .ToList();
        var duplicateNumbers = questionNumbers
            .GroupBy(number => number)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .OrderBy(number => number)
            .ToList();

        if (questionNumbers.Count != 40)
        {
            issues.Add($"Expected 40 questions before saving, got {questionNumbers.Count}.");
        }

        if (missingNumbers.Count > 0)
        {
            issues.Add($"Missing question(s) before saving: {string.Join(", ", missingNumbers)}.");
        }

        if (duplicateNumbers.Count > 0)
        {
            issues.Add($"Duplicated question(s) before saving: {string.Join(", ", duplicateNumbers)}.");
        }

        if (issues.Count == 0)
        {
            return;
        }

        var preview = string.Join("; ", issues.Take(16));
        if (issues.Count > 16)
        {
            preview += $"; ... and {issues.Count - 16} more issue(s)";
        }

        throw new InvalidOperationException(
            "PDF generation stopped before saving because the generated exam still contains unsupported or low-quality mapped content. " +
            preview);
    }

    private static void ValidateOutputGroupQuality(
        string passageLabel,
        CreateQuestionGroupDto group,
        List<string> issues)
    {
        var groupLabel = $"{passageLabel} Q{group.StartQuestion}-{group.EndQuestion}";
        var mappedType = NormalizeGroupType(group.GroupType) ?? MapQuestionType(group.GroupType);
        if (IsReviewOrSolutionArtifact(group.Instruction))
        {
            issues.Add($"{groupLabel} instruction contains review/solution artifacts.");
        }

        if (IsReviewOrSolutionArtifact(group.ContentData))
        {
            issues.Add($"{groupLabel} contentData contains review/solution artifacts.");
        }

        ValidateQuestionTypeEvidence(
            groupLabel,
            mappedType,
            group.Instruction,
            group.Questions,
            issues);

        if (IsCompletionTemplateType(mappedType) && string.IsNullOrWhiteSpace(group.ContentData))
        {
            var hasVisualAssets = !string.IsNullOrWhiteSpace(group.AssetsData);
            if (!hasVisualAssets)
            {
                var hasAnyQuestionContent = group.Questions.Any(question => !string.IsNullOrWhiteSpace(question.Content));
                if (!hasAnyQuestionContent)
                {
                    issues.Add($"{groupLabel} sentence completion group has no template/content.");
                }
            }
        }

        if (mappedType is "SUMMARY_COMPLETION" or "TABLE_COMPLETION" &&
            Regex.IsMatch(group.Instruction ?? string.Empty, @"(?i)\b(?:list\s+of\s+words|words?\s*,?\s*[A-Z]\s*[-–—]\s*[A-Z]|choose\s+your\s+answers?\s+from\s+the\s+box|from\s+the\s+list\s+below)\b") &&
            group.Questions.Any(question => question.Options.Count < 2))
        {
            issues.Add($"{groupLabel} has a visible completion option bank instruction but one or more questions have no options.");
        }

        if (mappedType is "MATCHING_FEATURES" or "MATCHING_HEADINGS" or "MATCHING_VISUALS" &&
            ExtractMatchingSharedOptionBank(group.Instruction).Count >= 2 &&
            group.Questions.Any(question => question.Options.Count == 0))
        {
            issues.Add($"{groupLabel} has a visible matching option bank but one or more questions have no options.");
        }

        foreach (var question in group.Questions.OrderBy(question => question.QuestionNumber ?? int.MaxValue))
        {
            ValidateOutputQuestionQuality(groupLabel, mappedType, question, issues);
        }
    }

    private static void ValidateOutputQuestionQuality(
        string groupLabel,
        string mappedType,
        CreateQuestionDto question,
        List<string> issues)
    {
        var questionLabel = $"Q{question.QuestionNumber ?? 0}";
        var requiresQuestionContent = !IsCompletionTemplateType(mappedType) && mappedType is not "MCQ_MULTIPLE" and not "MCQ_CHOOSE_N";
        if (requiresQuestionContent && string.IsNullOrWhiteSpace(question.Content))
        {
            issues.Add($"{groupLabel} {questionLabel} has empty question content.");
        }

        if (IsReviewOrSolutionArtifact(question.Content))
        {
            issues.Add($"{groupLabel} {questionLabel} content contains review/solution artifacts.");
        }

        if (IsReviewOrSolutionArtifact(question.Explanation))
        {
            issues.Add($"{groupLabel} {questionLabel} explanation contains review/solution artifacts.");
        }

        if (IsMcqType(mappedType))
        {
            var usableOptions = question.Options
                .Where(option => !string.IsNullOrWhiteSpace(option.OptionText))
                .Where(option => !IsOptionLabelOnly(option.OptionText))
                .Where(option => !IsReviewOrSolutionArtifact(option.OptionText))
                .ToList();
            if (usableOptions.Count < 2)
            {
                issues.Add($"{groupLabel} {questionLabel} has fewer than 2 usable MCQ options.");
            }
        }

        foreach (var option in question.Options)
        {
            if (IsReviewOrSolutionArtifact(option.OptionText))
            {
                issues.Add($"{groupLabel} {questionLabel} option contains review/solution artifacts.");
            }
        }
    }
}
