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

    private static (List<CreateQuestionDto> Questions, string? SharedInstruction, string? AssetsData) NormalizeGroupQuestions(
        string mappedQuestionType,
        List<CreateQuestionDto> sourceQuestions,
        string? preferredInstruction = null,
        string? rawBlockText = null)
    {
        var sharedInstruction = ExtractSharedInstructionLine(mappedQuestionType, sourceQuestions);
        var effectiveInstruction = string.IsNullOrWhiteSpace(preferredInstruction)
            ? sharedInstruction
            : preferredInstruction;
        var effectiveGroupType = mappedQuestionType;

        var normalizedQuestions = sourceQuestions
            .Select(question => question with
            {
                Content = NormalizeQuestionBody(effectiveGroupType, question.Content, question.QuestionNumber),
                CorrectAnswer = NormalizeAnswerByGroupType(effectiveGroupType, question.CorrectAnswer)
            })
            .ToList();

        if (string.Equals(effectiveGroupType, "SENTENCE_COMPLETION", StringComparison.Ordinal))
        {
            normalizedQuestions = RepairSentenceCompletionQuestionSet(normalizedQuestions, rawBlockText);
        }

        if (!string.IsNullOrWhiteSpace(effectiveInstruction))
        {
            normalizedQuestions = normalizedQuestions
                .Select(question => question with
                {
                    Content = RemoveLeadingInstructionLine(effectiveGroupType, question.Content, effectiveInstruction)
                })
                .ToList();

            normalizedQuestions = normalizedQuestions
                .Select(question => question with
                {
                    Content = NormalizeQuestionBody(effectiveGroupType, question.Content, question.QuestionNumber)
                })
                .ToList();
        }

        if (string.Equals(effectiveGroupType, "MCQ_CHOOSE_N", StringComparison.Ordinal))
        {
            normalizedQuestions = NormalizeChooseNQuestionSet(normalizedQuestions);
        }
        else if (string.Equals(effectiveGroupType, "MCQ_MULTIPLE", StringComparison.Ordinal))
        {
            normalizedQuestions = NormalizeSharedMultiSelectQuestionSet(normalizedQuestions);
        }
        else if (IsMatchingType(effectiveGroupType))
        {
            normalizedQuestions = NormalizeMatchingSharedOptionBank(
                effectiveGroupType,
                normalizedQuestions,
                effectiveInstruction,
                rawBlockText);
            if (string.Equals(effectiveGroupType, "MATCHING_HEADINGS", StringComparison.Ordinal))
            {
                normalizedQuestions = RepairMatchingHeadingParagraphStems(normalizedQuestions);
            }
        }

        string? assetsData = null;
        if (string.Equals(effectiveGroupType, "FLOWCHART_COMPLETION", StringComparison.Ordinal) ||
            string.Equals(effectiveGroupType, "MAP_LABELLING", StringComparison.Ordinal))
        {
            (normalizedQuestions, assetsData) = NormalizeFlowchartQuestionSet(normalizedQuestions, rawBlockText, effectiveGroupType);
        }

        return (normalizedQuestions, effectiveInstruction, assetsData);
    }

    private static List<CreateQuestionDto> RepairMatchingHeadingParagraphStems(List<CreateQuestionDto> questions)
    {
        if (questions.Count == 0 || questions.All(question => !string.IsNullOrWhiteSpace(question.Content)))
        {
            return questions;
        }

        var anchors = questions
            .Where(question => question.QuestionNumber.HasValue)
            .Select(question => new
            {
                Question = question,
                Match = Regex.Match(question.Content ?? string.Empty, @"(?i)^paragraph\s+([A-Z])$")
            })
            .Where(item => item.Match.Success)
            .Select(item => new
            {
                Number = item.Question.QuestionNumber!.Value,
                LetterIndex = char.ToUpperInvariant(item.Match.Groups[1].Value[0]) - 'A'
            })
            .OrderBy(item => item.Number)
            .ToList();

        if (anchors.Count == 0)
        {
            return questions;
        }

        var anchor = anchors[0];
        return questions
            .Select(question =>
            {
                if (!question.QuestionNumber.HasValue || !string.IsNullOrWhiteSpace(question.Content))
                {
                    return question;
                }

                var inferredLetterIndex = anchor.LetterIndex + (question.QuestionNumber.Value - anchor.Number);
                if (inferredLetterIndex is < 0 or > 25)
                {
                    return question;
                }

                var inferredLetter = (char)('A' + inferredLetterIndex);
                return question with { Content = $"Paragraph {inferredLetter}" };
            })
            .ToList();
    }

}
