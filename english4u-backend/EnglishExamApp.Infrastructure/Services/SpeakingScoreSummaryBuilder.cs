using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;

namespace EnglishExamApp.Infrastructure.Services;

internal static class SpeakingScoreSummaryBuilder
{
    public static IReadOnlyList<string> Criteria { get; } =
    [
        "Fluency and Coherence",
        "Lexical Resource",
        "Grammatical Range and Accuracy",
        "Pronunciation"
    ];

    public static double BuildOverallBand(
        IReadOnlyList<(UserAnswer Answer, AiScoreResponse Result, int PartNumber)> scoredItems)
    {
        var partCriterionMaps = scoredItems
            .GroupBy(item => item.PartNumber)
            .Select(partGroup => BuildCriterionAverageMap(partGroup.Select(item => item.Result)))
            .ToList();

        if (partCriterionMaps.Count == 0)
        {
            return 0;
        }

        var overallCriterionBands = Criteria
            .Select(criteria => partCriterionMaps.Average(map => map[criteria]))
            .ToList();

        return overallCriterionBands.Count == 0
            ? 0
            : IeltsScoringCalculator.RoundBand(overallCriterionBands.Average());
    }

    public static string BuildOverallFeedbackPayload(
        IReadOnlyList<(UserAnswer Answer, AiScoreResponse Result, int PartNumber)> scoredItems)
    {
        var lines = new List<string>();
        var overallBand = BuildOverallBand(scoredItems);
        lines.Add(
            $"Band Speaking tổng quan khoảng {overallBand:0.0}. "
            + "Điểm được tổng hợp theo 4 tiêu chí IELTS và cân bằng theo từng Part trong session. "
            + "Nội dung, từ vựng và ngữ pháp dựa trên transcript tự động; fluency và pronunciation dùng thêm tín hiệu ASR từ audio. "
            + "Nếu audio không tạo được transcript, backend chấm no response và không suy đoán nội dung.");

        foreach (var partGroup in scoredItems.GroupBy(item => item.PartNumber).OrderBy(group => group.Key))
        {
            var partItems = partGroup.ToList();
            var noResponseCount = partItems.Count(item => IsNoResponseResult(item.Result));
            var ratableCount = partItems.Count - noResponseCount;
            var criterionBands = BuildCriterionAverageMap(partItems.Select(item => item.Result));
            var partBand = IeltsScoringCalculator.RoundBand(criterionBands.Values.Average());

            if (ratableCount == 0)
            {
                lines.Add(
                    $"{FormatPartLabel(partGroup.Key)} · Band khoảng {partBand:0.0}. "
                    + $"Không có prompt nào trong part này có câu trả lời đủ dữ liệu để đánh giá ({noResponseCount}/{partItems.Count} prompt no response). "
                    + "Không nêu điểm mạnh/yếu theo tiêu chí vì backend không có đủ bằng chứng ngôn ngữ từ audio/transcript. "
                    + "Cần trả lời tối thiểu 1-2 câu rõ tiếng Anh cho mỗi prompt để có thể chấm Fluency, Lexical Resource, Grammar và Pronunciation.");
                continue;
            }

            var strongestCriteria = criterionBands
                .OrderByDescending(item => item.Value)
                .ThenBy(item => item.Key, StringComparer.Ordinal)
                .Take(2)
                .Select(item => GetCriteriaDisplayName(item.Key))
                .ToList();
            var weakestCriteria = criterionBands
                .OrderBy(item => item.Value)
                .ThenBy(item => item.Key, StringComparer.Ordinal)
                .Take(2)
                .Select(item => item.Key)
                .ToList();

            var responseCoverageText = noResponseCount > 0
                ? $" Có {noResponseCount}/{partItems.Count} prompt no response nên điểm part bị kéo xuống."
                : string.Empty;

            lines.Add(
                $"{FormatPartLabel(partGroup.Key)} · Band khoảng {partBand:0.0}.{responseCoverageText} "
                + $"Dựa trên {ratableCount} prompt có transcript/audio đủ dữ liệu, điểm mạnh tương đối: {string.Join(", ", strongestCriteria)}. "
                + $"Cần ưu tiên: {string.Join(", ", weakestCriteria.Select(GetCriteriaDisplayName))}. "
                + BuildPartImprovementSummary(partGroup.Key, weakestCriteria));
        }

        return string.Join(Environment.NewLine + Environment.NewLine, lines);
    }

