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
        if (questions.Count <= 1 ||
            string.IsNullOrWhiteSpace(passageContent) ||
            string.IsNullOrWhiteSpace(builder.RawBlockText))
        {
            return questions;
        }

        try
        {
            var prompt = BuildSentenceCompletionTemplateRepairPrompt(
                passageContent,
                builder.RawInstruction,
                builder.RawBlockText,
                builder.RawContext?.QuestionPreview,
                questions);
            var rawResponse = await RequestGemmaJsonCompletionWithRetryAsync(prompt, cancellationToken);
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
            Báº¡n lÃ  bá»™ mÃ¡y tÃ¡i dá»±ng SENTENCE_COMPLETION cho Ä‘á» IELTS Reading.

            NHIá»†M Vá»¤:
            - DÃ¹ng PASSAGE + QUESTION_BLOCK_RAW + ANSWER Ä‘á»ƒ xÃ¡c Ä‘á»‹nh chÃ­nh xÃ¡c vá»‹ trÃ­ Ã´ trá»‘ng cá»§a tá»«ng cÃ¢u.
            - Vá»›i má»—i question_number, tráº£ láº¡i Ä‘Ãºng má»™t sentence template Ä‘Ã£ chÃ¨n token [Qx] vÃ o chá»— cáº§n Ä‘iá»n.

            QUY Táº®C Cá»¨NG:
            - Má»—i template pháº£i chá»©a ÄÃšNG 1 token cÃ³ dáº¡ng [Qn] tÆ°Æ¡ng á»©ng question_number cá»§a chÃ­nh nÃ³.
            - KhÃ´ng Ä‘Æ°á»£c thÃªm token thá»© hai, khÃ´ng Ä‘Æ°á»£c giá»¯ cÃ¡c token [Qm] khÃ¡c, khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ "___" náº¿u Ä‘Ã£ cÃ³ [Qn].
            - KhÃ´ng Ä‘Æ°á»£c Ä‘áº·t [Qn] á»Ÿ cuá»‘i cÃ¢u náº¿u Ã´ trá»‘ng thá»±c táº¿ náº±m á»Ÿ giá»¯a cÃ¢u.
            - Giá»¯ wording gáº§n Ä‘á» gá»‘c nháº¥t cÃ³ thá»ƒ; chá»‰ sá»­a lá»—i OCR, dÃ­nh chá»¯, máº¥t khoáº£ng tráº¯ng khi hiá»ƒn nhiÃªn.
            - ÄÆ°á»£c phÃ©p dÃ¹ng ANSWER Ä‘á»ƒ Ä‘á»c hiá»ƒu vÃ  xÃ¡c Ä‘á»‹nh tá»«/cá»¥m tá»« nÃ o Ä‘ang bá»‹ thiáº¿u rá»“i Ä‘áº·t [Qn] Ä‘Ãºng vá»‹ trÃ­.
            - Náº¿u raw block bá»‹ lá»—i kiá»ƒu sá»‘ cÃ¢u chÃ¨n vÃ o giá»¯a cÃ¢u, pháº£i hiá»ƒu Ä‘Ã³ lÃ  sá»‘ cÃ¢u chá»© khÃ´ng pháº£i ná»™i dung cÃ¢u.
            - KhÃ´ng tráº£ lá»i giáº£i thÃ­ch, khÃ´ng paraphrase toÃ n bá»™ sentence, khÃ´ng thÃªm instruction.

            TRáº¢ Vá»€ DUY NHáº¤T JSON:
            {
              "templates": [
                {
                  "question_number": 1,
                  "template": "A decrease in crime in the Netherlands and parts of the US is attributable more to the [Q1] than to their incarceration."
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
        return wordCount >= 4 && normalized.Length <= 320;
    }
}
