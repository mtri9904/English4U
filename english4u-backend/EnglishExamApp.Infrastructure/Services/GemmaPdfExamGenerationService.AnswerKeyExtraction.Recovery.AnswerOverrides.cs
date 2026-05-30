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

    private static bool ShouldSkipAnswerLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return true;
        }

        if (!line.Any(char.IsDigit))
        {
            return true;
        }

        if (AccessOrPageNoiseRegex().IsMatch(line))
        {
            return true;
        }

        return line.Contains("Question", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Questions", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Passage", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Explanation", StringComparison.OrdinalIgnoreCase) ||
               line.Contains("Review", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryExtractSingleAnswerLine(string line, out int number, out string answer)
    {
        number = -1;
        answer = string.Empty;

        var match = SingleAnswerLineRegex().Match(line);
        if (!match.Success)
        {
            return false;
        }

        if (!int.TryParse(match.Groups["number"].Value, out number))
        {
            return false;
        }

        answer = SanitizeAnswerValue(match.Groups["answer"].Value);
        if (string.IsNullOrWhiteSpace(answer))
        {
            return false;
        }

        if (CompactAnswerBlobRegex().IsMatch(answer))
        {
            return false;
        }

        return IsLikelyDirectAnswerToken(answer);
    }

    private static string SanitizeAnswerValue(string? rawAnswer)
    {
        if (string.IsNullOrWhiteSpace(rawAnswer))
        {
            return string.Empty;
        }

        var sanitized = rawAnswer.Trim();
        sanitized = sanitized.Trim('"', '\'', '.', ' ', '\t');
        sanitized = Regex.Replace(sanitized, @"\s+", " ");
        sanitized = StripTrailingFooterNoiseFromAnswer(sanitized);
        sanitized = StripTrailingReviewMarkerNoiseFromAnswer(sanitized);
        sanitized = StripTrailingQuestionMarkerNoiseFromAnswer(sanitized);

        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return string.Empty;
        }

        if (AccessOrPageNoiseRegex().IsMatch(sanitized))
        {
            return string.Empty;
        }

        if (CompactAnswerBlobRegex().IsMatch(sanitized))
        {
            return string.Empty;
        }

        var labelAndTextMatch = AnswerStartsWithLabelRegex().Match(sanitized);
        if (labelAndTextMatch.Success)
        {
            return labelAndTextMatch.Groups["label"].Value;
        }

        var explanationSplitMatch = AnswerBeforeExplanationRegex().Match(sanitized);
        if (explanationSplitMatch.Success)
        {
            var beforeExplanation = explanationSplitMatch.Groups["answer"].Value.Trim();
            if (!string.IsNullOrWhiteSpace(beforeExplanation))
            {
                sanitized = beforeExplanation;
            }
        }

        sanitized = sanitized.Trim();
        if (sanitized.Length > 80)
        {
            return string.Empty;
        }

        return sanitized.Trim();
    }

    private static string StripTrailingFooterNoiseFromAnswer(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value;
        cleaned = Regex.Replace(cleaned, @"(?i)page\s*\d+\b.*$", string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)access\s+https?://\S+.*$", string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)https?://\S+.*$", string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }

    private static string StripTrailingReviewMarkerNoiseFromAnswer(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value;
        cleaned = Regex.Replace(
            cleaned,
            @"(?ix)\b(?:keywords?\s*in\s*questions?|similar\s*words?\s*in\s*passage|q\s*\d+\s*:|note\s*:).*$",
            string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }

    private static string StripTrailingQuestionMarkerNoiseFromAnswer(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value;
        cleaned = Regex.Replace(
            cleaned,
            @"(?ix)
            \s+
            Q\s*\d{1,2}
            (?:
                \s*[&/,;:-]\s*
            )?
            $",
            string.Empty).Trim();
        cleaned = Regex.Replace(
            cleaned,
            @"(?ix)
            \s+
            Q(?:uestion)?\s*\d{1,2}
            (?:
                \s*[&/,;:-]\s*
            )?
            $",
            string.Empty).Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }

    private static HashSet<int> ApplyAnswerKeyOverrides(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var verifiedQuestionNumbers = new HashSet<int>();
        var fallbackGlobalQuestionNumber = 1;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;

                if (answerKeyMap.TryGetValue(effectiveQuestionNumber, out var answerFromKey) &&
                    !string.IsNullOrWhiteSpace(answerFromKey))
                {
                    var extractedAnswerFromKey = NormalizeFallbackAnswer(answerFromKey);
                    if (string.IsNullOrWhiteSpace(extractedAnswerFromKey))
                    {
                        fallbackGlobalQuestionNumber++;
                        continue;
                    }

                    var normalizedAnswerFromKey = CanonicalizeAnswerForQuestionType(question, extractedAnswerFromKey);
                    if (string.IsNullOrWhiteSpace(normalizedAnswerFromKey))
                    {
                        fallbackGlobalQuestionNumber++;
                        continue;
                    }

                    if (IsValidAnswerOverride(question, normalizedAnswerFromKey))
                    {
                        question.Answer = JsonSerializer.SerializeToElement(normalizedAnswerFromKey);
                        verifiedQuestionNumbers.Add(effectiveQuestionNumber);
                    }
                }

                fallbackGlobalQuestionNumber++;
            }
        }

        return verifiedQuestionNumbers;
    }

    private static bool IsValidAnswerOverride(GemmaQuestionPayload question, string candidateAnswer)
    {
        if (string.IsNullOrWhiteSpace(candidateAnswer))
        {
            return false;
        }

        var sanitized = SanitizeAnswerValue(candidateAnswer);
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return false;
        }

        var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
        var options = ExtractOptions(question.Options);
        var normalizedAnswer = NormalizeToken(sanitized);
        var answerTokens = SplitAnswerTokens(sanitized);

        var hasTfngSignal = answerTokens.Contains("TRUE") || answerTokens.Contains("FALSE");
        var hasYnngSignal = answerTokens.Contains("YES") || answerTokens.Contains("NO");

        if (hasTfngSignal && !hasYnngSignal)
        {
            return answerTokens.Count > 0 && answerTokens.All(IsTfngAnswerToken);
        }

        if (hasYnngSignal && !hasTfngSignal)
        {
            return answerTokens.Count > 0 && answerTokens.All(IsYnngAnswerToken);
        }

        if (mappedType is "TFNG")
        {
            return answerTokens.Count > 0 && answerTokens.All(IsTfngAnswerToken);
        }

        if (mappedType is "YNNG")
        {
            return answerTokens.Count > 0 && answerTokens.All(IsYnngAnswerToken);
        }

        if (mappedType is "MATCHING_HEADINGS" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS")
        {
            return IsSingleLetterAnswerToken(normalizedAnswer) && IsWithinOptionRange(normalizedAnswer, options.Count);
        }

        if (mappedType is "MCQ_CHOOSE_N")
        {
            return answerTokens.Count > 0 &&
                   answerTokens.All(token => IsSingleLetterAnswerToken(token) && IsWithinOptionRange(token, options.Count));
        }

        if (mappedType is "MCQ_SINGLE" or "MCQ_MULTIPLE")
        {
            if (answerTokens.Count > 1 && answerTokens.All(IsSingleLetterAnswerToken))
            {
                return answerTokens.All(token => IsWithinOptionRange(token, options.Count));
            }

            if (IsSingleLetterAnswerToken(normalizedAnswer))
            {
                return IsWithinOptionRange(normalizedAnswer, options.Count);
            }

            if (options.Count == 0)
            {
                return sanitized.Length <= 80 &&
                       !AccessOrPageNoiseRegex().IsMatch(sanitized) &&
                       !CompactAnswerBlobRegex().IsMatch(sanitized);
            }

            return options.Any(option => NormalizeToken(option) == normalizedAnswer);
        }

        if (mappedType is "SENTENCE_COMPLETION")
        {
            if (AccessOrPageNoiseRegex().IsMatch(sanitized) || CompactAnswerBlobRegex().IsMatch(sanitized))
            {
                return false;
            }

            return sanitized.Length <= 80;
        }

        return true;
    }

    private static bool IsTfngAnswerToken(string token) =>
        token is "TRUE" or "FALSE" or "NOT GIVEN" or "T" or "F" or "NG" or "NOTGIVEN";

    private static bool IsYnngAnswerToken(string token) =>
        token is "YES" or "NO" or "NOT GIVEN" or "Y" or "N" or "NG" or "NOTGIVEN";

    private static bool TryInferQuestionTypeFromAnswer(string? answerText, out string inferredQuestionType)
    {
        inferredQuestionType = string.Empty;

        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }

        var tokens = SplitAnswerTokens(answerText);
        if (tokens.Count == 0)
        {
            return false;
        }

        var hasTfngSignal = tokens.Contains("TRUE") || tokens.Contains("FALSE");
        var hasYnngSignal = tokens.Contains("YES") || tokens.Contains("NO");
        var hasNotGivenSignal = tokens.Contains("NOT GIVEN") || tokens.Contains("NG") || tokens.Contains("NOTGIVEN");

        if (hasTfngSignal && !hasYnngSignal)
        {
            inferredQuestionType = "TrueFalseNotGiven";
            return true;
        }

        if (hasYnngSignal && !hasTfngSignal)
        {
            inferredQuestionType = "YesNoNotGiven";
            return true;
        }

        if (hasNotGivenSignal && !hasTfngSignal && !hasYnngSignal)
        {
            inferredQuestionType = "TrueFalseNotGiven";
            return true;
        }

        if (tokens.Count > 1 && tokens.All(IsSingleLetterAnswerToken))
        {
            inferredQuestionType = "McqMultiple";
            return true;
        }

        return false;
    }

    private static bool IsSingleLetterAnswerToken(string token) =>
        token.Length == 1 && token[0] is >= 'A' and <= 'H';

    private static bool IsWithinOptionRange(string answerToken, int optionCount)
    {
        if (!IsSingleLetterAnswerToken(answerToken))
        {
            return false;
        }

        if (optionCount <= 0)
        {
            return true;
        }

        var index = answerToken[0] - 'A';
        return index >= 0 && index < optionCount;
    }

    private static int CountMissingOrInvalidAnswers(IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        var missingCount = 0;
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var currentAnswer = ReadJsonAsText(question.Answer);
                if (string.IsNullOrWhiteSpace(currentAnswer) ||
                    !IsValidAnswerOverride(question, currentAnswer))
                {
                    missingCount++;
                }
            }
        }

        return missingCount;
    }

    private static int ClearAnswersWithoutEvidence(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlySet<int> verifiedQuestionNumbers)
    {
        var clearedCount = 0;
        var fallbackGlobalQuestionNumber = 1;

        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                if (verifiedQuestionNumbers.Contains(effectiveQuestionNumber))
                {
                    continue;
                }

                var currentAnswer = ReadJsonAsText(question.Answer);
                if (string.IsNullOrWhiteSpace(currentAnswer))
                {
                    continue;
                }

                question.Answer = JsonSerializer.SerializeToElement(string.Empty);
                clearedCount++;
            }
        }

        return clearedCount;
    }
}