    public static bool IsNoResponseResult(AiScoreResponse result)
    {
        var rubrics = result.Rubrics ?? [];
        return result.OverallBand <= 1.0
            && rubrics.Count >= Criteria.Count
            && rubrics.All(rubric => rubric.Band <= 1.0)
            && (
                ContainsNoResponseSignal(result.OverallFeedback)
                || rubrics.Any(rubric => ContainsNoResponseSignal(rubric.Comment))
            );
    }

    private static Dictionary<string, double> BuildCriterionAverageMap(IEnumerable<AiScoreResponse> results)
    {
        var rubricList = results
            .SelectMany(result => result.Rubrics ?? [])
            .ToList();

        return Criteria.ToDictionary(
            criteria => criteria,
            criteria => rubricList
                .Where(rubric => criteria.Equals(rubric.Criteria, StringComparison.OrdinalIgnoreCase))
                .Select(rubric => IeltsScoringCalculator.ClampBand(rubric.Band))
                .DefaultIfEmpty(0)
                .Average(),
            StringComparer.OrdinalIgnoreCase);
    }

    private static bool ContainsNoResponseSignal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var normalized = value.ToLowerInvariant();
        return normalized.Contains("no response", StringComparison.Ordinal)
            || normalized.Contains("không có câu trả lời", StringComparison.Ordinal)
            || normalized.Contains("không có lời nói", StringComparison.Ordinal)
            || normalized.Contains("không có đủ", StringComparison.Ordinal);
    }

    private static string FormatPartLabel(int partNumber) =>
        partNumber > 0 ? $"Part {partNumber}" : "Speaking";

    private static string GetCriteriaDisplayName(string criteria) => criteria switch
    {
        "Fluency and Coherence" => "độ trôi chảy và mạch lạc",
        "Lexical Resource" => "từ vựng",
        "Grammatical Range and Accuracy" => "ngữ pháp",
        "Pronunciation" => "phát âm",
        _ => criteria
    };

    private static string BuildPartImprovementSummary(int partNumber, IReadOnlyList<string> weakestCriteria)
    {
        var advice = new List<string>();

        var partAdvice = partNumber switch
        {
            1 => "Ở Part 1, nên trả lời trực tiếp rồi mở rộng thêm 1-2 câu thay vì dừng quá sớm.",
            2 => "Ở Part 2, nên giữ mạch mở ý -> ví dụ -> kết ý để nói trọn long turn ổn định hơn.",
            3 => "Ở Part 3, nên nêu quan điểm rõ rồi giải thích nguyên nhân, hệ quả hoặc so sánh sâu hơn.",
            _ => "Nên giữ câu trả lời đủ ý và có mạch phát triển rõ ràng.",
        };
        advice.Add(partAdvice);

        foreach (var criteria in weakestCriteria)
        {
            var criteriaAdvice = criteria switch
            {
                "Fluency and Coherence" => "Ưu tiên giảm hesitation dài và nối ý bằng because, however, for example khi chuyển luận điểm.",
                "Lexical Resource" => "Ưu tiên paraphrase và dùng collocation tự nhiên hơn để tránh lặp lại cùng một từ khóa.",
                "Grammatical Range and Accuracy" => "Ưu tiên đa dạng cấu trúc câu và kiểm soát lỗi chia thì, chủ-vị, mệnh đề phụ.",
                "Pronunciation" => "Ưu tiên nhấn trọng âm từ khóa, chia cụm ý rõ và tránh nuốt âm cuối.",
                _ => null,
            };

            if (!string.IsNullOrWhiteSpace(criteriaAdvice) && !advice.Contains(criteriaAdvice, StringComparer.Ordinal))
            {
                advice.Add(criteriaAdvice);
            }
        }

        return string.Join(" ", advice);
    }
}
