using EnglishExamApp.Domain.Entities;

namespace EnglishExamApp.Infrastructure.Services;

internal static class SpeakingPromptMetadata
{
    public static string GetPromptType(int partNumber, SpeakingQuestion? question)
    {
        if (partNumber == 2 && !string.IsNullOrWhiteSpace(question?.CueCardPoints))
        {
            return "part2_long_turn";
        }

        return partNumber switch
        {
            1 => "part1_short_answer",
            2 => "part2_follow_up",
            3 => "part3_discussion",
            _ => "unknown"
        };
    }

    public static int? GetTargetDurationSeconds(int partNumber, string promptType) =>
        promptType switch
        {
            "part2_long_turn" => 120,
            "part2_follow_up" => 35,
            "part1_short_answer" => 30,
            "part3_discussion" => 60,
            _ => partNumber switch
            {
                1 => 30,
                2 => 35,
                3 => 60,
                _ => null
            }
        };
}
