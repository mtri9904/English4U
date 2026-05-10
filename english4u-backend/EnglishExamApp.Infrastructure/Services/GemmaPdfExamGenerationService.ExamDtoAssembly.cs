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
}
