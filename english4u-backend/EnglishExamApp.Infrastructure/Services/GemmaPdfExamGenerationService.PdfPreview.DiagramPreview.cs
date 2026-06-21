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

    private async Task<List<PdfRawQuestionInstructionPreviewDto>> AttachDiagramPreviewImagesAsync(
        IReadOnlyList<PdfRawQuestionInstructionPreviewDto> questionGroups,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        if (questionGroups.Count == 0 || pages.Count == 0)
        {
            return questionGroups.ToList();
        }

        var result = new List<PdfRawQuestionInstructionPreviewDto>(questionGroups.Count);
        foreach (var group in questionGroups)
        {
            result.Add(await AttachGroupVisualPreviewAsync(group, pages, pdfBytes, fileName, cancellationToken));
        }

        return result;
    }

    private async Task<PdfRawQuestionInstructionPreviewDto> AttachGroupVisualPreviewAsync(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        if (string.Equals(group.GroupType, "MAP_LABELLING", StringComparison.Ordinal) ||
            string.Equals(group.GroupType, "FLOWCHART_COMPLETION", StringComparison.Ordinal))
        {
            return await AttachDiagramPreviewImageAsync(group, pages, pdfBytes, fileName, cancellationToken);
        }

        return ShouldAttachMatchingVisualPreview(group)
            ? AttachMatchingVisualPreviewImages(group, pages)
            : group;
    }

    private bool UseGeminiDiagramCropAssist() =>
        configuration.GetValue<bool?>("GeminiPdfNativeExtraction:DiagramCropAssistEnabled") ?? true;

    private static bool ShouldAttachMatchingVisualPreview(PdfRawQuestionInstructionPreviewDto group)
    {
        if (!string.Equals(group.GroupType, "MATCHING_VISUALS", StringComparison.Ordinal))
        {
            return false;
        }

        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);
        return Regex.IsMatch(
            combined,
            @"(?i)\b(drawings?|diagrams?|figures?|maps?|plans?|pictures?|photos?|images?|illustrations?|projections?)\b");
    }

    private async Task<PdfRawQuestionInstructionPreviewDto?> TryAttachGeminiAssistedDiagramPreviewAsync(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<(PdfExtractedPage Page, DiagramPreviewCropBounds CropBounds, int Score)> candidates,
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        if (!UseGeminiDiagramCropAssist() ||
            candidates.Count == 0 ||
            pdfBytes.Length == 0)
        {
            return null;
        }

        try
        {
            var bestCandidate = candidates[0];
            var bestPage = bestCandidate.Page;
            var bestPageLines = BuildPdfWordLines(bestPage.Words);
            var instructionBottom = bestPageLines.Count > 0
                ? FindDiagramInstructionBottom(group, bestPage, bestPageLines)
                : null;
            var instructionBottomRatio = instructionBottom.HasValue && bestPage.PageHeight > 0
                ? instructionBottom.Value / bestPage.PageHeight
                : (double?)null;

            var prompt = BuildGeminiDiagramCropPrompt(group, candidates, instructionBottomRatio);
            var rawJson = await geminiPdfNativeExtractionClient.ExtractExamJsonAsync(
                pdfBytes,
                fileName,
                prompt,
                cancellationToken);
            SaveCropAssistDebugLog(group, prompt, rawJson);
            var response = DeserializeGeminiDiagramCropResponse(rawJson);
            if (response?.PageNumber is null || response.CropBox is null)
            {
                SaveCropAssistDebugLog(group, prompt, rawJson, "Deserialized response PageNumber or CropBox is null");
                return null;
            }

            var page = candidates
                .Select(candidate => candidate.Page)
                .FirstOrDefault(candidate => candidate.PageNumber == response.PageNumber.Value);
            if (page is null)
            {
                SaveCropAssistDebugLog(group, prompt, rawJson, $"Page number {response.PageNumber.Value} is not in candidates list");
                return null;
            }

            var cropBounds = BuildGeminiDiagramCropBounds(response.CropBox, page, group, instructionBottomRatio);
            if (cropBounds is null)
            {
                SaveCropAssistDebugLog(group, prompt, rawJson, "BuildGeminiDiagramCropBounds returned null (too small)");
                return null;
            }

            var renderedPreviewDataUrl = TryRenderDiagramPreviewDataUrl(
                pdfBytes,
                page.PageNumber,
                cropBounds);
            if (string.IsNullOrWhiteSpace(renderedPreviewDataUrl))
            {
                return null;
            }

            var confidenceText = response.Confidence.HasValue
                ? $" confidence {response.Confidence.Value:0.##}"
                : string.Empty;
            var reasonText = string.IsNullOrWhiteSpace(response.Reason)
                ? string.Empty
                : $" {response.Reason.Trim()}";
            var note = $"Gemini-assisted crop rendered from page {page.PageNumber}.{confidenceText}{reasonText}".Trim();

            return group with
            {
                VisualPreviewItems =
                [
                    new PdfRawVisualPreviewItemDto(
                        ImageDataUrl: renderedPreviewDataUrl,
                        PageNumber: page.PageNumber,
                        CropBox: BuildVisualCropBox(cropBounds))
                ],
                VisualPreviewNote = note,
                DiagramPreviewImageDataUrl = renderedPreviewDataUrl,
                DiagramPreviewPageNumber = page.PageNumber,
                DiagramPreviewNote = note
            };
        }
        catch (Exception ex)
        {
            logger.LogInformation(
                ex,
                "Gemini diagram crop assist failed for questions {StartQuestion}-{EndQuestion}; falling back to deterministic crop.",
                group.StartQuestion,
                group.EndQuestion);

            try
            {
                var prompt = BuildGeminiDiagramCropPrompt(group, candidates, null);
                SaveCropAssistDebugLog(group, prompt, string.Empty, ex.ToString());
            }
            catch { }

            return null;
        }
    }

    private async Task<PdfRawQuestionInstructionPreviewDto?> TryAttachGeminiAssistedDiagramPreviewAsync(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        if (!UseGeminiDiagramCropAssist() ||
            pdfBytes.Length == 0)
        {
            return null;
        }

        try
        {
            var instructionBottomRatioFullPdf = (double?)null;
            foreach (var candidatePage in pages)
            {
                var candidateLines = BuildPdfWordLines(candidatePage.Words);
                if (candidateLines.Count == 0)
                {
                    continue;
                }

                var instructionBottomCandidate = FindDiagramInstructionBottom(group, candidatePage, candidateLines);
                if (instructionBottomCandidate.HasValue && candidatePage.PageHeight > 0)
                {
                    instructionBottomRatioFullPdf = instructionBottomCandidate.Value / candidatePage.PageHeight;
                    break;
                }
            }

            var prompt = BuildGeminiDiagramCropPrompt(group, instructionBottomRatioFullPdf);
            var rawJson = await geminiPdfNativeExtractionClient.ExtractExamJsonAsync(
                pdfBytes,
                fileName,
                prompt,
                cancellationToken);
            SaveCropAssistDebugLog(group, prompt, rawJson);
            var response = DeserializeGeminiDiagramCropResponse(rawJson);
            if (response?.PageNumber is null || response.CropBox is null)
            {
                SaveCropAssistDebugLog(group, prompt, rawJson, "Deserialized full-PDF response PageNumber or CropBox is null");
                return null;
            }

            var page = pages.FirstOrDefault(p => p.PageNumber == response.PageNumber.Value);
            if (page is null)
            {
                SaveCropAssistDebugLog(group, prompt, rawJson, $"Full-PDF page number {response.PageNumber.Value} is not found in pages");
                return null;
            }

            var cropBounds = BuildGeminiDiagramCropBounds(response.CropBox, page, group, instructionBottomRatioFullPdf);
            if (cropBounds is null)
            {
                SaveCropAssistDebugLog(group, prompt, rawJson, "BuildGeminiDiagramCropBounds full-PDF returned null (too small)");
                return null;
            }

            var renderedPreviewDataUrl = TryRenderDiagramPreviewDataUrl(
                pdfBytes,
                response.PageNumber.Value,
                cropBounds);
            if (string.IsNullOrWhiteSpace(renderedPreviewDataUrl))
            {
                return null;
            }

            var confidenceText = response.Confidence.HasValue
                ? $" confidence {response.Confidence.Value:0.##}"
                : string.Empty;
            var reasonText = string.IsNullOrWhiteSpace(response.Reason)
                ? string.Empty
                : $" {response.Reason.Trim()}";
            var note = $"Gemini-assisted full-PDF crop rendered from page {response.PageNumber.Value}.{confidenceText}{reasonText}".Trim();

            return group with
            {
                VisualPreviewItems =
                [
                    new PdfRawVisualPreviewItemDto(
                        ImageDataUrl: renderedPreviewDataUrl,
                        PageNumber: response.PageNumber.Value,
                        CropBox: BuildVisualCropBox(cropBounds))
                ],
                VisualPreviewNote = note,
                DiagramPreviewImageDataUrl = renderedPreviewDataUrl,
                DiagramPreviewPageNumber = response.PageNumber.Value,
                DiagramPreviewNote = note
            };
        }
        catch (Exception ex)
        {
            logger.LogInformation(
                ex,
                "Gemini full-PDF diagram crop assist failed for questions {StartQuestion}-{EndQuestion}.",
                group.StartQuestion,
                group.EndQuestion);

            try
            {
                var prompt = BuildGeminiDiagramCropPrompt(group, null);
                SaveCropAssistDebugLog(group, prompt, string.Empty, ex.ToString());
            }
            catch { }

            return null;
        }
    }

    private static string BuildGeminiDiagramCropPrompt(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<(PdfExtractedPage Page, DiagramPreviewCropBounds CropBounds, int Score)> candidates,
        double? instructionBottomRatio)
    {
        var candidatePages = string.Join(
            ", ",
            candidates
                .Select(candidate => candidate.Page.PageNumber)
                .Distinct()
                .OrderBy(pageNumber => pageNumber));
        var snippets = string.Join(
            "\n\n",
            candidates
                .Select(candidate =>
                {
                    var textPreview = BuildDiagramCropTextPreview(candidate.Page.RawText, 1800);
                    return $"PAGE {candidate.Page.PageNumber} TEXT PREVIEW:\n{textPreview}";
                }));

        var instructionConstraint = instructionBottomRatio.HasValue
            ? $"\n        INSTRUCTION BOUNDARY (CRITICAL): The question instruction text (e.g. \"{group.Instruction}\") ends at Y = {instructionBottomRatio.Value:F4} (normalized ratio). The diagram starts AFTER this line. We will automatically fix the crop top boundary at Y = {instructionBottomRatio.Value:F4}. Your primary task is to identify where the diagram ENDS. Please make sure the crop_box height is large enough to cover the entire diagram down to its bottom boundary, but do not exceed the next question text."
            : string.Empty;

        return
        $$"""
        You are locating the visual asset needed by an IELTS Reading question group in the attached PDF.

        Target group:
        - question range: {{group.StartQuestion}}-{{group.EndQuestion}}
        - group type: {{group.GroupType}}
        - instruction: {{group.Instruction}}
        - question preview: {{group.QuestionPreview}}

        Candidate page(s): {{candidatePages}}

        {{snippets}}
        {{instructionConstraint}}

        Return ONLY valid JSON, no markdown.

        Find the rectangle around the diagram/flowchart/map/image AND all its associated text labels, description sentences, and question numbers (like "Whole tower can be raised...") that students must look at to answer questions {{group.StartQuestion}}-{{group.EndQuestion}}.
        
        CRITICAL RULES FOR FLOWCHART/DIAGRAM CROP:
        1. Coordinate normalization:
           - The crop_box coordinates (x, y, width, height) MUST be normalized float ratios relative to the full page width and height (strictly between 0.0 and 1.0).
           - Do NOT use absolute pixel coordinates (like 110, 75, 780, 520). You must convert them to ratios! (e.g. x = 0.05, y = 0.48).
        2. Top boundary:
           - The top of the crop box starts after the instruction. If a fixed boundary Y = {{(instructionBottomRatio.HasValue ? instructionBottomRatio.Value.ToString("F4") : "instruction bottom")}} is provided, we will enforce it.
           - Ensure the crop box includes any description sentences and question labels (like "Whole tower can be raised...") pointing to the top parts of the diagram.
        3. Flowchart vs Option list:
           - If the page contains a list of options (e.g., options A-F like "A Timber and petro-chemical industries threatened...") at the top, and a flowchart/diagram structure with placeholders (like "[27] ....", "[28] ....") at the bottom, you MUST prioritize cropping the flowchart structure at the bottom.
           - Identify where the visual diagram or flowchart structure begins and ends. The crop box should strictly encompass all visual elements, lines, and shape boxes of the diagram.
           - Do NOT include the A-F option table/list in your crop box. It is plain text and already rendered as text questions.
        4. Margins:
           - Include enough margin so no boxes/arrows/labels/placeholders are cut off.
        5. Exclude answer sheet / other questions:
           - Do NOT include any answer sheets, answer inputs, dropdown lists, or check-boxes (e.g. where students input answers for questions like 27-31) in your crop box.
           - Do NOT include title text or instructions for the NEXT question group (e.g. "Questions 32-33").
           - Make the bottom boundary of the crop box tight to the lowest element of the flowchart/diagram itself.
        6. Include diagram labels and description sentences:
           - Description sentences, text labels, and question numbers (e.g. "23", "24", etc. or "Air bubbles result from...") that point to the diagram are an integral part of the diagram itself.
           - You MUST include these description text blocks and labels inside the crop box so students can read them.
           - Only exclude a plain, separate numbered list of questions if it is not physically connected or pointing to the diagram.

        JSON schema:
        {
          "page_number": 1,
          "crop_box": { "x": 0.05, "y": 0.52, "width": 0.90, "height": 0.43 },
          "confidence": 0.0,
          "reason": "short reason explaining why this crop box strictly contains the flowchart structure and excludes the option lists and answer dropdowns"
        }
        """;
    }

    private static string BuildGeminiDiagramCropPrompt(
        PdfRawQuestionInstructionPreviewDto group,
        double? instructionBottomRatio)
    {
        var instructionConstraint = instructionBottomRatio.HasValue
            ? $"\n        INSTRUCTION BOUNDARY (CRITICAL): The question instruction text (e.g. \"{group.Instruction}\") ends at Y = {instructionBottomRatio.Value:F4} (normalized ratio). The diagram starts AFTER this line. We will automatically fix the crop top boundary at Y = {instructionBottomRatio.Value:F4}. Your primary task is to identify where the diagram ENDS. Please make sure the crop_box height is large enough to cover the entire diagram down to its bottom boundary, but do not exceed the next question text."
            : string.Empty;

        return
        $$"""
        You are locating the visual asset needed by an IELTS Reading question group in the attached PDF.

        Target group:
        - question range: {{group.StartQuestion}}-{{group.EndQuestion}}
        - group type: {{group.GroupType}}
        - instruction: {{group.Instruction}}
        - question preview: {{group.QuestionPreview}}
        {{instructionConstraint}}

        Return ONLY valid JSON, no markdown.

        Find the rectangle around the diagram/flowchart/map/image AND all its associated text labels, description sentences, and question numbers (like "Whole tower can be raised...") that students must look at to answer questions {{group.StartQuestion}}-{{group.EndQuestion}}.
        
        CRITICAL RULES FOR FLOWCHART/DIAGRAM CROP:
        1. Coordinate normalization:
           - The crop_box coordinates (x, y, width, height) MUST be normalized float ratios relative to the full page width and height (strictly between 0.0 and 1.0).
           - Do NOT use absolute pixel coordinates (like 110, 75, 780, 520). You must convert them to ratios! (e.g. x = 0.05, y = 0.48).
        2. Top boundary:
           - The top of the crop box starts after the instruction. If a fixed boundary Y = {{(instructionBottomRatio.HasValue ? instructionBottomRatio.Value.ToString("F4") : "instruction bottom")}} is provided, we will enforce it.
           - Ensure the crop box includes any description sentences and question labels (like "Whole tower can be raised...") pointing to the top parts of the diagram.
        3. Flowchart vs Option list:
           - If the page contains a list of options (e.g., options A-F like "A Timber and petro-chemical industries threatened...") at the top, and a flowchart/diagram structure with placeholders (like "[27] ....", "[28] ....") at the bottom, you MUST prioritize cropping the flowchart structure at the bottom.
           - Identify where the visual diagram or flowchart structure begins and ends. The crop box should strictly encompass all visual elements, lines, and shape boxes of the diagram.
           - Do NOT include the A-F option table/list in your crop box. It is plain text and already rendered as text questions.
        4. Margins:
           - Include enough margin so no boxes/arrows/labels/placeholders are cut off.
        5. Exclude answer sheet / other questions:
           - Do NOT include any answer sheets, answer inputs, dropdown lists, or check-boxes (e.g. where students input answers for questions like 27-31) in your crop box.
           - Do NOT include title text or instructions for the NEXT question group (e.g. "Questions 32-33").
           - Make the bottom boundary of the crop box tight to the lowest element of the flowchart/diagram itself.
        6. Include diagram labels and description sentences:
           - Description sentences, text labels, and question numbers (e.g. "23", "24", etc. or "Air bubbles result from...") that point to the diagram are an integral part of the diagram itself.
           - You MUST include these description text blocks and labels inside the crop box so students can read them.
           - Only exclude a plain, separate numbered list of questions if it is not physically connected or pointing to the diagram.

        JSON schema:
        {
          "page_number": 1,
          "crop_box": { "x": 0.05, "y": 0.52, "width": 0.90, "height": 0.43 },
          "confidence": 0.0,
          "reason": "short reason explaining why this crop box strictly contains the flowchart structure and excludes the option lists and answer dropdowns"
        }
        """;
    }

    private static string BuildDiagramCropTextPreview(string rawText, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return "[empty]";
        }

        var normalized = Regex.Replace(rawText, @"\s+", " ").Trim();
        return normalized.Length <= maxLength
            ? normalized
            : normalized[..maxLength] + "...";
    }

    private static GeminiDiagramCropResponse? DeserializeGeminiDiagramCropResponse(string json)
    {
        var normalized = NormalizeJson(json);
        var start = normalized.IndexOf('{');
        var end = normalized.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return null;
        }

        normalized = normalized[start..(end + 1)];
        return JsonSerializer.Deserialize<GeminiDiagramCropResponse>(normalized, JsonOptions);
    }

    private static DiagramPreviewCropBounds? BuildGeminiDiagramCropBounds(
        GeminiDiagramCropBox cropBox,
        PdfExtractedPage page,
        PdfRawQuestionInstructionPreviewDto group,
        double? instructionBottomRatio = null)
    {
        double pageHeight = page.PageHeight;

        double x = cropBox.X;
        double y = cropBox.Y;
        double width = cropBox.Width;
        double height = cropBox.Height;

        if (x > 1.0d)
        {
            x = x / 1000.0d;
        }
        if (width > 1.0d)
        {
            width = width / 1000.0d;
        }
        if (y > 1.0d)
        {
            y = y / 1000.0d;
        }
        if (height > 1.0d)
        {
            height = height / 1000.0d;
        }

        var left = Math.Clamp(x, 0d, 0.98d);
        var top = Math.Clamp(y, 0d, 0.98d);
        var right = Math.Clamp(x + width, left + 0.02d, 1d);

        var resolvedInstructionBottomRatio = instructionBottomRatio;
        if (!resolvedInstructionBottomRatio.HasValue)
        {
            var lines = BuildPdfWordLines(page.Words);
            if (lines.Count > 0)
            {
                var headerBottom = FindDiagramInstructionBottom(group, page, lines);
                if (headerBottom.HasValue)
                {
                    resolvedInstructionBottomRatio = headerBottom.Value / pageHeight;
                }
            }
        }

        if (resolvedInstructionBottomRatio.HasValue)
        {
            top = resolvedInstructionBottomRatio.Value + 0.002d;
        }

        var bottom = Math.Clamp(y + height, top + 0.02d, 1d);

        var lines2 = BuildPdfWordLines(page.Words);
        if (lines2.Count > 0)
        {
            double? nextGroupHeaderTop = null;
            var nextGroupNumber = group.EndQuestion + 1;
            var nextGroupRegex = new Regex($@"(?i)questions?\s*{nextGroupNumber}\b");
            var nextGroupLine = lines2
                .Where(line => line.TopFromPageTop >= top * pageHeight)
                .FirstOrDefault(line => nextGroupRegex.IsMatch(line.Text));
            if (nextGroupLine is not null)
            {
                nextGroupHeaderTop = nextGroupLine.TopFromPageTop;
            }

            if (nextGroupHeaderTop is not null)
            {
                var nextGroupRatio = nextGroupHeaderTop.Value / pageHeight;
                bottom = Math.Min(bottom, nextGroupRatio - 0.01d);
            }
        }

        if (top >= bottom - 0.02d)
        {
            top = resolvedInstructionBottomRatio.HasValue
                ? resolvedInstructionBottomRatio.Value + 0.002d
                : Math.Clamp(y, 0d, 0.98d);
            bottom = Math.Clamp(y + height, top + 0.02d, 1d);
        }

        var marginX = Math.Max(0.01d, (right - left) * 0.02d);
        left = Math.Clamp(left - marginX, 0d, 0.98d);
        right = Math.Clamp(right + marginX, left + 0.02d, 1d);

        left = Math.Min(left, 0.05d);
        right = Math.Max(right, 0.95d);

        if (right - left < 0.08d || bottom - top < 0.06d)
        {
            return null;
        }

        return new DiagramPreviewCropBounds(
            TopRatio: top,
            BottomRatio: bottom,
            HasExplicitBottomBoundary: true,
            HasExplicitInstructionBoundary: resolvedInstructionBottomRatio.HasValue,
            LeftRatio: left,
            RightRatio: right);
    }

    private static PdfVisualCropBoxDto BuildVisualCropBox(DiagramPreviewCropBounds cropBounds) =>
        new(
            X: Math.Round(cropBounds.LeftRatio, 4),
            Y: Math.Round(cropBounds.TopRatio, 4),
            Width: Math.Round(cropBounds.RightRatio - cropBounds.LeftRatio, 4),
            Height: Math.Round(cropBounds.BottomRatio - cropBounds.TopRatio, 4));

    private async Task<PdfRawQuestionInstructionPreviewDto> AttachDiagramPreviewImageAsync(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        var candidates = FindDiagramPreviewCandidates(group, pages);
        if (candidates.Count == 0)
        {
            var geminiAssistedPreviewWithoutCandidates = await TryAttachGeminiAssistedDiagramPreviewAsync(
                group,
                pages,
                pdfBytes,
                fileName,
                cancellationToken);
            if (geminiAssistedPreviewWithoutCandidates is not null)
            {
                return geminiAssistedPreviewWithoutCandidates;
            }

            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this diagram.",
                DiagramPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this diagram."
            };
        }

        var geminiAssistedPreview = await TryAttachGeminiAssistedDiagramPreviewAsync(
            group,
            candidates,
            pdfBytes,
            fileName,
            cancellationToken);
        if (geminiAssistedPreview is not null)
        {
            return geminiAssistedPreview;
        }

        foreach (var candidate in candidates)
        {
            var renderedPreviewDataUrl = TryRenderDiagramPreviewDataUrl(pdfBytes, candidate.Page.PageNumber, candidate.CropBounds);
            if (!string.IsNullOrWhiteSpace(renderedPreviewDataUrl))
            {
                return group with
                {
                    VisualPreviewItems =
                    [
                        new PdfRawVisualPreviewItemDto(
                            ImageDataUrl: renderedPreviewDataUrl,
                            PageNumber: candidate.Page.PageNumber,
                            CropBox: BuildVisualCropBox(candidate.CropBounds))
                    ],
                    VisualPreviewNote = $"Preview rendered from page {candidate.Page.PageNumber}.",
                    DiagramPreviewImageDataUrl = renderedPreviewDataUrl,
                    DiagramPreviewPageNumber = candidate.Page.PageNumber,
                    DiagramPreviewNote = $"Preview rendered from page {candidate.Page.PageNumber}."
                };
            }
        }

        foreach (var candidate in candidates)
        {
            var relevantImages = GetImagesRelevantToQuestionBlock(group, candidate.Page);
            if (relevantImages.Count == 0)
            {
                continue;
            }

            var previewImage = relevantImages[0];
            return group with
            {
                VisualPreviewItems =
                [
                    new PdfRawVisualPreviewItemDto(
                        ImageDataUrl: previewImage.DataUrl,
                        PageNumber: candidate.Page.PageNumber)
                ],
                VisualPreviewNote = relevantImages.Count > 1
                    ? $"Best-effort preview from the largest extractable image on page {candidate.Page.PageNumber}."
                    : $"Preview extracted from page {candidate.Page.PageNumber}.",
                DiagramPreviewImageDataUrl = previewImage.DataUrl,
                DiagramPreviewPageNumber = candidate.Page.PageNumber,
                DiagramPreviewNote = relevantImages.Count > 1
                    ? $"Best-effort preview from the largest extractable image on page {candidate.Page.PageNumber}."
                    : $"Preview extracted from page {candidate.Page.PageNumber}."
            };
        }

        var geminiAssistedPreviewAfterCandidateFailure = await TryAttachGeminiAssistedDiagramPreviewAsync(
            group,
            pages,
            pdfBytes,
            fileName,
            cancellationToken);
        if (geminiAssistedPreviewAfterCandidateFailure is not null)
        {
            return geminiAssistedPreviewAfterCandidateFailure;
        }

        var firstCandidatePage = candidates[0].Page.PageNumber;

        return group with
        {
            VisualPreviewNote = $"Preview unavailable: detected page {firstCandidatePage}, but no extractable image was found there.",
            DiagramPreviewPageNumber = firstCandidatePage,
            DiagramPreviewNote = $"Preview unavailable: detected page {firstCandidatePage}, but no extractable image was found there."
        };
    }

    private static List<(PdfExtractedPage Page, DiagramPreviewCropBounds CropBounds, int Score)> FindDiagramPreviewCandidates(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var anchorPage = FindBestDiagramPreviewPage(group, pages);
        if (anchorPage is null)
        {
            return [];
        }

        var anchorIndex = pages
            .Select((page, index) => new { page.PageNumber, Index = index })
            .FirstOrDefault(item => item.PageNumber == anchorPage.PageNumber)?
            .Index ?? -1;
        if (anchorIndex < 0)
        {
            return [];
        }

        return pages
            .Skip(anchorIndex)
            .Take(3)
            .Select((page, offset) => new
            {
                Page = page,
                Offset = offset,
                CropBounds = TryBuildDiagramPreviewCrop(group, page)
                    ?? TryBuildContinuationDiagramPreviewCrop(group, page)
            })
            .Where(item => item.CropBounds is not null)
            .Select(item => (
                Page: item.Page,
                CropBounds: item.CropBounds!,
                Score: ScoreDiagramPreviewCandidate(group, item.Page, item.CropBounds!, item.Offset)))
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();
    }

    private static int ScoreDiagramPreviewCandidate(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds,
        int pageOffsetFromAnchor)
    {
        var score = 0;
        var cropWordCount = CountWordsInsideDiagramCrop(page, cropBounds);
        var cropLineCount = CountLinesInsideDiagramCrop(page, cropBounds);
        var cropComparableText = BuildDiagramCropComparableText(page, cropBounds);
        var questionTokenMatches = CountComparableTokenMatches(
            cropComparableText,
            BuildComparableSearchTokens(group.QuestionPreview));
        var expectedQuestionNumberCount = CountExpectedQuestionNumbersInsideDiagramCrop(group, page, cropBounds);
        var foreignQuestionNumberCount = CountForeignQuestionNumbersInsideDiagramCrop(group, page, cropBounds);

        if (cropBounds.HasExplicitBottomBoundary)
        {
            score += 80;
        }

        if (cropBounds.HasExplicitInstructionBoundary)
        {
            score += 35;
        }

        score += Math.Min(50, cropWordCount * 2);
        score += Math.Min(18, cropLineCount * 3);
        score += Math.Max(0, 20 - (pageOffsetFromAnchor * 5));
        score += Math.Min(10, page.Images.Count * 2);
        score += Math.Min(40, questionTokenMatches * 4);
        score += Math.Min(70, expectedQuestionNumberCount * 18);

        if (foreignQuestionNumberCount > 0)
        {
            score -= Math.Min(120, foreignQuestionNumberCount * 24);
        }

        if (!cropBounds.HasExplicitBottomBoundary && cropWordCount <= 8)
        {
            score -= 40;
        }

        if (!cropBounds.HasExplicitBottomBoundary && cropLineCount <= 2)
        {
            score -= 20;
        }

        if (pageOffsetFromAnchor > 0 &&
            !cropBounds.HasExplicitInstructionBoundary &&
            expectedQuestionNumberCount == 0)
        {
            score -= 70;
        }

        if (pageOffsetFromAnchor > 0 && foreignQuestionNumberCount > expectedQuestionNumberCount)
        {
            score -= 50;
        }

        return score;
    }

    private static int CountWordsInsideDiagramCrop(PdfExtractedPage page, DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return page.Words.Count(word =>
        {
            var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
            return center >= top && center <= bottom;
        });
    }

    private static int CountLinesInsideDiagramCrop(PdfExtractedPage page, DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return BuildPdfWordLines(page.Words)
            .Count(line =>
            {
                var center = (line.TopFromPageTop + line.BottomFromPageTop) / 2d;
                return center >= top && center <= bottom;
            });
    }

    private static string BuildDiagramCropComparableText(
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        var cropText = string.Join(
            ' ',
            page.Words
                .Where(word =>
                {
                    var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
                    return center >= top && center <= bottom;
                })
                .Select(word => word.Text));

        return NormalizeComparableText(cropText);
    }

    private static int CountExpectedQuestionNumbersInsideDiagramCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return ExtractQuestionNumbersInsideDiagramCrop(page, cropBounds)
            .Count(number => expectedNumbers.Contains(number));
    }

    private static int CountForeignQuestionNumbersInsideDiagramCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return ExtractQuestionNumbersInsideDiagramCrop(page, cropBounds)
            .Count(number => !expectedNumbers.Contains(number));
    }

    private static HashSet<string> ExtractQuestionNumbersInsideDiagramCrop(
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return page.Words
            .Where(word =>
            {
                var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
                return center >= top && center <= bottom;
            })
            .Select(word => word.Text.Trim())
            .Where(text => Regex.IsMatch(text, @"^\d{1,2}$"))
            .ToHashSet(StringComparer.Ordinal);
    }

    private static void SaveCropAssistDebugLog(
        PdfRawQuestionInstructionPreviewDto group,
        string prompt,
        string rawJson,
        string? error = null)
    {
        var debugDir = ActiveDebugDirectory.Value;
        if (string.IsNullOrWhiteSpace(debugDir))
        {
            return;
        }

        try
        {
            var payload = new
            {
                startQuestion = group.StartQuestion,
                endQuestion = group.EndQuestion,
                prompt = prompt,
                rawJson = rawJson,
                error = error
            };
            var path = Path.Combine(debugDir, $"crop-assist-q{group.StartQuestion}-{group.EndQuestion}.json");
            File.WriteAllText(path, JsonSerializer.Serialize(payload, JsonOptions));
        }
        catch { }
    }
}