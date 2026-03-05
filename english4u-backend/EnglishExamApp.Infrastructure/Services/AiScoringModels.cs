using System.Text.Json.Serialization;

namespace EnglishExamApp.Infrastructure.Services;

public sealed record AiScoreWritingRequest(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("answer_id")] string AnswerId,
    [property: JsonPropertyName("essay_text")] string EssayText,
    [property: JsonPropertyName("question_prompt")] string? QuestionPrompt,
    [property: JsonPropertyName("skill_type")] string SkillType = "Writing");

public sealed record AiScoreSpeakingForm(
    string SessionId,
    string AnswerId,
    string? QuestionPrompt);

public sealed record AiScoreResponse(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("answer_id")] string AnswerId,
    [property: JsonPropertyName("overall_band")] double OverallBand,
    [property: JsonPropertyName("rubrics")] List<AiRubricScore> Rubrics);

public sealed record AiRubricScore(
    [property: JsonPropertyName("criteria")] string Criteria,
    [property: JsonPropertyName("band")] double Band,
    [property: JsonPropertyName("comment")] string Comment,
    [property: JsonPropertyName("improvements")] string Improvements);
