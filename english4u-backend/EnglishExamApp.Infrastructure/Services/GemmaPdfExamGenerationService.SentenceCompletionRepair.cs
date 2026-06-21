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

    private async Task<List<CreateQuestionDto>> TryRepairSentenceCompletionQuestionSetWithGemmaAsync(
        List<CreateQuestionDto> questions,
        string passageContent,
        string? rawPassageText,
        QuestionGroupBuilder builder,
        CancellationToken cancellationToken)
    {
        var debugDir = ActiveDebugDirectory.Value;
        if (!string.IsNullOrWhiteSpace(debugDir))
        {
            try
            {
                var initLogPath = Path.Combine(debugDir, $"repair-init-{builder.RawContext?.StartQuestion}-{builder.RawContext?.EndQuestion}.txt");
                File.WriteAllText(initLogPath, $"QuestionsCount: {questions?.Count}\nPassageContentEmpty: {string.IsNullOrWhiteSpace(passageContent)}\nRawBlockTextEmpty: {string.IsNullOrWhiteSpace(builder.RawBlockText)}\nRawBlockText: {builder.RawBlockText}\nGroupType: {builder.GroupType}", Encoding.UTF8);
            }
            catch {}
        }

        if (questions.Count <= 1 ||
            string.IsNullOrWhiteSpace(passageContent) ||
            string.IsNullOrWhiteSpace(builder.RawBlockText))
        {
            return questions;
        }

        try
        {
            var rawBlockTextForPrompt = builder.RawBlockText!;
            var startQ = builder.RawContext?.StartQuestion;
            var endQ = builder.RawContext?.EndQuestion;
            if (startQ.HasValue && endQ.HasValue &&
                IsHeaderOnlyBlockText(rawBlockTextForPrompt))
            {
                var extracted = TryExtractInlineQuestionBodyFromRawPassage(
                    rawPassageText, startQ.Value, endQ.Value);
                if (!string.IsNullOrWhiteSpace(extracted))
                {
                    rawBlockTextForPrompt = extracted;
                }
            }

            var prompt = BuildSentenceCompletionTemplateRepairPrompt(
                passageContent,
                builder.RawInstruction,
                rawBlockTextForPrompt,
                builder.RawContext?.QuestionPreview,
                questions);
            var rawResponse = await RequestGemmaJsonCompletionWithRetryAsync(prompt, cancellationToken);

            if (!string.IsNullOrWhiteSpace(debugDir))
            {
                try
                {
                    var debugFilePath = Path.Combine(debugDir, $"repair-sentence-completion-{builder.RawContext?.StartQuestion}-{builder.RawContext?.EndQuestion}.txt");
                    var debugContent = new StringBuilder();
                    debugContent.AppendLine($"=== START QUESTION RANGE: {builder.RawContext?.StartQuestion}-{builder.RawContext?.EndQuestion} ===");
                    debugContent.AppendLine("=== RAW BLOCK TEXT ===");
                    debugContent.AppendLine(builder.RawBlockText);
                    debugContent.AppendLine("=== PROMPT ===");
                    debugContent.AppendLine(prompt);
                    debugContent.AppendLine("=== RAW RESPONSE ===");
                    debugContent.AppendLine(rawResponse);
                    File.WriteAllText(debugFilePath, debugContent.ToString(), Encoding.UTF8);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to write repair-sentence-completion debug file.");
                }
            }

            if (!TryDeserializeSentenceCompletionTemplateMap(rawResponse, out var templateMap, out var parseError))
            {
                logger.LogWarning(
                    "Gemma sentence-completion template repair returned invalid JSON for range {StartQuestion}-{EndQuestion}: {Error}",
                    builder.RawContext?.StartQuestion ?? questions.Min(question => question.QuestionNumber ?? 0),
                    builder.RawContext?.EndQuestion ?? questions.Max(question => question.QuestionNumber ?? 0),
                    parseError);
                return questions;
            }

            if (templateMap.Count == 0)
            {
                return questions;
            }

            var rebuiltQuestions = new List<CreateQuestionDto>(questions.Count);
            foreach (var question in questions)
            {
                if (!question.QuestionNumber.HasValue ||
                    !templateMap.TryGetValue(question.QuestionNumber.Value, out var template))
                {
                    return questions;
                }

                var originalPlaceholderCount = Regex.Matches(question.Content ?? string.Empty, @"\[Q\d+\]|___").Count;
                if (originalPlaceholderCount >= 2)
                {
                    rebuiltQuestions.Add(question);
                    continue;
                }

                var normalizedTemplate = NormalizeQuestionBody(
                    "SENTENCE_COMPLETION",
                    template,
                    question.QuestionNumber);
                if (!IsValidSentenceCompletionTemplate(normalizedTemplate, question.QuestionNumber.Value))
                {
                    return questions;
                }

                var finalTemplate = RestoreOriginalLeadingContext(question.Content, normalizedTemplate, question.QuestionNumber.Value);
                rebuiltQuestions.Add(question with
                {
                    Content = finalTemplate
                });
            }

            return rebuiltQuestions;
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Gemma sentence-completion template repair failed unexpectedly for range {StartQuestion}-{EndQuestion}.",
                builder.RawContext?.StartQuestion ?? questions.Min(question => question.QuestionNumber ?? 0),
                builder.RawContext?.EndQuestion ?? questions.Max(question => question.QuestionNumber ?? 0));
            return questions;
        }
    }

    private static string BuildSentenceCompletionTemplateRepairPrompt(
        string passageContent,
        string? instruction,
        string rawBlockText,
        string? questionPreview,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        var questionsJson = JsonSerializer.Serialize(
            questions
                .Where(question => question.QuestionNumber.HasValue)
                .Select(question => new
                {
                    question_number = question.QuestionNumber,
                    current_candidate = CollapseWhitespaceForPrompt(question.Content, 260),
                    answer = question.CorrectAnswer?.Trim() ?? string.Empty
                }),
            JsonOptions);

        return $$"""
            Bản dịch và tái dựng các câu hỏi điền từ (Sentence/Summary Completion) cho đề IELTS Reading.

            NHIỆM VỤ:
            - Dựa vào PASSAGE, QUESTION_BLOCK_RAW và danh sách ANSWER để dựng lại chính xác văn bản chứa các ô trống [Qn].
            - Trả về danh sách templates tương ứng với từng question_number.

            QUY TẮC BẢO TOÀN ĐOẠN VĂN:
            - Nếu QUESTION_BLOCK_RAW là một đoạn văn tóm tắt liên tục (Summary) có chứa các câu trung gian (câu bình thường không có ô trống), bạn PHẢI đính kèm câu trung gian đó vào template của câu hỏi [Qn] đứng ngay trước hoặc ngay sau nó.
            - Mục tiêu là khi ghép nối tất cả các template lại theo thứ tự từ nhỏ đến lớn, chúng ta sẽ thu được một đoạn văn hoàn chỉnh, liền mạch, không bị mất mát bất kỳ câu nào từ QUESTION_BLOCK_RAW gốc.

            QUY TẮC CẤU TRÚC TEMPLATE:
            - Mỗi template tương ứng với question_number chỉ được phép chứa duy nhất một token [Qn] đại diện cho câu hỏi đó. Không được để lộ token của các câu hỏi khác trong cùng một template.
            - Không được tự ý rút gọn hoặc paraphrase văn bản gốc. Giữ nguyên wording của QUESTION_BLOCK_RAW, chỉ làm sạch các lỗi dính chữ hoặc lỗi OCR.

            VÍ DỤ MINH HỌA:
            Nếu QUESTION_BLOCK_RAW có chứa câu trung gian không có ô trống ở giữa câu 4 và câu 5:
            "Money can buy you just about anything. Whether on a personal or national 4, your bank balance won't make you happier. Once the basic criteria of a roof over your head have been met, money ceases to play a part. One of the most important factors in achieving happiness is the extent of our social 5..."
            
            Kết quả mong muốn:
            {
              "templates": [
                {
                  "question_number": 4,
                  "template": "Money can buy you just about anything. Whether on a personal or national [Q4], your bank balance won't make you happier. Once the basic criteria of a roof over your head have been met, money ceases to play a part."
                },
                {
                  "question_number": 5,
                  "template": "One of the most important factors in achieving happiness is the extent of our social [Q5]..."
                }
              ]
            }

            PASSAGE:
            {{BuildPromptMultilineBlock(passageContent, 9000)}}

            INSTRUCTION:
            {{BuildPromptMultilineBlock(instruction, 600)}}

            QUESTION_PREVIEW:
            {{BuildPromptMultilineBlock(questionPreview, 1400)}}

            QUESTION_BLOCK_RAW:
            {{BuildPromptMultilineBlock(rawBlockText, 4000)}}

            QUESTIONS_JSON:
            {{questionsJson}}
            """;
    }

    private static string BuildPromptMultilineBlock(string? text, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(text)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..maxLength].TrimEnd();
    }

    private static bool TryDeserializeSentenceCompletionTemplateMap(
        string rawResponse,
        out Dictionary<int, string> templateMap,
        out string error)
    {
        templateMap = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeSentenceCompletionTemplateCandidate(candidate, out templateMap, out var parseError))
                {
                    return true;
                }

                error = parseError ?? "Unknown parse error";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeSentenceCompletionTemplateCandidate(
        string candidateJson,
        out Dictionary<int, string> templateMap,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var payload = DeserializeSentenceCompletionTemplatePayload(workingJson);
                templateMap = ConvertSentenceCompletionTemplatePayloadToMap(payload);
                return true;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        templateMap = [];
        return false;
    }

    private static SentenceCompletionTemplateResponse DeserializeSentenceCompletionTemplatePayload(string json)
    {
        var objectPayload = JsonSerializer.Deserialize<SentenceCompletionTemplateResponse>(json, JsonOptions);
        if (objectPayload?.Templates is not null)
        {
            return objectPayload;
        }

        var arrayPayload = JsonSerializer.Deserialize<List<SentenceCompletionTemplateItem>>(json, JsonOptions);
        return new SentenceCompletionTemplateResponse
        {
            Templates = arrayPayload ?? []
        };
    }

    private static Dictionary<int, string> ConvertSentenceCompletionTemplatePayloadToMap(
        SentenceCompletionTemplateResponse payload)
    {
        var map = new Dictionary<int, string>();
        foreach (var item in payload.Templates ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(item.QuestionNumber));
            if (!questionNumber.HasValue || questionNumber.Value <= 0)
            {
                continue;
            }

            var template = UnescapeExtractedText(item.Template ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(template))
            {
                continue;
            }

            map[questionNumber.Value] = template;
        }

        return map;
    }

    private static bool IsValidSentenceCompletionTemplate(string? template, int questionNumber)
    {
        if (string.IsNullOrWhiteSpace(template))
        {
            return false;
        }

        var normalized = Regex.Replace(template, @"\s+", " ").Trim();
        var expectedToken = $"[Q{questionNumber}]";
        if (!normalized.Contains(expectedToken, StringComparison.Ordinal))
        {
            return false;
        }

        var tokens = Regex.Matches(normalized, @"\[Q\d+\]");
        if (tokens.Count != 1 || !string.Equals(tokens[0].Value, expectedToken, StringComparison.Ordinal))
        {
            return false;
        }

        var withoutToken = normalized.Replace(expectedToken, "___", StringComparison.Ordinal);
        if (LooksLikeAnyStrongInstructionLine(withoutToken) || QuestionRangeBoundaryRegex().IsMatch(withoutToken))
        {
            return false;
        }

        var wordCount = Regex.Matches(withoutToken, @"[A-Za-z][A-Za-z'â€™\-]*").Count;
        return wordCount >= 4 && normalized.Length <= 600;
    }

    private static bool IsHeaderOnlyBlockText(string? blockText)
    {
        if (string.IsNullOrWhiteSpace(blockText)) return true;
        var normalized = Regex.Replace(blockText.Trim(), @"\s+", " ");
        return Regex.IsMatch(normalized, @"(?i)^questions?\s+\d{1,2}\s*[-\u2013\u2014]\s*\d{1,2}\s*$") ||
               Regex.IsMatch(normalized, @"(?i)^question\s+\d{1,2}\s*$");
    }

    private static string? TryExtractInlineQuestionBodyFromRawPassage(
        string? rawPassageText,
        int startQuestion,
        int endQuestion)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText) || startQuestion <= 0 || endQuestion < startQuestion)
            return null;

        var normalized = rawPassageText.Replace("\r\n", "\n").Replace('\r', '\n');
        var startPat = $@"(?<!\d){Regex.Escape(startQuestion.ToString())}(?!\d)(?!\s*[-\u2013]\s*\d)";
        var endPat = $@"(?<!\d){Regex.Escape(endQuestion.ToString())}(?!\d)(?!\s*[-\u2013]\s*\d)";

        Match? selectedStart = null;
        foreach (Match m in Regex.Matches(normalized, startPat))
        {
            var beforeSnippet = normalized[Math.Max(0, m.Index - 20)..m.Index];
            if (Regex.IsMatch(beforeSnippet, @"(?i)questions?\s*$"))
                continue;

            var window = normalized[m.Index..Math.Min(normalized.Length, m.Index + 2000)];
            if (!Regex.IsMatch(window, endPat))
                continue;

            selectedStart = m;
            break;
        }

        if (selectedStart is null) return null;

        var fromStart = normalized[selectedStart.Index..];
        var endMatches = Regex.Matches(fromStart, endPat);
        if (endMatches.Count == 0) return null;

        var lastEnd = endMatches[^1];
        var absEnd = selectedStart.Index + lastEnd.Index + lastEnd.Length;

        var dotIdx = normalized.IndexOf('.', absEnd);
        if (dotIdx >= 0 && dotIdx - absEnd < 200)
            absEnd = dotIdx + 1;

        var lookbackStart = Math.Max(0, selectedStart.Index - 500);
        var prefixText = normalized[lookbackStart..selectedStart.Index];
        var contextStart = lookbackStart;
        var sentenceBoundaries = Regex.Matches(prefixText, @"(?<=\.\s{0,3})[A-Z]|(?<=\n)[A-Z]");
        if (sentenceBoundaries.Count > 0)
        {
            var pickIndex = sentenceBoundaries.Count >= 2
                ? sentenceBoundaries[sentenceBoundaries.Count - 2].Index
                : sentenceBoundaries[^1].Index;
            contextStart = lookbackStart + pickIndex;
        }

        var body = normalized[contextStart..Math.Min(normalized.Length, absEnd)].Trim();
        return body.Length > 30 ? body : null;
    }
}
