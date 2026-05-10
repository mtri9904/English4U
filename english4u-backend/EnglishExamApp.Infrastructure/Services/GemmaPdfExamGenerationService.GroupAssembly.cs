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

}
