using System.Net;
using System.Text;
using System.Globalization;
using System.Linq;
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
            var rawPassageText = i < rawPassages.Count ? TrimToQuestionStatementZone(rawPassages[i]) : string.Empty;
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
        var passageTitles = parsedPassages
            .Select(p => p.PassageTitle?.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .ToList();

        var joinedTitles = passageTitles.Count > 0
            ? string.Join(" | ", passageTitles)
            : (string.IsNullOrWhiteSpace(titleWithoutExtension) ? "IELTS Reading Exam" : titleWithoutExtension.Trim());

        var randomCode = Guid.NewGuid().ToString("N")[..4].ToUpperInvariant();
        var localDate = DateTime.UtcNow.AddHours(7).ToString("dd/MM/yyyy");
        var suffix = $" ({localDate} - {randomCode})";
        var prefix = "[Reading] ";

        var examTitle = prefix + joinedTitles + suffix;
        if (examTitle.Length > 255)
        {
            var maxJoinedLength = 255 - prefix.Length - suffix.Length;
            if (maxJoinedLength > 3)
            {
                examTitle = prefix + joinedTitles[..(maxJoinedLength - 3)] + "..." + suffix;
            }
            else
            {
                examTitle = examTitle[..255];
            }
        }

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
