using System.Text.Json.Serialization;

namespace EnglishLearningApp.Application.Exams.DTOs;

public class AiGeneratedQuestionDto
{
    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;

    [JsonPropertyName("options")]
    public string Options { get; set; } = string.Empty;

    [JsonPropertyName("correctAnswer")]
    public string CorrectAnswer { get; set; } = string.Empty;

    [JsonPropertyName("explanation")]
    public string Explanation { get; set; } = string.Empty;

    [JsonPropertyName("points")]
    public int Points { get; set; } = 1;
}

public class AiGeneratedExamResponseDto
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("questions")]
    public List<AiGeneratedQuestionDto> Questions { get; set; } = [];
}
