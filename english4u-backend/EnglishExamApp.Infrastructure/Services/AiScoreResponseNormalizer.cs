using EnglishExamApp.Application.Utilities;

namespace EnglishExamApp.Infrastructure.Services;

internal static class AiScoreResponseNormalizer
{
    private static readonly string[] WritingCriteria =
    [
        "Task Achievement/Response",
        "Coherence and Cohesion",
        "Lexical Resource",
        "Grammatical Range and Accuracy"
    ];

    public static AiScoreResponse NormalizeWriting(Guid sessionId, Guid answerId, AiScoreResponse result)
    {
        var rubrics = (result.Rubrics ?? [])
            .Where(rubric => !string.IsNullOrWhiteSpace(rubric.Criteria))
            .Select(rubric => rubric with { Band = IeltsScoringCalculator.RoundBand(rubric.Band) })
            .ToList();

        foreach (var criteria in WritingCriteria)
        {
            if (rubrics.Any(rubric => rubric.Criteria.Equals(criteria, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            rubrics.Add(new AiRubricScore(criteria, 0, "AI không trả rubric này.", "Cần chấm lại để có nhận xét đầy đủ."));
        }

        var overallBand = rubrics.Count > 0
            ? IeltsScoringCalculator.RoundBand(rubrics.Average(rubric => rubric.Band))
            : IeltsScoringCalculator.RoundBand(result.OverallBand);

        return result with
        {
            SessionId = string.IsNullOrWhiteSpace(result.SessionId) ? sessionId.ToString() : result.SessionId,
            AnswerId = string.IsNullOrWhiteSpace(result.AnswerId) ? answerId.ToString() : result.AnswerId,
            OverallBand = overallBand,
            Rubrics = rubrics
        };
    }

    public static AiScoreResponse NormalizeSpeaking(Guid sessionId, Guid answerId, AiScoreResponse result)
    {
        var rubricLookup = (result.Rubrics ?? [])
            .Where(rubric => !string.IsNullOrWhiteSpace(rubric.Criteria))
            .GroupBy(rubric => rubric.Criteria.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(rubric => rubric with { Band = IeltsScoringCalculator.RoundBand(rubric.Band) })
                    .First(),
                StringComparer.OrdinalIgnoreCase);

        var rubrics = new List<AiRubricScore>(SpeakingScoreSummaryBuilder.Criteria.Count);
        foreach (var criteria in SpeakingScoreSummaryBuilder.Criteria)
        {
            if (rubricLookup.TryGetValue(criteria, out var rubric))
            {
                rubrics.Add(rubric with { Criteria = criteria });
                continue;
            }

            rubrics.Add(new AiRubricScore(
                criteria,
                0,
                "AI chưa trả về nhận xét cho tiêu chí này.",
                "Cần chấm lại để có nhận xét đầy đủ hơn."));
        }

        var overallBand = rubrics.Count > 0
            ? IeltsScoringCalculator.RoundBand(rubrics.Average(rubric => rubric.Band))
            : IeltsScoringCalculator.RoundBand(result.OverallBand);

        return result with
        {
            SessionId = string.IsNullOrWhiteSpace(result.SessionId) ? sessionId.ToString() : result.SessionId,
            AnswerId = string.IsNullOrWhiteSpace(result.AnswerId) ? answerId.ToString() : result.AnswerId,
            OverallBand = overallBand,
            Rubrics = rubrics
        };
    }
}
