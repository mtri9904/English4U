namespace EnglishExamApp.Infrastructure.Services;

internal static class NoResponseSpeakingScoreFactory
{
    public static AiScoreResponse Create(
        Guid sessionId,
        Guid answerId,
        double? durationSeconds,
        string? technicalReason = null)
    {
        var hasTechnicalReason = !string.IsNullOrWhiteSpace(technicalReason);
        var safeTechnicalReason = hasTechnicalReason
            ? Shorten(technicalReason!, 280)
            : null;
        var durationText = durationSeconds.HasValue && durationSeconds.Value > 0
            ? $" Bản ghi dài khoảng {durationSeconds.Value:0.#} giây nhưng không có câu trả lời nói đủ rõ."
            : " Prompt này không có bản ghi câu trả lời.";
        var technicalText = hasTechnicalReason
            ? $" Audio/transcript của prompt này không tạo được đủ bằng chứng pronunciation strict. Chi tiết kỹ thuật: {safeTechnicalReason}"
            : string.Empty;
        var evidence = new List<string>
        {
            "no_response=true",
            durationSeconds.HasValue ? $"duration_seconds={durationSeconds.Value:0.#}" : "duration_seconds=n/a",
            hasTechnicalReason ? "audio_quality=technical_scoring_failed" : "audio_quality=no_audio"
        };
        if (hasTechnicalReason)
        {
            evidence.Add("technical_failure=true");
            evidence.Add($"technical_reason={safeTechnicalReason}");
        }

        return new AiScoreResponse(
            sessionId.ToString(),
            answerId.ToString(),
            1.0,
            [
                new AiRubricScore(
                    "Fluency and Coherence",
                    1.0,
                    $"Không có câu trả lời nói có thể đánh giá về độ trôi chảy hoặc mạch lạc.{durationText}{technicalText}",
                    "Khi bí ý, hãy nói tối thiểu 1-2 câu trực tiếp về việc bạn chưa chắc, rồi đưa một ví dụ hoặc lý do đơn giản.",
                    0.9,
                    evidence),
                new AiRubricScore(
                    "Lexical Resource",
                    1.0,
                    "Không có đủ từ vựng được nói ra để thể hiện khả năng diễn đạt.",
                    "Chuẩn bị một vài cụm mở đầu an toàn như I am not very familiar with this topic, but I think... để vẫn tạo được câu trả lời.",
                    0.9,
                    evidence),
                new AiRubricScore(
                    "Grammatical Range and Accuracy",
                    1.0,
                    "Không có ngôn ngữ đủ dài để đánh giá cấu trúc câu hoặc độ chính xác ngữ pháp.",
                    "Ưu tiên tạo câu đơn hoàn chỉnh với chủ ngữ và động từ trước, sau đó thêm because hoặc for example để mở rộng.",
                    0.9,
                    evidence),
                new AiRubricScore(
                    "Pronunciation",
                    1.0,
                    "Không có lời nói đủ rõ để đánh giá phát âm ở mức câu trả lời.",
                    "Nói rõ từng từ khóa và giữ âm lượng ổn định; nếu chưa nghĩ ra ý, vẫn nên nói một câu ngắn thay vì im lặng.",
                    0.9,
                    evidence)
            ],
            "Câu trả lời được chấm như no response. Việc không trả lời làm giảm điểm vì không có đủ bằng chứng ngôn ngữ để chấm các tiêu chí Speaking."
            + technicalText);
    }

    private static string Shorten(string value, int maxLength)
    {
        var trimmed = value.Trim().Replace(Environment.NewLine, " ");
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength].TrimEnd() + "...";
    }
}
