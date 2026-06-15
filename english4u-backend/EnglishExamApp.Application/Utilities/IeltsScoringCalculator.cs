namespace EnglishExamApp.Application.Utilities;

public static class IeltsScoringCalculator
{
    private static readonly (int MinimumRawScore, double Band)[] ListeningBands =
    [
        (39, 9.0),
        (37, 8.5),
        (35, 8.0),
        (32, 7.5),
        (30, 7.0),
        (26, 6.5),
        (23, 6.0),
        (18, 5.5),
        (16, 5.0),
        (13, 4.5),
        (10, 4.0),
        (8, 3.5),
        (6, 3.0),
        (4, 2.5),
        (1, 2.0),
        (0, 0.0)
    ];

    private static readonly (int MinimumRawScore, double Band)[] AcademicReadingBands =
    [
        (39, 9.0),
        (37, 8.5),
        (35, 8.0),
        (33, 7.5),
        (30, 7.0),
        (27, 6.5),
        (23, 6.0),
        (19, 5.5),
        (15, 5.0),
        (13, 4.5),
        (10, 4.0),
        (8, 3.5),
        (6, 3.0),
        (4, 2.5),
        (1, 2.0),
        (0, 0.0)
    ];

    private static readonly (int MinimumRawScore, double Band)[] GeneralTrainingReadingBands =
    [
        (40, 9.0),
        (39, 8.5),
        (37, 8.0),
        (36, 7.5),
        (34, 7.0),
        (32, 6.5),
        (30, 6.0),
        (27, 5.5),
        (23, 5.0),
        (19, 4.5),
        (15, 4.0),
        (12, 3.5),
        (9, 3.0),
        (6, 2.5),
        (1, 2.0),
        (0, 0.0)
    ];

    public static double? CalculateListeningBand(double rawScore, double maxScore) =>
        CalculateObjectiveBand(rawScore, maxScore, ListeningBands);

    public static double? CalculateReadingBand(double rawScore, double maxScore, bool isGeneralTraining = false) =>
        CalculateObjectiveBand(
            rawScore,
            maxScore,
            isGeneralTraining ? GeneralTrainingReadingBands : AcademicReadingBands);

    public static double? CalculateOverallBand(params double?[] componentBands)
    {
        var availableBands = componentBands
            .Where(score => score.HasValue)
            .Select(score => ClampBand(score!.Value))
            .ToList();

        return availableBands.Count == 0
            ? null
            : RoundBand(availableBands.Average());
    }

    public static double RoundBand(double value) =>
        Math.Round(ClampBand(value) * 2, MidpointRounding.AwayFromZero) / 2;

    public static double ClampBand(double value) =>
        Math.Min(9, Math.Max(0, value));

    private static double? CalculateObjectiveBand(
        double rawScore,
        double maxScore,
        IReadOnlyList<(int MinimumRawScore, double Band)> bandTable)
    {
        if (maxScore <= 0)
        {
            return null;
        }

        var normalizedRawScore = NormalizeToFortyPointRawScore(rawScore, maxScore);
        foreach (var (minimumRawScore, band) in bandTable)
        {
            if (normalizedRawScore >= minimumRawScore)
            {
                return band;
            }
        }

        return 0;
    }

    private static int NormalizeToFortyPointRawScore(double rawScore, double maxScore)
    {
        var clampedRawScore = Math.Min(maxScore, Math.Max(0, rawScore));
        return (int)Math.Round((clampedRawScore / maxScore) * 40, MidpointRounding.AwayFromZero);
    }
}
