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
    private bool UseGeminiNativePdfExtraction() =>
        configuration.GetValue<bool?>("GeminiPdfNativeExtraction:Enabled") ?? true;

    private async Task<NativePdfExtractionResult> ExtractExamFromNativePdfWithGeminiAsync(
        byte[] pdfBytes,
        string fileName,
        string? debugDirectory,
        CancellationToken cancellationToken)
    {
        var pdfProfile = BuildNativePdfPageProfile(pdfBytes);
        var payload = await ExtractExamFromNativePdfWithGeminiByPassageAsync(
            pdfBytes,
            fileName,
            pdfProfile,
            rawJson: null,
            debugDirectory,
            cancellationToken);

        RepairQuestionTemplateTokens(payload);
        ExpandMultiBlankCompletionRows(payload.Passages, new Dictionary<int, string>());
        ValidateNativePdfExtractionPayload(payload);

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        return new NativePdfExtractionResult(json, payload);
    }

    private static (int Start, int End)[] InferredQuestionRangesFromRawJson(string? rawJson)
    {
        var ranges = new (int Start, int End)[] { (1, 13), (14, 26), (27, 40) };
        if (string.IsNullOrWhiteSpace(rawJson))
        {
            return ranges;
        }

        try
        {
            var matches = Regex.Matches(rawJson, @"(?i)""passage_title""\s*:");
            if (matches.Count == 0)
            {
                return ranges;
            }

            var indices = matches.Cast<Match>().Select(m => m.Index).ToList();
            var passageQuestions = new List<List<int>>();

            for (int i = 0; i < indices.Count; i++)
            {
                var startIdx = indices[i];
                var endIdx = i < indices.Count - 1 ? indices[i + 1] : rawJson.Length;
                var subJson = rawJson[startIdx..endIdx];

                var qMatches = Regex.Matches(subJson, @"(?i)""question_number""\s*:\s*""?(\d+)""?");
                var qNumbers = qMatches.Cast<Match>()
                    .Select(m => int.TryParse(m.Groups[1].Value, out var n) ? n : -1)
                    .Where(n => n >= 1 && n <= 45)
                    .OrderBy(n => n)
                    .ToList();

                passageQuestions.Add(qNumbers);
            }

            var inferredRanges = new List<(int Start, int End)>();
            for (int i = 0; i < 3; i++)
            {
                int start = 1 + (i * 13);
                int end = (i == 2) ? 45 : (i + 1) * 13;

                if (i < passageQuestions.Count && passageQuestions[i].Count > 0)
                {
                    start = passageQuestions[i].Min();
                    end = passageQuestions[i].Max();
                }
                else if (i > 0 && inferredRanges.Count > i - 1)
                {
                    start = inferredRanges[i - 1].End + 1;
                    end = (i == 2) ? 45 : start + 12;
                }

                inferredRanges.Add((start, end));
            }

            if (inferredRanges[0].Start < 1) inferredRanges[0] = (1, inferredRanges[0].End);
            
            var p1Start = 1;
            var p1End = inferredRanges[0].End >= 1 ? inferredRanges[0].End : 13;
            if (p1End >= 25) p1End = 13;

            var p2Start = p1End + 1;
            var p2End = inferredRanges[1].End >= p2Start ? inferredRanges[1].End : p2Start + 12;
            if (p2End >= 38) p2End = p2Start + 12;

            var p3Start = p2End + 1;
            var p3End = inferredRanges[2].End;
            if (p3End < p3Start) p3End = p3Start + 13;
            if (p3End > 40) p3End = 40;

            return new (int Start, int End)[]
            {
                (p1Start, p1End),
                (p2Start, p2End),
                (p3Start, p3End)
            };
        }
        catch
        {
            return ranges;
        }
    }

    private static (int Start, int End)[] InferredQuestionRangesFromRawPassages(IReadOnlyList<string> rawPassages)
    {
        var ranges = new (int Start, int End)[] { (1, 13), (14, 26), (27, 40) };
        if (rawPassages == null || rawPassages.Count != 3)
        {
            return ranges;
        }

        var detectedStarts = new List<int>[3] { new(), new(), new() };
        var detectedEnds = new List<int>[3] { new(), new(), new() };

        for (int i = 0; i < 3; i++)
        {
            var text = rawPassages[i];
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            var matches = QuestionRangeBoundaryRegex().Matches(text);
            foreach (Match match in matches)
            {
                if (TryParseBoundaryQuestions(match, out var startVal, out var endVal))
                {
                    bool isPlausible = false;
                    if (i == 0) isPlausible = (startVal >= 1 && endVal <= 20);
                    else if (i == 1) isPlausible = (startVal >= 10 && endVal <= 32);
                    else if (i == 2) isPlausible = (startVal >= 25 && endVal <= 45);

                    if (isPlausible)
                    {
                        detectedStarts[i].Add(startVal);
                        detectedEnds[i].Add(endVal);
                    }
                }
            }
        }

        int p1End = detectedEnds[0].Count > 0 ? detectedEnds[0].Max() : -1;
        int p2Start = detectedStarts[1].Count > 0 ? detectedStarts[1].Min() : -1;
        int p2End = detectedEnds[1].Count > 0 ? detectedEnds[1].Max() : -1;
        int p3Start = detectedStarts[2].Count > 0 ? detectedStarts[2].Min() : -1;
        int p3End = detectedEnds[2].Count > 0 ? detectedEnds[2].Max() : -1;

        if (p1End == -1)
        {
            p1End = p2Start > 1 ? p2Start - 1 : 13;
        }

        if (p2Start == -1)
        {
            p2Start = p1End + 1;
        }
        else
        {
            p1End = p2Start - 1;
        }

        if (p2End == -1)
        {
            p2End = p3Start > 1 ? p3Start - 1 : p2Start + 12;
        }

        if (p3Start == -1)
        {
            p3Start = p2End + 1;
        }
        else
        {
            p2End = p3Start - 1;
        }

        if (p1End < 1 || p1End >= 45)
        {
            p1End = 13;
        }

        p2Start = p1End + 1;
        if (p2End <= p2Start || p2End >= 45)
        {
            p2End = p2Start + 12;
        }
        if (p2End >= 45)
        {
            p2End = 44;
        }

        int p3StartComputed = p2End + 1;
        if (p3End == -1 || p3End < p3StartComputed)
        {
            p3End = 40;
        }
        if (p3End > 40)
        {
            p3End = 40;
        }

        return new (int Start, int End)[]
        {
            (1, p1End),
            (p2Start, p2End),
            (p3StartComputed, p3End)
        };
    }

    private async Task<GeminiNativePdfExtractionPayload> ExtractExamFromNativePdfWithGeminiByPassageAsync(
        byte[] pdfBytes,
        string fileName,
        NativePdfPageProfile pdfProfile,
        string? rawJson,
        string? debugDirectory,
        CancellationToken cancellationToken)
    {
        var rawPassages = BuildNativePdfRawPassages(pdfBytes);
        var ranges = rawPassages.Count == 3
            ? InferredQuestionRangesFromRawPassages(rawPassages)
            : InferredQuestionRangesFromRawJson(rawJson);
        var passages = new List<GemmaPassagePayload>(3);
        for (var passageNumber = 1; passageNumber <= 3; passageNumber++)
        {
            var range = ranges[passageNumber - 1];
            var prompt = BuildGeminiNativePdfPassageExtractionPrompt(
                fileName,
                pdfProfile,
                passageNumber,
                range.Start,
                range.End);

            string json;
            try
            {
                json = await geminiPdfNativeExtractionClient.ExtractExamJsonAsync(
                    pdfBytes,
                    fileName,
                    prompt,
                    cancellationToken);

                if (!string.IsNullOrWhiteSpace(debugDirectory))
                {
                    try
                    {
                        var promptPath = Path.Combine(debugDirectory, $"00-prompt-passage-{passageNumber}.txt");
                        await File.WriteAllTextAsync(promptPath, prompt, CancellationToken.None);

                        var rawJsonPath = Path.Combine(debugDirectory, $"00-raw-gemini-passage-{passageNumber}.json");
                        await File.WriteAllTextAsync(rawJsonPath, json, CancellationToken.None);
                    }
                    catch (Exception logEx)
                    {
                        logger.LogWarning(logEx, "Failed to write raw json or prompt for passage {PassageNumber} to debug directory", passageNumber);
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "[CRITICAL] Gemini native PDF extraction API call failed for passage {PassageNumber} (Questions {Start}-{End}): {Message}",
                    passageNumber,
                    range.Start,
                    range.End,
                    ex.Message);

                if (!string.IsNullOrWhiteSpace(debugDirectory))
                {
                    try
                    {
                        var errorPath = Path.Combine(debugDirectory, $"00-api-error-passage-{passageNumber}.txt");
                        var errorContent = $"API call failed at: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n" +
                                           $"Passage Number: {passageNumber}\n" +
                                           $"Questions Range: {range.Start}-{range.End}\n" +
                                           $"Error Message: {ex.Message}\n\n" +
                                           $"Stack Trace:\n{ex.StackTrace}";
                        await File.WriteAllTextAsync(errorPath, errorContent, CancellationToken.None);
                    }
                    catch (Exception logEx)
                    {
                        logger.LogWarning(logEx, "Failed to write api error log for passage {PassageNumber} to debug directory", passageNumber);
                    }
                }
                throw;
            }

            try
            {
                var passage = DeserializeNativePdfPassageExtractionPayload(json);
                passages.Add(passage);

                if (!string.IsNullOrWhiteSpace(debugDirectory))
                {
                    try
                    {
                        var parsedJsonPath = Path.Combine(debugDirectory, $"01-parsed-gemini-passage-{passageNumber}.json");
                        await File.WriteAllTextAsync(parsedJsonPath, JsonSerializer.Serialize(passage, JsonOptions), CancellationToken.None);
                    }
                    catch (Exception logEx)
                    {
                        logger.LogWarning(logEx, "Failed to write parsed json for passage {PassageNumber} to debug directory", passageNumber);
                    }
                }
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException)
            {
                if (!string.IsNullOrWhiteSpace(debugDirectory))
                {
                    try
                    {
                        var errorPath = Path.Combine(debugDirectory, $"00-parse-error-passage-{passageNumber}.txt");
                        var errorContent = $"JSON parsing failed at: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n" +
                                           $"Passage Number: {passageNumber}\n" +
                                           $"Error Message: {ex.Message}\n\n" +
                                           $"Raw JSON:\n{json}";
                        await File.WriteAllTextAsync(errorPath, errorContent, CancellationToken.None);
                    }
                    catch (Exception logEx)
                    {
                        logger.LogWarning(logEx, "Failed to write parse error log for passage {PassageNumber} to debug directory", passageNumber);
                    }
                }

                await SaveNativePdfFailedRawDebugArtifactAsync(
                    $"{Path.GetFileNameWithoutExtension(fileName)}-passage-{passageNumber}.pdf",
                    json,
                    ex.Message,
                    pdfProfile,
                    cancellationToken);

                throw new InvalidOperationException(
                    $"Gemini native PDF extraction retry for passage {passageNumber} returned invalid/incomplete JSON. {ex.Message}",
                    ex);
            }
        }

        return new GeminiNativePdfExtractionPayload
        {
            Passages = passages
        };
    }

    private static GeminiNativePdfExtractionPayload DeserializeNativePdfExtractionPayload(string json)
    {
        var normalized = JsonFenceRegex().Replace(json.Trim(), string.Empty).Trim();
        var start = normalized.IndexOf('{');
        var end = normalized.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            throw new InvalidOperationException("Gemini native PDF extraction did not return a JSON object.");
        }

        normalized = normalized[start..(end + 1)];
        return JsonSerializer.Deserialize<GeminiNativePdfExtractionPayload>(normalized, JsonOptions) ??
               throw new InvalidOperationException("Gemini native PDF extraction JSON could not be deserialized.");
    }

    private static GemmaPassagePayload DeserializeNativePdfPassageExtractionPayload(string json)
    {
        var normalized = NormalizeJson(json);
        var start = normalized.IndexOf('{');
        var end = normalized.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            throw new InvalidOperationException("Gemini native PDF passage extraction did not return a JSON object.");
        }

        normalized = normalized[start..(end + 1)];
        return JsonSerializer.Deserialize<GemmaPassagePayload>(normalized, JsonOptions) ??
               throw new InvalidOperationException("Gemini native PDF passage extraction JSON could not be deserialized.");
    }

    private static void ValidateNativePdfExtractionPayload(GeminiNativePdfExtractionPayload payload)
    {
        if (payload.Passages.Count != 3)
        {
            throw new InvalidOperationException(
                $"Gemini native PDF extraction returned {payload.Passages.Count} passage(s). Expected exactly 3.");
        }

        foreach (var passage in payload.Passages)
        {
            if (passage.Questions != null)
            {
                passage.Questions = passage.Questions
                    .Where(q =>
                    {
                        var number = ParseQuestionNumber(ReadJsonAsText(q.QuestionNumber));
                        return number.HasValue && number.Value <= 40;
                    })
                    .ToList();
            }
        }

        var questionNumbers = payload.Passages
            .SelectMany(passage => passage.Questions ?? [])
            .Select(question => ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber)))
            .Where(number => number.HasValue)
            .Select(number => number!.Value)
            .OrderBy(number => number)
            .ToList();
        var missing = Enumerable.Range(1, 40).Except(questionNumbers).ToList();
        var duplicates = questionNumbers
            .GroupBy(number => number)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();

        if (missing.Count > 0 || duplicates.Count > 0)
        {
            var issues = new List<string>();
            if (missing.Count > 0)
            {
                issues.Add($"missing question(s): {string.Join(", ", missing)}");
            }

            if (duplicates.Count > 0)
            {
                issues.Add($"duplicated question(s): {string.Join(", ", duplicates)}");
            }

            throw new InvalidOperationException(
                "Gemini native PDF extraction did not return a complete 1-40 IELTS Reading question set: " +
                string.Join("; ", issues));
        }

        var invalidCompletionTemplates = payload.Passages
            .SelectMany(passage => passage.Questions ?? [])
            .Select(question => new
            {
                Number = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber)),
                Type = MapQuestionType(ReadJsonAsText(question.QuestionType)),
                Text = ReadJsonAsText(question.QuestionText)
            })
            .Where(item =>
                item.Number.HasValue &&
                IsCompletionTemplateType(item.Type) &&
                !ContainsOwnQuestionTemplateToken(item.Text, item.Number.Value))
            .Select(item => item.Number!.Value)
            .OrderBy(number => number)
            .ToList();
        if (invalidCompletionTemplates.Count > 0)
        {
            throw new InvalidOperationException(
                "Gemini native PDF extraction returned FillInBlanks question_text without an exact [Qn] blank token for question(s): " +
                string.Join(", ", invalidCompletionTemplates));
        }
    }

    private static void RepairQuestionTemplateTokens(GeminiNativePdfExtractionPayload payload)
    {
        foreach (var passage in payload.Passages)
        {
            foreach (var question in passage.Questions ?? [])
            {
                var questionNumberStr = ReadJsonAsText(question.QuestionNumber);
                var questionNumber = ParseQuestionNumber(questionNumberStr);
                var questionType = MapQuestionType(ReadJsonAsText(question.QuestionType));

                if (questionNumber.HasValue && IsCompletionTemplateType(questionType))
                {
                    var text = ReadJsonAsText(question.QuestionText);
                    if (!ContainsOwnQuestionTemplateToken(text, questionNumber.Value))
                    {
                        var repairedText = text;
                        if (TryRepairQuestionTemplateToken(ref repairedText, questionNumber.Value))
                        {
                            question.QuestionText = JsonSerializer.SerializeToElement(repairedText);
                        }
                    }
                }
            }
        }
    }

    private static bool TryRepairQuestionTemplateToken(ref string? questionText, int questionNumber)
    {
        var expectedToken = $"[Q{questionNumber}]";
        if (string.IsNullOrWhiteSpace(questionText))
        {
            questionText = expectedToken;
            return true;
        }

        if (Regex.IsMatch(questionText, @"\[\s*Q\s*n\s*\]", RegexOptions.IgnoreCase))
        {
            questionText = Regex.Replace(questionText, @"\[\s*Q\s*n\s*\]", expectedToken, RegexOptions.IgnoreCase);
            return true;
        }

        if (Regex.IsMatch(questionText, $@"\[\s*Q\s*{questionNumber}\s*\]", RegexOptions.IgnoreCase))
        {
            questionText = Regex.Replace(questionText, $@"\[\s*Q\s*{questionNumber}\s*\]", expectedToken, RegexOptions.IgnoreCase);
            return true;
        }

        if (Regex.IsMatch(questionText, $@"\[\s*{questionNumber}\s*\]"))
        {
            questionText = Regex.Replace(questionText, $@"\[\s*{questionNumber}\s*\]", expectedToken);
            return true;
        }
        if (Regex.IsMatch(questionText, $@"\(\s*{questionNumber}\s*\)"))
        {
            questionText = Regex.Replace(questionText, $@"\(\s*{questionNumber}\s*\)", expectedToken);
            return true;
        }

        var underlinePattern = @"_{2,}|-{2,}|\.{3,}";
        if (Regex.IsMatch(questionText, $@"\b{questionNumber}\s*(?:[).:-]\s*)?(?:{underlinePattern})"))
        {
            questionText = Regex.Replace(questionText, $@"\b{questionNumber}\s*(?:[).:-]\s*)?(?:{underlinePattern})", expectedToken);
            return true;
        }
        if (Regex.IsMatch(questionText, $@"(?:{underlinePattern})\s*\b{questionNumber}\b"))
        {
            questionText = Regex.Replace(questionText, $@"(?:{underlinePattern})\s*\b{questionNumber}\b", expectedToken);
            return true;
        }

        if (Regex.IsMatch(questionText, underlinePattern))
        {
            var match = Regex.Match(questionText, underlinePattern);
            var index = match.Index;
            questionText = questionText.Remove(index, match.Length).Insert(index, expectedToken);
            return true;
        }

        questionText = $"{questionText.TrimEnd()} {expectedToken}";
        return true;
    }

    private static bool ContainsOwnQuestionTemplateToken(string? questionText, int questionNumber)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var expectedToken = $"[Q{questionNumber}]";
        return Regex.Matches(questionText, @"\[Q\d+\]", RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Any(match => string.Equals(match.Value, expectedToken, StringComparison.OrdinalIgnoreCase));
    }

    private static string BuildGeminiNativePdfExtractionPrompt(string fileName, NativePdfPageProfile pdfProfile)
    {
        var pageScope = BuildNativePdfPageScopeInstruction(pdfProfile);
        return
        $$""""
        You are extracting an IELTS Reading exam from the attached PDF file "{{fileName}}".

        Return ONLY valid JSON. Do not use markdown fences. Do not summarize. Do not translate. Do not infer missing text.

        PDF page scope:
        {{pageScope}}

        ===== QUESTION TYPE CLASSIFICATION GUIDE =====
        You MUST classify each question into exactly one of these types. Read each definition carefully.

        1. TrueFalseNotGiven — The instruction contains "TRUE/FALSE/NOT GIVEN". Options: []
        2. YesNoNotGiven — The instruction contains "YES/NO/NOT GIVEN". Options: []
        3. MultipleChoice — Standard MCQ with lettered options (A, B, C, D). Each question has its OWN set of options. Answer is ONE letter.
        4. MultipleChoiceMultiple — MCQ where each question can have MULTIPLE correct answers from its own options.
        5. MultipleChoiceChooseN — One shared option bank (e.g., "Choose TWO/THREE letters from A-H" or "Choose two letters, A-E" for answer boxes 39-40). Multiple questions/answer boxes share the same options.
        6. MatchingHeadings — Match paragraphs (A, B, C...) to headings (i, ii, iii...). Options are the heading list. Each question's content is "Paragraph X".
        7. MatchingInfo — Match statements to paragraphs. Instruction says "which paragraph contains...". Options are paragraphs (A-F, etc).
        8. MatchingFeatures — Match items to categories/people. Instruction says "match" or "classify". Options are the list of features/people.
        9. FillInBlanks — Sentence completion with blanks in continuous text (NOT inside a table or diagram). The instruction says "complete the sentences/summary/notes" or "NO MORE THAN N WORDS". question_text MUST contain [Qn] at the blank position. Options: [] unless there is a word list/option bank.
        10. SummaryCompletion — Like FillInBlanks but with an explicit word bank/option list provided. question_text has [Qn]. Options: the word bank items.
        11. TableCompletion — Questions where blanks appear INSIDE A TABLE in the PDF. See TABLE RULES below.
        12. FlowchartCompletion — Questions where blanks appear inside a FLOWCHART, DIAGRAM, PROCESS CHART, or any actual visual diagram in the PDF. IMPORTANT: A visual diagram must have graphic connections, flowchart arrows, or structured layout shapes. If the questions are simply running text sentences or a chronological list of sentences (even if wrapped inside a rectangular border frame or labeled as a timeline), you MUST classify them as FillInBlanks/SummaryCompletion instead of FlowchartCompletion. Only use FlowchartCompletion when there is an actual flowchart/diagram/beehive graphic to be displayed.
        13. MapLabelling — Questions where the student labels parts of a MAP, PLAN, or LAYOUT diagram. The instruction says "label the map/plan below". Similar to FlowchartCompletion but specifically for spatial maps/plans.

        IMPORTANT TYPE DISAMBIGUATION:
        - If the instruction says "diagram below", "flow chart below", "chart below", "label the diagram", "complete the diagram" AND there is an actual visual diagram/graphic structure in the PDF → use FlowchartCompletion. If the PDF content is just sequential text sentences wrapped in a simple border frame with no arrows or graphic connections, use FillInBlanks.
        - If blanks are inside a TABLE → use TableCompletion, NOT FillInBlanks.
        - If blanks are in running text sentences/paragraphs → use FillInBlanks or SummaryCompletion.
        - If there is a word bank/option list with sentence blanks → use SummaryCompletion.
        - If the instruction says "choose ONE/TWO WORDS from the Reading Passage" with a diagram/flowchart graphic → use FlowchartCompletion.
        - If the instruction mentions "Choose one phrase (A-H)" with sentence completion → use FillInBlanks with the phrases as options.

        ===== TABLE EXTRACTION RULES =====
        For TableCompletion questions, you MUST follow these rules precisely:
        - For every TableCompletion group, you MUST return a `table_data` JSON object in the first question of that group (other questions in the same group can have `table_data: null`).
        - The `table_data` object MUST match this schema: `{"headers": ["", "Header Col 2", "Header Col 3"], "rows": [["Row 1 Col 1", "[Q8]", "Row 1 Col 3"], ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"]]}`.
        - The number of elements in the `headers` array MUST be exactly equal to the number of elements in each row of the `rows` array.
        - If a column header is blank (e.g., the first column has row labels but no column title), you MUST include an empty string `""` at the corresponding position in the `headers` array.
        - `headers` is an array of strings representing the visible PDF table header columns. Do not omit headers.
        - `rows` is a two-dimensional array of strings `string[][]` representing the table rows.
        - Empty cells in the table → write `""` (empty string).
        - Cells containing a question blank → write `"[Qn]"` (e.g. `"[Q8]"`).
        - Cells containing text → copy the exact text from the PDF.
        - Each table blank `[Qn]` MUST be returned as its own JSON question object.

        ===== FLOWCHART/DIAGRAM RULES =====
        For FlowchartCompletion and MapLabelling questions:
        - Preserve the exact visible diagram/flowchart/timeline text for the blank. The "question_text" MUST include `[Qn]` at the blank and all printed labels/sentences around that blank.
        - CRITICAL: If a step in a flowchart contains no surrounding visible text/words next to or inside the box, the "question_text" MUST be strictly `[Qn]`.
        - DO NOT link or concatenate neighboring question tokens together (e.g., NEVER return `"[Q27]\n\n[Q28]"` or `"[Q27] -> [Q28]"` to represent flowchart paths; each question_text must only contain its own `[Qn]` token).
        - If the diagram/timeline has actual standalone text labels, years, headings, or text boxes that provide context for the blank, include them in question_text using `\n` or `\n\n` to match the visual line breaks. Example: `1876\n\nLombroso claims that criminality is [Q16]`.
        - If the visual has no surrounding text for a blank, question_text may be only `[Qn]`.
        - Do NOT invent or rewrite sentences from the passage. Copy only text visible in the question diagram/flowchart/timeline.
        - If the PDF shows an actual diagram/flowchart/image, keep the question as FlowchartCompletion/MapLabelling and let the backend crop the visual. Do NOT replace the visual with prose and do NOT omit the visible text.
        - Use MapLabelling only for maps/plans/layouts. For ordinary diagrams, beehive diagrams, process charts, and flow charts, use FlowchartCompletion.
        - If the diagram has an option bank (word list), include it in "options" for every question in the group.
        - If the instruction says "Choose ONE OR TWO WORDS from the Reading Passage" (no printed option bank), use options: [].

        ===== GENERAL RULES =====
        - Copy exact text from the PDF.
        - Preserve visual formatting: For ALL extracted text (passage_content, question_text, instructions, options), if any word, heading, or number is in BOLD in the PDF, you MUST enclose it in markdown bold syntax like **bold_text** (e.g. **1876**, **1949**, **1960s**, **Today**). If it is in ITALICS in the PDF, enclose it in markdown italic syntax like *italic_text*.
        - Preserve question numbers 1-40 exactly.
        - Every question object MUST include "question_group" with the exact printed group range, e.g. "Questions 27-32". Use the same question_group value for all questions in that group. This field is the canonical backend group boundary.
        - Preserve passage wording, question wording, instruction wording, and answer option wording.
        - In each completion "question_text", replace the printed blank/question number with [Qn], where n is that question number.
        - Keep all text before AND after the blank in completion questions. Never move [Qn] to the end unless the PDF blank is actually at the end.
        - Example: if the PDF says "He often did not go to classes and used the time to study physics 10 ____ or to play music.", return "He often did not go to classes and used the time to study physics [Q10] or to play music."
        - Do not mix Review/Explanation/Solution text into passages, questions, instructions, or options.
        - Use Review/Solution/Answer Key only for the "answer" field.
        - If the PDF contains long Review and Explanations pages after the answer key, ignore those pages completely.
        - Never copy "Keywords in Questions", "Similar words in Passage", notes, highlighted review blocks, or explanation pages.
        - If an answer is not visible in the PDF, use an empty string.
        - If a question has no options in the PDF (TFNG, YNNG, completion, matching info), return [] for options unless the visible task has an explicit option bank.
        - Only use MultipleChoice/MultipleChoiceMultiple/MultipleChoiceChooseN when the PDF shows real answer choices/options for that question or group.
        - For Matching people/paragraph/headings, include the exact shared instruction in each question's "instruction" field.
        - For MCQ, include exact options in reading order. Keep the option letter prefix, e.g. "A. text".
        - For passage_content, include only the reading passage/article text, not questions, answers, page footers, URLs, or explanations.
        - Do not repeat passage_title inside passage_content. The title belongs only in passage_title.
        - CRITICAL: If the reading passage has subheadings, section headings, or bold section titles within the text (e.g., "Who Benefits from Art Therapy", "What an Art Therapy Session Involves", "The Regulation of Art Therapy"), you MUST extract and preserve them in "passage_content". Format each subheading in bold on its own line (e.g. **Who Benefits from Art Therapy**), followed by a paragraph break before the paragraph text. Never omit or discard them.
        - Preserve paragraph breaks in passage_content. If the article has normal paragraphs without A/B/C/D labels, keep each paragraph separated by a newline.
        - passage_content MUST include the complete article from its title through the last paragraph before the first question block for that passage. Do not stop after the first page or first few paragraphs.
        - If Reading Passage text continues on later pages before its questions, include those later paragraphs too.

        JSON schema:
        {
          "passages": [
            {
              "passage_title": "string",
              "passage_content": "string",
              "questions": [
                {
                  "question_number": "1",
                  "question_type": "TrueFalseNotGiven | YesNoNotGiven | MultipleChoice | MultipleChoiceMultiple | MultipleChoiceChooseN | MatchingInfo | MatchingFeatures | MatchingHeadings | FillInBlanks | SummaryCompletion | TableCompletion | FlowchartCompletion | MapLabelling",
                  "instruction": "exact shared instruction.",
                  "question_group": "Questions X-Y exact printed group range",
                  "question_text": "exact question text.",
                  "options": ["A. exact option text", "B. exact option text"],
                  "answer": "exact answer from answer key if visible, else empty string",
                  "explanation": "",
                  "table_data": {
                    "headers": ["Col 1", "Col 2"],
                    "rows": [
                      ["Row Text", "[Q1]"]
                    ]
                  }
                }
              ]
            }
          ]
        }

        Validate before returning:
        - Exactly 3 passages.
        - Exactly questions 1 through 40, no missing and no duplicates.
        - Every question has question_group matching its printed "Questions X-Y" group.
        - Every completion question_text contains its own [Qn] token.
        - TableCompletion uses the table_data JSON field with [Qn] for blanks.
        - FlowchartCompletion/MapLabelling question_text preserves visible diagram text and contains its own [Qn] token.
        - No page footer or URL text in passage_content/question_text/options.
        - No "Review and Explanations", "Keywords in Questions", "Similar words in Passage", or "Answer:" text in passage_content/question_text/options.
        """";
    }

    private static string BuildNativePdfPageScopeInstruction(NativePdfPageProfile pdfProfile)
    {
        if (pdfProfile.PageCount <= 0)
        {
            return "The page count is unknown. Extract only the actual IELTS test and the short answer key; ignore review/explanation pages.";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"The PDF has {pdfProfile.PageCount} page(s).");

        if (pdfProfile.SolutionStartPage is > 0)
        {
            var examEndPage = Math.Max(1, pdfProfile.SolutionStartPage.Value - 1);
            builder.AppendLine($"Extract test content only from page 1 through page {examEndPage}.");
            var answerEndPage = pdfProfile.ReviewStartPage is > 0
                ? Math.Max(pdfProfile.SolutionStartPage.Value, pdfProfile.ReviewStartPage.Value - 1)
                : pdfProfile.SolutionStartPage.Value;
            builder.AppendLine($"Use page {pdfProfile.SolutionStartPage.Value} through page {answerEndPage} only for answer keys.");
        }
        else if (pdfProfile.ReviewStartPage is > 0)
        {
            builder.AppendLine($"Extract test content only from pages before page {pdfProfile.ReviewStartPage.Value}.");
        }

        if (pdfProfile.ReviewStartPage is > 0)
        {
            builder.AppendLine($"Ignore page {pdfProfile.ReviewStartPage.Value} through page {pdfProfile.PageCount}; those are review/explanation pages, not exam source.");
        }

        if (pdfProfile.ImageHeavyPages.Count > 0)
        {
            builder.AppendLine($"Image-heavy/diagram candidate page(s): {string.Join(", ", pdfProfile.ImageHeavyPages)}. Preserve diagram/flowchart blanks from these pages as FillInBlanks/FlowchartCompletion with [Qn] tokens.");
        }

        return builder.ToString().Trim();
    }

    private static string BuildGeminiNativePdfPassageExtractionPrompt(
        string fileName,
        NativePdfPageProfile pdfProfile,
        int passageNumber,
        int startQuestion,
        int endQuestion)
    {
        var pageScope = BuildNativePdfPageScopeInstruction(pdfProfile);

        return
        $$""""
        You are extracting ONLY Reading Passage {{passageNumber}} from the attached IELTS Reading PDF "{{fileName}}".

        Return ONLY one valid JSON object. Do not use markdown fences. Do not summarize. Do not translate. Do not infer missing text.

        PDF page scope:
        {{pageScope}}

        Target:
        - Extract exactly Reading Passage {{passageNumber}}.
        - Extract exactly questions {{startQuestion}} through {{endQuestion}}, no questions outside this range.
        - Use the short answer key pages only for answers.
        - Ignore all Review and Explanations pages.

        ===== QUESTION TYPE CLASSIFICATION =====
        Classify each question into exactly one of:
        - TrueFalseNotGiven — instruction contains "TRUE/FALSE/NOT GIVEN"
        - YesNoNotGiven — instruction contains "YES/NO/NOT GIVEN"
        - MultipleChoice — MCQ with lettered options (A-D), one correct answer per question
        - MultipleChoiceMultiple — MCQ with multiple correct answers per question
        - MultipleChoiceChooseN — shared option bank, choose N answers; use this for "Choose two letters, A-E" when the printed answer boxes span two question numbers such as 39-40
        - MatchingHeadings — match paragraphs to headings (i, ii, iii...)
        - MatchingInfo — match statements to paragraphs
        - MatchingFeatures — match items to categories/people
        - FillInBlanks — sentence/note completion with blanks in running text (NOT table/diagram)
        - SummaryCompletion — like FillInBlanks but with a word bank
        - TableCompletion — blanks inside a TABLE
        - FlowchartCompletion — blanks inside a FLOWCHART, DIAGRAM, or process graphic where the answers are actual words, numbers, or phrases (optionally chosen from a word/phrase bank, not simple letters like A, B, C, D).
        - MapLabelling — labels/blanks on a MAP, PLAN, or DIAGRAM where the answers / options are purely single letters like A, B, C, D, E... representing labeled points on the graphic. Each question has its own text (e.g. "Q1. library", "Q2. post office").

        KEY:
        - Classify as MapLabelling if the question group requires matching numbered questions to lettered locations/points on a diagram/map/plan (answers are letters A, B, C, D...).
        - Classify as FlowchartCompletion if the question group is to complete steps/boxes in a flowchart/diagram with actual words/numbers (or choosing words/phrases from a box).

        ===== TABLE RULES =====
        For TableCompletion:
        - For every TableCompletion group, you MUST return a `table_data` JSON object in the first question of that group (other questions in the same group can have `table_data: null`).
        - The `table_data` object MUST match this schema: `{"headers": ["", "Header Col 2", "Header Col 3"], "rows": [["Row 1 Col 1", "[Q8]", "Row 1 Col 3"], ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"]]}`.
        - The number of elements in the `headers` array MUST be exactly equal to the number of elements in each row of the `rows` array.
        - If a column header is blank (e.g., the first column has row labels but no column title), you MUST include an empty string `""` at the corresponding position in the `headers` array.
        - `headers` is an array of strings representing the visible PDF table header columns. Do not omit headers.
        - `rows` is a two-dimensional array of strings `string[][]` representing the table rows.
        - Empty cells in the table → write `""` (empty string).
        - Cells containing a question blank → write `"[Qn]"` (e.g. `"[Q8]"`).
        - Cells containing text → copy the exact text from the PDF.
        - Each table blank `[Qn]` MUST be returned as its own JSON question object.

        ===== FLOWCHART/DIAGRAM RULES =====
        For FlowchartCompletion/MapLabelling:
        - question_text must preserve the exact visible diagram/flowchart/timeline text for that blank and include `[Qn]` at the blank.
        - CRITICAL: If a flowchart step has no surrounding visible text/words next to or inside its box, the "question_text" MUST be strictly `[Qn]`. 
        - DO NOT link or concatenate neighboring question tokens together (e.g., NEVER return `"[Q27]\n\n[Q28]"` or `"[Q27] -> [Q28]"` to represent flowchart paths; each question_text must only contain its own `[Qn]` token).
        - If the visual has actual standalone text labels, years, headings, or text boxes, include them using `\n` or `\n\n` to match the PDF line breaks. Example: `1876\n\nLombroso claims that criminality is [Q16]`.
        - If there is no surrounding visible text for a blank, question_text may be only `[Qn]`.
        - Do NOT invent sentences. Do NOT copy passage text as question_text unless that text is visibly printed in the diagram/flowchart/timeline itself.
        - If the PDF has a real graphical visual (flowchart, process chart, beehive diagram), keep it as a visual question so the backend can crop the PDF image. If it is just text sentences wrapped in a border box, treat it as non-visual FillInBlanks.
        - Use MapLabelling if options are purely single letters (A, B, C, D...) representing labeled points on a map/plan/diagram. Use FlowchartCompletion for diagrams, processes, and flowcharts where answers are words/phrases (even if chosen from a word bank containing actual words).
        - Include option bank in "options" if printed, else []

        ===== GENERAL RULES =====
        - Copy exact text from the PDF.
        - Preserve visual formatting: For ALL extracted text (passage_content, question_text, instructions, options), if any word, heading, or number is in BOLD in the PDF, you MUST enclose it in markdown bold syntax like **bold_text** (e.g. **1876**, **1949**, **1960s**, **Today**). If it is in ITALICS in the PDF, enclose it in markdown italic syntax like *italic_text*.
        - Every question object MUST include "question_group" with the exact printed group range, e.g. "Questions {{startQuestion}}-{{endQuestion}}"; use the same question_group for every question in that group.
        - In completion question_text, replace blanks with [Qn].
        - Keep text before AND after blanks.
        - For shared option banks, repeat the same options for every question in the group.
        - For MCQ, include exact options with letter prefix.
        - For Matching Features/Classification questions that have a letter-to-entity mapping guide (e.g. "Write: A - for Dr. Aplin, B - for Dr. Roberts..."), you MUST classify them as "MatchingFeatures" and copy the full mapping list into the "options" array of EACH question in that group (e.g., ["A - for Dr. Aplin", "B - for Dr. Roberts", "C - for Dr. Speare"] or ["A. Dr. Aplin", "B. Dr. Roberts", "C. Dr. Speare"]). DO NOT leave "options" empty.
        - For completion questions (FlowchartCompletion, MapLabelling, FillInBlanks, SummaryCompletion, TableCompletion): Each question object in the JSON MUST contain its own independent "question_text" corresponding to ONLY that specific question number (e.g. Q1 contains "[Q1] Z-axis motor", Q2 contains "[Q2] hot end of extruder", etc.). You MUST NOT concatenate or repeat the entire text block of the group into each question object. Keep them strictly separated.
        - passage_content = complete article text only, no questions/answers/footers.
        - CRITICAL: If the reading passage has subheadings, section headings, or bold section titles within the text (e.g., "Who Benefits from Art Therapy", "What an Art Therapy Session Involves", "The Regulation of Art Therapy"), you MUST extract and preserve them in "passage_content". Format each subheading in bold on its own line (e.g. **Who Benefits from Art Therapy**), followed by a paragraph break before the paragraph text. Never omit or discard them.
        - CRITICAL: Extract the ENTIRE reading passage from its very beginning to its very end. Do not truncate the passage. Ensure all paragraphs across all pages of the passage are fully extracted into "passage_content".
        - IMPORTANT: Under no circumstances should you generate or add paragraph labels (A, B, C, etc.) if the PDF passage paragraphs do not already have them. Only output paragraph labels if they are explicitly present at the beginning of paragraphs in the PDF. If the PDF passage is a normal passage without paragraph labels, keep it strictly as normal paragraphs without adding any labels.
        - In passage_content, check paragraph endings: OCR/PDF rendering often glues the next paragraph's label (e.g. "B.", "C.", or "**B.**") to the end of the current paragraph. You MUST strip this trailing next-paragraph label from the end of the current paragraph.
        - For structured paragraphs starting with a label (e.g. A, B, C...), format it strictly as "**A.**" on a new line followed by the paragraph text. Avoid duplicate standalone labels like "A." followed by "**A.**" for the same paragraph.
        - Preserve paragraph breaks in passage_content.
        - No Review/Explanation/Solution text in questions.
        JSON schema:
        {
          "passage_title": "string",
          "passage_content": "string",
          "questions": [
            {
              "question_number": "{{startQuestion}}",
              "question_type": "TrueFalseNotGiven | YesNoNotGiven | MultipleChoice | MultipleChoiceMultiple | MultipleChoiceChooseN | MatchingInfo | MatchingFeatures | MatchingHeadings | FillInBlanks | SummaryCompletion | TableCompletion | FlowchartCompletion | MapLabelling",
              "instruction": "exact shared instruction.",
              "question_group": "Questions X-Y exact printed group range",
              "question_text": "exact question text.",
              "options": ["A. exact option text", "B. exact option text"],
              "answer": "exact answer from answer key if visible, else empty string",
              "explanation": "",
              "table_data": {
                "headers": ["Col 1", "Col 2"],
                "rows": [
                  ["Row Text", "[Q1]"]
                ]
              }
            }
          ]
        }

        Validate before returning:
        - Exactly questions {{startQuestion}} through {{endQuestion}}, no missing and no duplicates.
        - Every question has question_group matching its printed "Questions X-Y" group.
        - Every completion question_text contains its own [Qn] token.
        - TableCompletion uses the table_data JSON field with [Qn] for blanks.
        - FlowchartCompletion/MapLabelling question_text preserves visible diagram text and contains its own [Qn] token.
        - The response must be complete valid JSON ending with the closing brace.
        """";
    }

    private static string BuildNativeEvidenceText(IReadOnlyList<GemmaPassagePayload> passages)
    {
        var builder = new StringBuilder();
        foreach (var passage in passages)
        {
            builder.AppendLine(passage.PassageTitle);
            builder.AppendLine(passage.PassageContent);
            foreach (var question in passage.Questions ?? [])
            {
                builder.AppendLine(ReadJsonAsText(question.Instruction));
                builder.AppendLine(ReadJsonAsText(question.QuestionNumber));
                builder.AppendLine(ReadJsonAsText(question.QuestionText));
                foreach (var option in ExtractOptions(question.Options))
                {
                    builder.AppendLine(option);
                }
            }
        }

        return builder.ToString();
    }

    private static Dictionary<int, string> BuildAnswerKeyMapFromNativePayload(
        IReadOnlyList<GemmaPassagePayload> passages)
    {
        var result = new Dictionary<int, string>();
        foreach (var question in passages.SelectMany(passage => passage.Questions ?? []))
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
            var answer = ReadJsonAsText(question.Answer);
            if (questionNumber.HasValue && !string.IsNullOrWhiteSpace(answer))
            {
                result[questionNumber.Value] = answer.Trim();
            }
        }

        return result;
    }

    private static async Task<byte[]> ReadAllBytesAsync(Stream input, CancellationToken cancellationToken)
    {
        if (input.CanSeek)
        {
            input.Position = 0;
        }

        using var memoryStream = new MemoryStream();
        await input.CopyToAsync(memoryStream, cancellationToken);
        return memoryStream.ToArray();
    }

    private async Task<GenerateExamFromPdfResultDto> GenerateFromNativeGeminiPdfAsync(
        byte[] pdfBytes,
        string fileName,
        Guid uploadedBy,
        string? clientRequestId,
        DocumentUpload documentUpload,
        int currentProgress,
        CancellationToken cancellationToken)
    {
        string? debugDirectory = null;
        try
        {
            var shouldSaveDebug = configuration.GetValue<bool?>("GeminiPdfNativeExtraction:SaveDebugArtifacts") ?? true;
            if (shouldSaveDebug)
            {
                var root = ResolveNativePdfDebugOutputDirectory(
                    configuration["GeminiPdfNativeExtraction:DebugOutputDirectory"]);
                debugDirectory = Path.Combine(
                    root,
                    $"{DateTime.UtcNow:yyyyMMdd-HHmmss}-{SanitizeDebugFileName(Path.GetFileNameWithoutExtension(fileName))}");
                Directory.CreateDirectory(debugDirectory);
                ActiveDebugDirectory.Value = debugDirectory;
            }

            currentProgress = Math.Max(currentProgress, 18);
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "gemini_pdf_extract",
                message: "Gemini dang doc truc tiep file PDF de trich xuat de thi.",
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var extractionResult = await ExtractExamFromNativePdfWithGeminiAsync(
                pdfBytes,
                fileName,
                debugDirectory,
                cancellationToken);
            var parsedPassages = extractionResult.Payload.Passages.ToList();

            var pdfRawPassages = BuildNativePdfRawPassages(pdfBytes);
            var nativeRawPassages = pdfRawPassages.Count == 3
                ? pdfRawPassages
                : BuildNativeRawPassagesForValidation(parsedPassages);
            await RepairLowQualityNativePassageContentAsync(
                parsedPassages,
                nativeRawPassages,
                pdfBytes,
                fileName,
                cancellationToken);
            var nativeEvidenceText = BuildCombinedEvidenceText(
                string.Join("\n\n----- PDF TEXT PASSAGE SPLIT -----\n\n", nativeRawPassages),
                BuildNativeEvidenceText(parsedPassages));
            
            if (shouldSaveDebug)
            {
                debugDirectory = await SaveNativePdfDebugArtifactsAsync(
                    fileName,
                    extractionResult.RawJson,
                    extractionResult.Payload,
                    nativeRawPassages,
                    createExamDto: null,
                    cancellationToken,
                    debugDirectory);
            }

            var answerKeyMap = BuildAnswerKeyMapFromNativePayload(parsedPassages);

            NormalizeQuestionTypes(parsedPassages);
            ApplyAnswerKeyOverrides(parsedPassages, answerKeyMap);
            NormalizeQuestionTypes(parsedPassages);
            ValidateParsedPassagesAgainstEvidence(parsedPassages, nativeRawPassages, nativeEvidenceText);

            currentProgress = Math.Max(currentProgress, 92);
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "build_exam",
                message: "Dang chuan hoa noi dung Gemini doc tu PDF thanh de thi.",
                totalPassages: parsedPassages.Count,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var extraction = await pdfTextExtractionService.ExtractAsync(new System.IO.MemoryStream(pdfBytes), fileName, cancellationToken);
            var reviewedQuestionGroupsByPassage = await BuildReviewedQuestionGroupPreviewsAsync(
                nativeRawPassages,
                extraction.Pages,
                extraction.PdfBytes,
                fileName,
                cancellationToken,
                parsedPassages);

            var createExamDto = await BuildCreateExamDtoAsync(
                parsedPassages,
                nativeRawPassages,
                reviewedQuestionGroupsByPassage,
                fileName,
                cancellationToken);

            if (shouldSaveDebug)
            {
                debugDirectory = await SaveNativePdfDebugArtifactsAsync(
                    fileName,
                    extractionResult.RawJson,
                    extractionResult.Payload,
                    nativeRawPassages,
                    createExamDto,
                    cancellationToken,
                    debugDirectory);
            }

            ValidateCreateExamDtoQuality(createExamDto);
            var totalQuestions = Convert.ToInt32(createExamDto.TotalPoints ?? 0d);

            currentProgress = 97;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "save_exam",
                message: "Dang luu de thi vao co so du lieu.",
                totalPassages: parsedPassages.Count,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            var examId = await examService.CreateExamAsync(createExamDto, uploadedBy, cancellationToken);

            var exam = await context.Exams.FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);
            if (exam is not null)
            {
                exam.SourcePdfUrl = documentUpload.FileUrl;
            }

            documentUpload.GeneratedExamId = examId;
            documentUpload.ProcessStatus = "Completed";
            documentUpload.ErrorMessage = null;
            documentUpload.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync(cancellationToken);

            currentProgress = 100;
            await PublishProgressAsync(
                documentUpload.Id,
                uploadedBy,
                status: "completed",
                progressPercent: currentProgress,
                stage: "completed",
                message: $"Tao de thanh cong: {totalQuestions} cau hoi.",
                totalPassages: parsedPassages.Count,
                examId: examId,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            return new GenerateExamFromPdfResultDto(
                ExamId: examId,
                UploadId: documentUpload.Id,
                PassageCount: parsedPassages.Count,
                QuestionCount: totalQuestions);
        }
        catch (Exception ex)
        {
            try
            {
                ex.Data["IsNativePdfFailed"] = true;
            }
            catch
            {
            }

            if (!string.IsNullOrWhiteSpace(debugDirectory))
            {
                try
                {
                    var failureFilePath = Path.Combine(debugDirectory, "00-generation-failure.txt");
                    var failureContent = $"Generation failed at: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n" +
                                         $"Error Message: {ex.Message}\n\n" +
                                         $"Stack Trace:\n{ex.StackTrace}";
                    await File.WriteAllTextAsync(failureFilePath, failureContent, CancellationToken.None);
                }
                catch (Exception logEx)
                {
                    logger.LogWarning(logEx, "Failed to write generation failure log to {Directory}", debugDirectory);
                }
            }
            throw;
        }
    }

    private static IReadOnlyList<string> BuildNativeRawPassagesForValidation(
        IReadOnlyList<GemmaPassagePayload> passages)
    {
        var result = new List<string>(passages.Count);
        foreach (var passage in passages)
        {
            var questionNumbers = (passage.Questions ?? [])
                .Select(question => ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber)))
                .Where(number => number.HasValue)
                .Select(number => number!.Value)
                .OrderBy(number => number)
                .ToList();
            var builder = new StringBuilder();
            if (questionNumbers.Count > 0)
            {
                builder.AppendLine($"Questions {questionNumbers.First()}-{questionNumbers.Last()}");
            }

            builder.AppendLine(passage.PassageTitle);
            builder.AppendLine(passage.PassageContent);
            foreach (var question in passage.Questions ?? [])
            {
                var instruction = ReadJsonAsText(question.Instruction);
                if (!string.IsNullOrWhiteSpace(instruction))
                {
                    builder.AppendLine(instruction);
                }

                builder.AppendLine(ReadJsonAsText(question.QuestionNumber));
                builder.AppendLine(ReadJsonAsText(question.QuestionText));
                foreach (var option in ExtractOptions(question.Options))
                {
                    builder.AppendLine(option);
                }
            }

            result.Add(builder.ToString());
        }

        return result;
    }

    private async Task RepairLowQualityNativePassageContentAsync(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyList<string> nativeRawPassages,
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        if (nativeRawPassages.Count == 0)
        {
            return;
        }

        var pdfProfile = BuildNativePdfPageProfile(pdfBytes);
        for (var index = 0; index < parsedPassages.Count; index++)
        {
            var rawPassage = index < nativeRawPassages.Count ? nativeRawPassages[index] : string.Empty;
            var passage = parsedPassages[index];
            var aiContent = NormalizePassageContent(passage.PassageContent, passage.PassageTitle);
            var rawContent = NormalizePassageContent(rawPassage, passage.PassageTitle);
            if (!ShouldRepairNativePassageContent(aiContent, rawContent))
            {
                continue;
            }

            var passageNumber = index + 1;
            logger.LogInformation(
                "Repairing low-quality Gemini passage content for {FileName}, passage {PassageNumber}. AI words={AiWords}, raw words={RawWords}.",
                fileName,
                passageNumber,
                CountPassageWords(aiContent),
                CountPassageWords(rawContent));

            var prompt = BuildGeminiNativePassageContentRepairPrompt(
                fileName,
                pdfProfile,
                passageNumber,
                passage.PassageTitle,
                rawContent);
            var json = await geminiPdfNativeExtractionClient.ExtractExamJsonAsync(
                pdfBytes,
                fileName,
                prompt,
                cancellationToken);
            var repairedContent = DeserializeNativePassageContentRepairPayload(json);
            var normalizedRepairedContent = NormalizePassageContent(repairedContent, passage.PassageTitle);
            if (!IsUsableNativePassageRepair(aiContent, rawContent, normalizedRepairedContent))
            {
                logger.LogWarning(
                    "Discarded low-quality Gemini passage repair for {FileName}, passage {PassageNumber}. Repaired words={RepairedWords}.",
                    fileName,
                    passageNumber,
                    CountPassageWords(normalizedRepairedContent));
                continue;
            }

            passage.PassageContent = normalizedRepairedContent;
        }
    }

    private static bool ShouldRepairNativePassageContent(string aiContent, string rawContent)
    {
        var aiWordCount = CountPassageWords(aiContent);
        var rawWordCount = CountPassageWords(rawContent);
        if (rawWordCount < 350)
        {
            return false;
        }

        if (ContainsPassageQuestionOrFooterNoise(aiContent))
        {
            return true;
        }

        return aiWordCount < 450 && rawWordCount > aiWordCount * 1.35d;
    }

    private static bool IsUsableNativePassageRepair(
        string aiContent,
        string rawContent,
        string repairedContent)
    {
        if (string.IsNullOrWhiteSpace(repairedContent) ||
            ContainsPassageQuestionOrFooterNoise(repairedContent) ||
            IsReviewOrSolutionArtifact(repairedContent))
        {
            return false;
        }

        var repairedWordCount = CountPassageWords(repairedContent);
        var aiWordCount = CountPassageWords(aiContent);
        var rawWordCount = CountPassageWords(rawContent);
        return repairedWordCount >= Math.Max(350, aiWordCount) &&
               repairedWordCount >= rawWordCount * 0.65d;
    }

    private static bool ContainsPassageQuestionOrFooterNoise(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return false;
        }

        return AccessOrPageNoiseRegex().IsMatch(content) ||
               InlinePassageQuestionBoundaryRegex().IsMatch(content) ||
               Regex.IsMatch(
                   content,
                   @"(?i)\b(?:choose\s+three\s+letters|circle\s+the\s+correct\s+letters|complete\s+the\s+summary|do\s+the\s+following\s+statements|write\s+the\s+correct\s+letter)\b");
    }

    private static string BuildGeminiNativePassageContentRepairPrompt(
        string fileName,
        NativePdfPageProfile pdfProfile,
        int passageNumber,
        string? passageTitle,
        string rawPassageText)
    {
        var pageScope = BuildNativePdfPageScopeInstruction(pdfProfile);
        var clippedRawPassage = rawPassageText.Length <= 18000
            ? rawPassageText
            : rawPassageText[..18000];

        return
        $$""""
        You are repairing ONLY the passage article text for Reading Passage {{passageNumber}} from the attached IELTS Reading PDF "{{fileName}}".

        Return ONLY valid JSON. Do not use markdown fences. Do not summarize. Do not translate. Do not infer missing text.

        PDF page scope:
        {{pageScope}}

        Target passage title:
        {{passageTitle}}

        Text-layer backup for this passage, extracted from the same PDF. It may contain glued words, page footers, URLs, and question blocks; use it only as evidence, then clean it:
        """
        {{clippedRawPassage}}
        """

        Critical rules:
        - Output ONLY the Reading Passage {{passageNumber}} article text.
        - Do not include the passage title in passage_content if it is already the target passage title above.
        - Include every paragraph of the article from the title/body through the last article paragraph before the first "Questions ..." block for this passage.
        - Remove all page headers/footers, URLs, "Access", page numbers, questions, answer options, instructions, answer keys, review/explanation text.
        - Preserve paragraph breaks. If the article has normal paragraphs without A/B/C/D labels, keep each paragraph separated by a newline.
        - Preserve original wording. Do not rewrite or add ideas.
        - Repair obvious PDF line wrapping/glued word artifacts only when the source word is clear from context.
        - If the PDF article has no paragraph labels, do not invent A/B/C labels.

        JSON schema:
        {
          "passage_content": "complete clean passage article text only"
        }
        """";
    }

    private static string DeserializeNativePassageContentRepairPayload(string json)
    {
        var normalized = NormalizeJson(json);
        var start = normalized.IndexOf('{');
        var end = normalized.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            throw new InvalidOperationException("Gemini native passage content repair did not return a JSON object.");
        }

        normalized = normalized[start..(end + 1)];
        var payload = JsonSerializer.Deserialize<GeminiPassageContentRepairPayload>(normalized, JsonOptions) ??
                      throw new InvalidOperationException("Gemini native passage content repair JSON could not be deserialized.");
        return payload.PassageContent ?? string.Empty;
    }

    private static IReadOnlyList<string> BuildNativePdfRawPassages(byte[] pdfBytes)
    {
        if (pdfBytes.Length == 0)
        {
            return [];
        }

        try
        {
            using var document = PdfDocument.Open(new MemoryStream(pdfBytes));
            int? solutionStartPage = null;
            int? reviewStartPage = null;
            var pageTexts = new List<string>();

            foreach (var page in document.GetPages())
            {
                var text = NormalizeExtractedSpacing(page.Text ?? string.Empty);
                if (solutionStartPage is null &&
                    Regex.IsMatch(text, @"(?i)\b(?:solution|answer\s*key|answers?)\s*:\s*(?:\d|1\s*[-–—]\s*3|Q?\s*1)\b|(?i)\b(?:answer\s*keys?|solution\s*keys?)\b"))
                {
                    solutionStartPage = page.Number;
                }

                if (reviewStartPage is null &&
                    Regex.IsMatch(text, @"(?i)\breview\s+and\s+explanations?\b|\bkeywords\s+in\s+questions\b|\bsimilar\s+words\s+in\s+passage\b"))
                {
                    reviewStartPage = page.Number;
                }

                var cutPage = solutionStartPage ?? reviewStartPage;
                if (cutPage.HasValue && page.Number >= cutPage.Value)
                {
                    break;
                }

                if (!string.IsNullOrWhiteSpace(text))
                {
                    pageTexts.Add(text);
                }
            }

            var rawText = string.Join("\n\n", pageTexts);
            if (string.IsNullOrWhiteSpace(rawText))
            {
                return [];
            }

            var splitPassages = SplitPassages(rawText);
            return splitPassages.Count == 3 ? splitPassages : [];
        }
        catch
        {
            return [];
        }
    }

    private static NativePdfPageProfile BuildNativePdfPageProfile(byte[] pdfBytes)
    {
        if (pdfBytes.Length == 0)
        {
            return new NativePdfPageProfile(0, null, null, []);
        }

        try
        {
            using var document = PdfDocument.Open(new MemoryStream(pdfBytes));
            int? solutionStartPage = null;
            int? reviewStartPage = null;
            var imageHeavyPages = new List<int>();

            foreach (var page in document.GetPages())
            {
                var text = NormalizeExtractedSpacing(page.Text ?? string.Empty);
                if (solutionStartPage is null &&
                    Regex.IsMatch(text, @"(?i)\b(?:solution|answer\s*key|answers?)\s*:\s*(?:\d|1\s*[-–—]\s*3|Q?\s*1)\b|(?i)\b(?:answer\s*keys?|solution\s*keys?)\b"))
                {
                    solutionStartPage = page.Number;
                }

                if (reviewStartPage is null &&
                    Regex.IsMatch(text, @"(?i)\breview\s+and\s+explanations?\b|\bkeywords\s+in\s+questions\b|\bsimilar\s+words\s+in\s+passage\b"))
                {
                    reviewStartPage = page.Number;
                }

                var imageCount = page.GetImages().Count();
                if (imageCount >= 4 ||
                    Regex.IsMatch(text, @"(?i)\bflow-?chart\b|\bdiagram\b|\bmap\b|\blabel\b"))
                {
                    imageHeavyPages.Add(page.Number);
                }
            }

            return new NativePdfPageProfile(
                document.NumberOfPages,
                solutionStartPage,
                reviewStartPage,
                imageHeavyPages);
        }
        catch
        {
            return new NativePdfPageProfile(0, null, null, []);
        }
    }

    private async Task SaveNativePdfFailedRawDebugArtifactAsync(
        string fileName,
        string rawGeminiJson,
        string error,
        NativePdfPageProfile pdfProfile,
        CancellationToken cancellationToken)
    {
        var shouldSave = configuration.GetValue<bool?>("GeminiPdfNativeExtraction:SaveDebugArtifacts") ?? true;
        if (!shouldSave)
        {
            return;
        }

        var root = ResolveNativePdfDebugOutputDirectory(
            configuration["GeminiPdfNativeExtraction:DebugOutputDirectory"]);
        var outputDirectory = Path.Combine(
            root,
            $"{DateTime.UtcNow:yyyyMMdd-HHmmss}-{SanitizeDebugFileName(Path.GetFileNameWithoutExtension(fileName))}-failed-json");
        Directory.CreateDirectory(outputDirectory);

        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "00-raw-gemini-output.failed.json"),
            rawGeminiJson,
            CancellationToken.None);
        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "00-parse-error.txt"),
            BuildNativePdfJsonFailureMessage(fileName, pdfProfile, new InvalidOperationException(error)),
            CancellationToken.None);

        logger.LogWarning(
            "Saved failed Gemini native PDF raw response for {FileName} to {DebugDirectory}.",
            fileName,
            outputDirectory);
    }

    private static string BuildNativePdfJsonFailureMessage(
        string fileName,
        NativePdfPageProfile pdfProfile,
        Exception exception)
    {
        var scope = BuildNativePdfPageScopeInstruction(pdfProfile);
        return
            $"Gemini native PDF extraction returned invalid/incomplete JSON for {fileName}. " +
            "This usually means the model output was truncated or contaminated by long review/explanation pages. " +
            $"Detected PDF scope: {scope} Error: {exception.Message}";
    }

    private async Task<string?> SaveNativePdfDebugArtifactsAsync(
        string fileName,
        string rawGeminiJson,
        GeminiNativePdfExtractionPayload payload,
        IReadOnlyList<string> nativeRawPassages,
        CreateExamDto? createExamDto,
        CancellationToken cancellationToken,
        string? existingDirectory = null)
    {
        var shouldSave = configuration.GetValue<bool?>("GeminiPdfNativeExtraction:SaveDebugArtifacts") ?? true;
        if (!shouldSave)
        {
            return existingDirectory;
        }

        var outputDirectory = existingDirectory;
        if (string.IsNullOrWhiteSpace(outputDirectory))
        {
            var root = ResolveNativePdfDebugOutputDirectory(
                configuration["GeminiPdfNativeExtraction:DebugOutputDirectory"]);
            outputDirectory = Path.Combine(
                root,
                $"{DateTime.UtcNow:yyyyMMdd-HHmmss}-{SanitizeDebugFileName(Path.GetFileNameWithoutExtension(fileName))}");
            Directory.CreateDirectory(outputDirectory);
        }

        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "00-raw-gemini-output.json"),
            rawGeminiJson,
            CancellationToken.None);
        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "01-parsed-gemini-payload.json"),
            JsonSerializer.Serialize(payload, JsonOptions),
            CancellationToken.None);
        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "02-validation-raw-passages.txt"),
            string.Join("\n\n----- PASSAGE SPLIT -----\n\n", nativeRawPassages),
            CancellationToken.None);

        if (createExamDto is not null)
        {
            await File.WriteAllTextAsync(
                Path.Combine(outputDirectory, "03-mapped-exam-dto-before-save.json"),
                JsonSerializer.Serialize(createExamDto, JsonOptions),
                CancellationToken.None);
            await File.WriteAllTextAsync(
                Path.Combine(outputDirectory, "04-question-type-audit.md"),
                BuildQuestionTypeAudit(createExamDto),
                CancellationToken.None);
            await File.WriteAllTextAsync(
                Path.Combine(outputDirectory, "05-visual-crop-boxes.json"),
                BuildVisualCropDebug(createExamDto),
                CancellationToken.None);
        }

        logger.LogInformation(
            "Saved Gemini native PDF debug artifacts for {FileName} to {DebugDirectory}.",
            fileName,
            outputDirectory);
        return outputDirectory;
    }

    private static string ResolveNativePdfDebugOutputDirectory(string? configuredDirectory)
    {
        var root = string.IsNullOrWhiteSpace(configuredDirectory)
            ? Path.Combine(Directory.GetCurrentDirectory(), ".runtime", "gemini-pdf-debug")
            : configuredDirectory;
        Directory.CreateDirectory(root);
        return root;
    }

    private static string SanitizeDebugFileName(string? value)
    {
        var fallback = string.IsNullOrWhiteSpace(value) ? "uploaded-pdf" : value.Trim();
        foreach (var invalidChar in Path.GetInvalidFileNameChars())
        {
            fallback = fallback.Replace(invalidChar, '-');
        }

        fallback = Regex.Replace(fallback, @"\s+", "-");
        return fallback.Length <= 80 ? fallback : fallback[..80];
    }

    private static string BuildQuestionTypeAudit(CreateExamDto createExamDto)
    {
        var builder = new StringBuilder();
        builder.AppendLine("# Question Type Audit");
        builder.AppendLine();
        foreach (var passage in createExamDto.Sections.SelectMany(section => section.ReadingPassages ?? []))
        {
            builder.AppendLine($"## Passage {passage.PassageNumber}: {passage.Title}");
            builder.AppendLine();
            foreach (var group in passage.QuestionGroups.OrderBy(group => group.StartQuestion ?? int.MaxValue))
            {
                var groupType = NormalizeGroupType(group.GroupType) ?? MapQuestionType(group.GroupType);
                var allOptions = group.Questions
                    .SelectMany(question => question.Options)
                    .Select(option => option.OptionText)
                    .Where(option => !string.IsNullOrWhiteSpace(option))
                    .ToList();
                var evidenceText = JoinEvidenceText(
                    group.Instruction,
                    string.Join("\n", group.Questions.Select(question => question.Content)));
                builder.AppendLine($"### Q{group.StartQuestion}-{group.EndQuestion}");
                builder.AppendLine($"- mapped_group_type: `{groupType}`");
                builder.AppendLine($"- instruction: {group.Instruction}");
                builder.AppendLine($"- evidence_has_matching_instruction: `{HasExplicitMatchingTaskInstruction(evidenceText)}`");
                builder.AppendLine($"- evidence_has_mcq_options: `{LooksLikeMcqChoiceSet(allOptions)}`");
                builder.AppendLine($"- evidence_has_completion_instruction: `{LooksLikeCompletionInstruction(evidenceText)}`");
                builder.AppendLine();
                builder.AppendLine("| Q | answer | option_count | option_preview | content_preview |");
                builder.AppendLine("|---|---|---:|---|---|");
                foreach (var question in group.Questions.OrderBy(question => question.QuestionNumber ?? int.MaxValue))
                {
                    var optionPreview = string.Join(" / ", question.Options.Take(5).Select(option => option.OptionText));
                    builder.AppendLine(
                        $"| {question.QuestionNumber} | {EscapeMarkdownTable(question.CorrectAnswer)} | {question.Options.Count} | {EscapeMarkdownTable(optionPreview)} | {EscapeMarkdownTable(TruncateForAudit(question.Content, 120))} |");
                }

                builder.AppendLine();
            }
        }

        return builder.ToString();
    }

    private static string EscapeMarkdownTable(string? value) =>
        (value ?? string.Empty)
            .Replace("\r", " ")
            .Replace("\n", " ")
            .Replace("|", "\\|")
            .Trim();

    private static string BuildVisualCropDebug(CreateExamDto createExamDto)
    {
        var crops = new List<object>();
        foreach (var passage in createExamDto.Sections.SelectMany(section => section.ReadingPassages ?? []))
        {
            foreach (var group in passage.QuestionGroups.OrderBy(group => group.StartQuestion ?? int.MaxValue))
            {
                if (string.IsNullOrWhiteSpace(group.AssetsData))
                {
                    continue;
                }

                try
                {
                    using var document = JsonDocument.Parse(group.AssetsData);
                    var root = document.RootElement;
                    if (root.ValueKind != JsonValueKind.Object ||
                        !root.TryGetProperty("cropBox", out var cropBox) ||
                        cropBox.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    crops.Add(new
                    {
                        passageNumber = passage.PassageNumber,
                        startQuestion = group.StartQuestion,
                        endQuestion = group.EndQuestion,
                        groupType = group.GroupType,
                        layout = root.TryGetProperty("layout", out var layout) ? layout.GetString() : null,
                        pageNumber = root.TryGetProperty("pageNumber", out var pageNumber) && pageNumber.ValueKind == JsonValueKind.Number
                            ? pageNumber.GetInt32()
                            : (int?)null,
                        cropBox = JsonSerializer.Deserialize<Dictionary<string, double>>(cropBox.GetRawText(), JsonOptions),
                        note = root.TryGetProperty("note", out var note) ? note.GetString() : null
                    });
                }
                catch
                {
                    // Ignore malformed assets data in debug export.
                }
            }
        }

        return JsonSerializer.Serialize(new { crops }, JsonOptions);
    }

    private static string TruncateForAudit(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = Regex.Replace(value.Trim(), @"\s+", " ");
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength] + "...";
    }

    private sealed class GeminiNativePdfExtractionPayload
    {
        [JsonPropertyName("passages")]
        public List<GemmaPassagePayload> Passages { get; set; } = [];
    }

    private sealed record NativePdfExtractionResult(
        string RawJson,
        GeminiNativePdfExtractionPayload Payload);

    private sealed record NativePdfPageProfile(
        int PageCount,
        int? SolutionStartPage,
        int? ReviewStartPage,
        IReadOnlyList<int> ImageHeavyPages);
}
