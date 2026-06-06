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
            Bạn là bộ máy khôi phục lựa chọn trắc nghiệm IELTS.
            Nhiệm vụ: khôi phục nội dung options cho các câu bị mất text (chỉ còn A/B/C hoặc rỗng) CHỈ dựa trên QUESTION_CONTEXT_FROM_RAW_TEXT và REVIEW_AND_EXPLANATIONS.

            QUY TẮC CỨNG:
            - Không tự giải bài, không suy luận theo passage.
            - Chỉ dùng QUESTION_CONTEXT_FROM_RAW_TEXT và REVIEW_AND_EXPLANATIONS để khôi phục options.
            - Nghiêm cấm dùng khối "Solution:" dạng dính chữ (ví dụ: 1C2D3F... hoặc 1822A,C,D,E,H).
            - Với câu MCQ, không được trả options = [].
            - Nghiêm cấm trả option chỉ là nhãn "A", "B", "C"... không có nội dung.
            - Nếu câu MCQ đang thiếu option (ví dụ chỉ có A/B), phải cố gắng khôi phục đủ option còn thiếu từ Review and Explanations.
            - Nếu đáp án đã chỉ ra letter chưa có option tương ứng (ví dụ answer = C nhưng chưa có option C), bắt buộc tiếp tục tìm và khôi phục option đó.
            - Với MCQ_CHOOSE_N, phải khôi phục đầy đủ option text cho TỪNG câu. Nếu block dùng chung một answer bank A-H/A-F thì phải khôi phục trọn bộ answer bank đó; nếu mỗi câu có option riêng thì phải giữ option riêng theo từng câu.
            - OPTION TEXT MANDATORY: với MCQ_CHOOSE_N, mảng options TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ chứa "A", "B", "C", "D"... hoặc checkbox trần không có text.
            - Nếu QUESTION_CONTEXT_FROM_RAW_TEXT chỉ còn cụm nhãn rời như "A B C D ..." và block thực sự dùng shared answer bank, BẠN BẮT BUỘC phải kéo xuống REVIEW_AND_EXPLANATIONS để lấy lại đầy đủ nội dung từng option.
            - Việc trả về ["A", "B", "C"] hoặc label-only options cho MCQ_CHOOSE_N là LỖI NGHIÊM TRỌNG; phải trả về text đầy đủ kiểu "A. ...", "B. ...".
            - QUY TẮC SỐNG CÒN: TUYỆT ĐỐI KHÔNG BAO GIỜ trả option rỗng. Cấm trả "A", "B", "C"... nếu không có nội dung text đi kèm.
            - Nếu thiếu text option trong phần câu hỏi, bắt buộc đối chiếu chéo phần Review and Explanations để khôi phục đủ text cho từng option trước khi trả JSON.
            - LUẬT CHỐNG LỖI DÍNH CỘT PDF: nếu phát hiện cụm nhãn kiểu "A B C D ...", rồi một khối câu dính liền phía sau, phải tự tách khối câu đó theo dấu chấm/chữ hoa và map tuần tự vào A, B, C, D...
            - Khi áp dụng luật dính cột, phải giữ đúng thứ tự nhãn ban đầu (A trước B trước C...) và điền đủ text cho từng nhãn.
            - CẢNH BÁO LỖI LẮP SAI OPTIONS (MCQ): TUYỆT ĐỐI KHÔNG lấy option của câu này gán sang câu khác.
            - Bắt buộc đối chiếu 1-1 theo đúng question_number; chỉ lấy dữ liệu từ phần Review/Explanations của CHÍNH câu đó.
            - Không tự ý thêm/bớt lựa chọn. Nếu câu chỉ có A,B,C thì output bắt buộc đúng 3 options; không được sinh thêm D.
            - Ví dụ: nếu review ghi "answer ... must be A. mornings" thì option A của câu đó phải là "mornings" (không để trống).
            - Với mỗi câu, số lượng options trả về phải khớp số lượng expected_option_labels trong QUESTIONS_NEED_OPTIONS_JSON.
            - Giữ wording gốc; chỉ sửa lỗi dính chữ/mất khoảng trắng khi hiển nhiên.
            - FEW-SHOT TEMPLATE CHO MCQ_CHOOSE_N: nếu block raw bị dính kiểu "A B C D E F G H McCarthy claims... The cost... Most British..." và đây là shared answer bank của cả group, output hợp lệ phải có dạng:
              ["A. McCarthy claims ...", "B. The cost ...", "C. Most British ...", "D. ...", "E. ...", "F. ...", "G. ...", "H. ..."].
              Output kiểu ["A", "B", "C", ...] là sai và phải tự sửa trước khi trả JSON.
            - Trả về DUY NHẤT JSON object có field "options".
              Mỗi phần tử phải có: "question_number", "options" (mảng string).

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

        if (IsAllSingleLetterOptions(options.ToList()))
        {
            return true;
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
