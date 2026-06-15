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



    public async Task<PdfRawExtractionPreviewDto> PreviewPdfExtractionAsync(
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

        var rawText = await ExtractPdfTextAsync(pdfStream, fileName, cancellationToken);
        var normalizedRawText = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var answerZone = ExtractAnswerZone(normalizedRawText);
        var answerKeyMap = ExtractAnswerKeyMap(rawText);
        var passages = SplitPassages(rawText);
        var questionGroupInstructionPreviews = BuildQuestionGroupInstructionPreviews(passages);

        var passagePreviews = new List<PdfRawPassagePreviewDto>(passages.Count);
        for (var index = 0; index < passages.Count; index++)
        {
            var passageNumber = index + 1;
            var original = passages[index];
            var prepared = PreparePassageInputForGemma(original, allowHardTrim: false);
            var segments = BuildPassageQuestionSegments(prepared, passageNumber);
            var segmentPreviews = segments.Select((segment, segmentIndex) =>
                    new PdfRawQuestionSegmentPreviewDto(
                        SegmentIndex: segmentIndex + 1,
                        StartQuestion: segment.StartQuestion,
                        EndQuestion: segment.EndQuestion,
                        SegmentTextLength: segment.Text.Length,
                        SegmentText: segment.Text))
                .ToList();

            passagePreviews.Add(new PdfRawPassagePreviewDto(
                PassageNumber: passageNumber,
                OriginalLength: original.Length,
                PreparedLength: prepared.Length,
                OriginalText: original,
                PreparedText: prepared,
                QuestionSegments: segmentPreviews));
        }

        return new PdfRawExtractionPreviewDto(
            FileName: fileName.Trim(),
            RawTextLength: normalizedRawText.Length,
            RawText: normalizedRawText,
            AnswerZoneLength: answerZone?.Length ?? 0,
            AnswerZone: answerZone ?? string.Empty,
            AnswerKeyEntryCount: answerKeyMap.Count,
            AnswerKeyEntries: answerKeyMap,
            QuestionGroupInstructions: questionGroupInstructionPreviews,
            Passages: passagePreviews);
    }

    public async Task<PdfQuestionGroupPreviewDto> PreviewPdfQuestionGroupsAsync(
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

        var rawText = await ExtractPdfTextAsync(pdfStream, fileName, cancellationToken);
        var passages = SplitPassages(rawText);

        return new PdfQuestionGroupPreviewDto(
            FileName: fileName.Trim(),
            PassageCount: passages.Count,
            QuestionGroups: BuildQuestionGroupInstructionPreviews(passages));
    }
    }
