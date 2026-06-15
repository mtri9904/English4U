using System.Text.Json;

namespace EnglishExamApp.Infrastructure.Services;

internal static class WritingFeedbackTranslationRequestBuilder
{
    public static object Build(AiScoreResponse result, JsonSerializerOptions jsonOptions) =>
        new
        {
            contents = new[]
            {
                new
                {
                    role = "user",
                    parts = new object[]
                    {
                        new
                        {
                            text = $"""
                            Translate IELTS Writing examiner feedback fields to Vietnamese.
                            Return JSON only. Keep the same JSON schema and numeric values.

                            Hard rules:
                            - Translate only: overall_feedback, each rubrics.comment, each rubrics.improvements, each detailed_corrections.explanation.
                            - Do not translate or change: session_id, answer_id, overall_band, rubrics.criteria, rubrics.band, detailed_corrections.start_index, detailed_corrections.end_index, detailed_corrections.original_text, detailed_corrections.corrected_text, detailed_corrections.criteria.
                            - Keep IELTS criterion names in English.
                            - Vietnamese feedback must be natural, specific, and useful for a Vietnamese learner.
                            - Keep English only inside quoted original/corrected essay text or unavoidable IELTS terms.

                            JSON_TO_TRANSLATE:
                            {JsonSerializer.Serialize(result, jsonOptions)}
                            """
                        }
                    }
                }
            },
            generationConfig = new
            {
                temperature = 0.0d,
                responseMimeType = "application/json"
            }
        };
}
