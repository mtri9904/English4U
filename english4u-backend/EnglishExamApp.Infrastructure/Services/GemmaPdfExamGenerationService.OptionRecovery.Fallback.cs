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

    private static string BuildFallbackOptionPrompt(
        string reviewAndSolutionText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        var candidatesJson = JsonSerializer.Serialize(
            candidates.Select(candidate => new
            {
                question_number = candidate.QuestionNumber,
                question_type = candidate.QuestionType,
                question_text = candidate.QuestionText,
                expected_option_labels = candidate.ExpectedOptionLabels,
                current_options = candidate.CurrentOptions
            }),
            JsonOptions);

        return $"""
            Báº¡n lÃ  bá»™ mÃ¡y khÃ´i phá»¥c lá»±a chá»n tráº¯c nghiá»‡m IELTS.
            Nhiá»‡m vá»¥: khÃ´i phá»¥c ná»™i dung options cho cÃ¡c cÃ¢u bá»‹ máº¥t text (chá»‰ cÃ²n A/B/C hoáº·c rá»—ng) CHá»ˆ dá»±a trÃªn QUESTION_CONTEXT_FROM_RAW_TEXT vÃ  REVIEW_AND_EXPLANATIONS.

            QUY Táº®C Cá»¨NG:
            - KhÃ´ng tá»± giáº£i bÃ i, khÃ´ng suy luáº­n theo passage.
            - Chá»‰ dÃ¹ng QUESTION_CONTEXT_FROM_RAW_TEXT vÃ  REVIEW_AND_EXPLANATIONS Ä‘á»ƒ khÃ´i phá»¥c options.
            - NghiÃªm cáº¥m dÃ¹ng khá»‘i "Solution:" dáº¡ng dÃ­nh chá»¯ (vÃ­ dá»¥: 1C2D3F... hoáº·c 1822A,C,D,E,H).
            - Vá»›i cÃ¢u MCQ, khÃ´ng Ä‘Æ°á»£c tráº£ options = [].
            - NghiÃªm cáº¥m tráº£ option chá»‰ lÃ  nhÃ£n "A", "B", "C"... khÃ´ng cÃ³ ná»™i dung.
            - Náº¿u cÃ¢u MCQ Ä‘ang thiáº¿u option (vÃ­ dá»¥ chá»‰ cÃ³ A/B), pháº£i cá»‘ gáº¯ng khÃ´i phá»¥c Ä‘á»§ option cÃ²n thiáº¿u tá»« Review and Explanations.
            - Náº¿u Ä‘Ã¡p Ã¡n Ä‘Ã£ chá»‰ ra letter chÆ°a cÃ³ option tÆ°Æ¡ng á»©ng (vÃ­ dá»¥ answer = C nhÆ°ng chÆ°a cÃ³ option C), báº¯t buá»™c tiáº¿p tá»¥c tÃ¬m vÃ  khÃ´i phá»¥c option Ä‘Ã³.
            - Vá»›i MCQ_CHOOSE_N, pháº£i khÃ´i phá»¥c Ä‘áº§y Ä‘á»§ option text cho Tá»ªNG cÃ¢u. Náº¿u block dÃ¹ng chung má»™t answer bank A-H/A-F thÃ¬ pháº£i khÃ´i phá»¥c trá»n bá»™ answer bank Ä‘Ã³; náº¿u má»—i cÃ¢u cÃ³ option riÃªng thÃ¬ pháº£i giá»¯ option riÃªng theo tá»«ng cÃ¢u.
            - OPTION TEXT MANDATORY: vá»›i MCQ_CHOOSE_N, máº£ng options TUYá»†T Äá»I KHÃ”NG ÄÆ¯á»¢C chá»‰ chá»©a "A", "B", "C", "D"... hoáº·c checkbox tráº§n khÃ´ng cÃ³ text.
            - Náº¿u QUESTION_CONTEXT_FROM_RAW_TEXT chá»‰ cÃ²n cá»¥m nhÃ£n rá»i nhÆ° "A B C D ..." vÃ  block tháº­t sá»± dÃ¹ng shared answer bank, Báº N Báº®T BUá»˜C pháº£i kÃ©o xuá»‘ng REVIEW_AND_EXPLANATIONS Ä‘á»ƒ láº¥y láº¡i Ä‘áº§y Ä‘á»§ ná»™i dung tá»«ng option.
            - Viá»‡c tráº£ vá» ["A", "B", "C"] hoáº·c label-only options cho MCQ_CHOOSE_N lÃ  Lá»–I NGHIÃŠM TRá»ŒNG; pháº£i tráº£ vá» text Ä‘áº§y Ä‘á»§ kiá»ƒu "A. ...", "B. ...".
            - QUY Táº®C Sá»NG CÃ’N: TUYá»†T Äá»I KHÃ”NG BAO GIá»œ tráº£ option rá»—ng. Cáº¥m tráº£ "A", "B", "C"... náº¿u khÃ´ng cÃ³ ná»™i dung text Ä‘i kÃ¨m.
            - Náº¿u thiáº¿u text option trong pháº§n cÃ¢u há»i, báº¯t buá»™c Ä‘á»‘i chiáº¿u chÃ©o pháº§n Review and Explanations Ä‘á»ƒ khÃ´i phá»¥c Ä‘á»§ text cho tá»«ng option trÆ°á»›c khi tráº£ JSON.
            - LUáº¬T CHá»NG Lá»–I DÃNH Cá»˜T PDF: náº¿u phÃ¡t hiá»‡n cá»¥m nhÃ£n kiá»ƒu "A B C D ...", rá»“i má»™t khá»‘i cÃ¢u dÃ­nh liá»n phÃ­a sau, pháº£i tá»± tÃ¡ch khá»‘i cÃ¢u Ä‘Ã³ theo dáº¥u cháº¥m/chá»¯ hoa vÃ  map tuáº§n tá»± vÃ o A, B, C, D...
            - Khi Ã¡p dá»¥ng luáº­t dÃ­nh cá»™t, pháº£i giá»¯ Ä‘Ãºng thá»© tá»± nhÃ£n ban Ä‘áº§u (A trÆ°á»›c B trÆ°á»›c C...) vÃ  Ä‘iá»n Ä‘á»§ text cho tá»«ng nhÃ£n.
            - Cáº¢NH BÃO Lá»–I Láº®P SAI OPTIONS (MCQ): TUYá»†T Äá»I KHÃ”NG láº¥y option cá»§a cÃ¢u nÃ y gÃ¡n sang cÃ¢u khÃ¡c.
            - Báº¯t buá»™c Ä‘á»‘i chiáº¿u 1-1 theo Ä‘Ãºng question_number; chá»‰ láº¥y dá»¯ liá»‡u tá»« pháº§n Review/Explanations cá»§a CHÃNH cÃ¢u Ä‘Ã³.
            - KhÃ´ng tá»± Ã½ thÃªm/bá»›t lá»±a chá»n. Náº¿u cÃ¢u chá»‰ cÃ³ A,B,C thÃ¬ output báº¯t buá»™c Ä‘Ãºng 3 options; khÃ´ng Ä‘Æ°á»£c sinh thÃªm D.
            - VÃ­ dá»¥: náº¿u review ghi "answer ... must be A. mornings" thÃ¬ option A cá»§a cÃ¢u Ä‘Ã³ pháº£i lÃ  "mornings" (khÃ´ng Ä‘á»ƒ trá»‘ng).
            - Vá»›i má»—i cÃ¢u, sá»‘ lÆ°á»£ng options tráº£ vá» pháº£i khá»›p sá»‘ lÆ°á»£ng expected_option_labels trong QUESTIONS_NEED_OPTIONS_JSON.
            - Giá»¯ wording gá»‘c; chá»‰ sá»­a lá»—i dÃ­nh chá»¯/máº¥t khoáº£ng tráº¯ng khi hiá»ƒn nhiÃªn.
            - FEW-SHOT TEMPLATE CHO MCQ_CHOOSE_N: náº¿u block raw bá»‹ dÃ­nh kiá»ƒu "A B C D E F G H McCarthy claims... The cost... Most British..." vÃ  Ä‘Ã¢y lÃ  shared answer bank cá»§a cáº£ group, output há»£p lá»‡ pháº£i cÃ³ dáº¡ng:
              ["A. McCarthy claims ...", "B. The cost ...", "C. Most British ...", "D. ...", "E. ...", "F. ...", "G. ...", "H. ..."].
              Output kiá»ƒu ["A", "B", "C", ...] lÃ  sai vÃ  pháº£i tá»± sá»­a trÆ°á»›c khi tráº£ JSON.
            - Tráº£ vá» DUY NHáº¤T JSON object cÃ³ field "options".
              Má»—i pháº§n tá»­ pháº£i cÃ³: "question_number", "options" (máº£ng string).

            QUESTIONS_NEED_OPTIONS_JSON:
            {candidatesJson}

            OPTION_RECOVERY_SOURCE_TEXT:
            {reviewAndSolutionText}
            """;
    }

    private static bool TryDeserializeFallbackOptionMap(
        string rawResponse,
        out Dictionary<int, List<string>> recoveredOptionMap,
        out string error)
    {
        recoveredOptionMap = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeFallbackOptionCandidate(candidate, out recoveredOptionMap, out var parseError))
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

    private static bool TryDeserializeFallbackOptionCandidate(
        string candidateJson,
        out Dictionary<int, List<string>> recoveredOptionMap,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var payload = DeserializeFallbackOptionPayload(workingJson);
                recoveredOptionMap = ConvertFallbackOptionPayloadToMap(payload);
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

        recoveredOptionMap = [];
        return false;
    }

    private static FallbackOptionResponse DeserializeFallbackOptionPayload(string json)
    {
        var objectPayload = JsonSerializer.Deserialize<FallbackOptionResponse>(json, JsonOptions);
        if (objectPayload?.Options is not null)
        {
            return objectPayload;
        }

        var arrayPayload = JsonSerializer.Deserialize<List<FallbackOptionItem>>(json, JsonOptions);
        return new FallbackOptionResponse
        {
            Options = arrayPayload ?? []
        };
    }

    private static Dictionary<int, List<string>> ConvertFallbackOptionPayloadToMap(FallbackOptionResponse payload)
    {
        var map = new Dictionary<int, List<string>>();
        foreach (var item in payload.Options ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(item.QuestionNumber));
            if (!questionNumber.HasValue || questionNumber.Value <= 0)
            {
                continue;
            }

            var normalizedOptions = NormalizeRecoveredOptions(item.Options ?? []);
            if (!HasMeaningfulMcqOptionSet(normalizedOptions))
            {
                continue;
            }

            map[questionNumber.Value] = normalizedOptions;
        }

        return map;
    }

    private static int ApplyRecoveredOptionMap(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, List<string>> recoveredOptionMap)
    {
        if (recoveredOptionMap.Count == 0)
        {
            return 0;
        }

        var appliedCount = 0;
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

                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                if (!IsMcqType(mappedType) ||
                    !recoveredOptionMap.TryGetValue(effectiveQuestionNumber, out var recoveredOptions))
                {
                    continue;
                }

                var normalizedOptions = NormalizeRecoveredOptions(recoveredOptions);
                var expectedOptionCount = BuildExpectedOptionLabels(ExtractOptions(question.Options)).Count;
                if (!HasMeaningfulMcqOptionSet(normalizedOptions))
                {
                    continue;
                }

                if (expectedOptionCount > 0 && normalizedOptions.Count != expectedOptionCount)
                {
                    continue;
                }

                question.Options = JsonSerializer.SerializeToElement(normalizedOptions);
                appliedCount++;
            }
        }

        return appliedCount;
    }

    private static List<string> NormalizeRecoveredOptions(IEnumerable<string> options) =>
        options
            .Select(option => UnescapeExtractedText(option ?? string.Empty))
            .Select(option => RemoveSelectionMarkers(option))
            .Select(option => option
                .Replace("\r\n", " ")
                .Replace('\r', ' ')
                .Replace('\n', ' '))
            .Select(option => Regex.Replace(option, @"\s+", " ").Trim())
            .Select(option =>
            {
                if (string.IsNullOrWhiteSpace(option))
                {
                    return option;
                }

                var stripped = option;
                var labeledMatch = OptionStartsWithLetterLabelRegex().Match(stripped);
                if (labeledMatch.Success)
                {
                    stripped = labeledMatch.Groups["text"].Value.Trim();
                }
                else
                {
                    var spacedLabelMatch = OptionStartsWithLetterSpaceRegex().Match(stripped);
                    if (spacedLabelMatch.Success)
                    {
                        stripped = spacedLabelMatch.Groups["text"].Value.Trim();
                    }
                }

                return stripped.Trim();
            })
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Where(option => !IsOptionLabelOnly(option))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static bool HasMeaningfulMcqOptionSet(IReadOnlyCollection<string> options)
    {
        if (options.Count < 2)
        {
            return false;
        }

        var meaningfulCount = options.Count(option => !IsOptionLabelOnly(option));
        return meaningfulCount >= Math.Min(2, options.Count);
    }

    private static bool IsOptionLabelOnly(string optionText)
    {
        if (string.IsNullOrWhiteSpace(optionText))
        {
            return true;
        }

        var normalized = RemoveSelectionMarkers(optionText).Trim();
        if (OptionLabelOnlyRegex().IsMatch(normalized))
        {
            return true;
        }

        return false;
    }

    private static bool IsMcqType(string mappedType) =>
        mappedType is "MCQ_SINGLE" or "MCQ_MULTIPLE" or "MCQ_CHOOSE_N";

    private static IReadOnlyList<string> BuildExpectedOptionLabels(IReadOnlyList<string> currentOptions)
    {
        if (currentOptions.Count == 0)
        {
            return [];
        }

        var labels = new List<string>(currentOptions.Count);
        foreach (var option in currentOptions)
        {
            if (string.IsNullOrWhiteSpace(option))
            {
                continue;
            }

            var normalized = option.Trim().Trim('.', ')', ':').ToUpperInvariant();
            if (normalized.Length == 1 && normalized[0] is >= 'A' and <= 'H')
            {
                labels.Add(normalized);
            }
        }

        if (labels.Count > 0)
        {
            return labels.Distinct(StringComparer.Ordinal).ToList();
        }

        return Enumerable.Range(0, Math.Min(currentOptions.Count, 8))
            .Select(index => ((char)('A' + index)).ToString())
            .ToList();
    }
}
