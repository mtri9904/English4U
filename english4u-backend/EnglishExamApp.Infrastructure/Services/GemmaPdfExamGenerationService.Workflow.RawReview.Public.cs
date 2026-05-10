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



    public async Task<PdfRawReviewDto> ReviewPdfRawAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        if (pdfStream is null)
        {
            throw new ArgumentNullException(nameof(pdfStream));
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name is required.", nameof(fileName));
        }

        var extraction = await ExtractPdfTextResultAsync(pdfStream, cancellationToken);
        var rawText = extraction.RawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var deterministicPassages = SplitPassages(rawText);
        var solutionZone = ExtractSolutionOnlyZone(rawText);
        var reviewZone = ExtractReviewAndExplanationsZone(rawText);
        var deterministicAnswerKey = ExtractAnswerKeyMap(rawText);
        var trace = new List<PdfRawReviewRequestTraceDto>
        {
            new(
                StepName: "extract_pdf_text",
                InputLength: 0,
                OutputLength: rawText.Length,
                Status: "completed",
                Notes: extraction.Engine)
        };

        var structure = await ReviewRawDocumentStructureAsync(
            rawText,
            deterministicPassages,
            solutionZone,
            reviewZone,
            trace,
            cancellationToken);

        var passageReviews = new List<PdfRawReviewPassageDto>(structure.Passages.Count);
        for (var index = 0; index < structure.Passages.Count; index++)
        {
            var passage = structure.Passages[index];
            var questionGroups = await ReviewPassageQuestionGroupsAsync(
                passage,
                trace,
                cancellationToken);
            questionGroups = AttachDiagramPreviewImages(questionGroups, extraction.Pages, extraction.PdfBytes);

            passageReviews.Add(new PdfRawReviewPassageDto(
                PassageNumber: passage.PassageNumber,
                Title: passage.Title,
                QuestionRange: passage.QuestionRange,
                RawText: passage.RawText,
                QuestionGroups: questionGroups));

            if (index < structure.Passages.Count - 1)
            {
                await Task.Delay(RawReviewDelayBetweenAiCallsMs, cancellationToken);
            }
        }

        var solutionSectionRaw = NormalizeSolutionSectionRaw(
            structure.SolutionSectionRaw,
            solutionZone,
            deterministicAnswerKey);
        var reviewSectionRaw = !string.IsNullOrWhiteSpace(structure.ReviewSectionRaw)
            ? structure.ReviewSectionRaw
            : reviewZone;

        var solutionSection = await ReviewAnswerSectionAsync(
            solutionSectionRaw,
            deterministicAnswerKey,
            trace,
            cancellationToken);

        if (solutionSection is not null && !string.IsNullOrWhiteSpace(reviewSectionRaw))
        {
            await Task.Delay(RawReviewDelayBetweenAiCallsMs, cancellationToken);
        }

        var explanationSection = await ReviewExplanationSectionAsync(
            reviewSectionRaw,
            trace,
            cancellationToken);

        return new PdfRawReviewDto(
            FileName: fileName.Trim(),
            ExtractionEngine: extraction.Engine,
            PageCount: extraction.PageCount,
            RawTextLength: rawText.Length,
            RawText: rawText,
            Structure: structure,
            Passages: passageReviews,
            SolutionSection: solutionSection,
            ReviewSection: explanationSection,
            RequestTrace: trace);
    }
}
