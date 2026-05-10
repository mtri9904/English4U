namespace EnglishExamApp.Infrastructure.Services;

internal static class WritingFeedbackLanguageDetector
{
    public static bool NeedsVietnameseNormalization(AiScoreResponse result)
    {
        var feedbackTexts = new List<string?>();
        feedbackTexts.Add(result.OverallFeedback);
        feedbackTexts.AddRange((result.Rubrics ?? []).SelectMany(rubric => new[] { rubric.Comment, rubric.Improvements }));
        feedbackTexts.AddRange((result.DetailedCorrections ?? []).Select(correction => correction.Explanation));

        return feedbackTexts
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Any(IsLikelyEnglishFeedback);
    }

    private static bool IsLikelyEnglishFeedback(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length < 24)
        {
            return false;
        }

        var lower = $" {value.ToLowerInvariant()} ";
        if (ContainsVietnameseSignal(lower))
        {
            return false;
        }

        var englishSignals = new[]
        {
            " the ",
            " and ",
            " response ",
            " essay ",
            " provides ",
            " demonstrates ",
            " however ",
            " ensure ",
            " improve ",
            " improvement ",
            " paragraph ",
            " vocabulary ",
            " grammar ",
            " accurate ",
            " inaccuracies ",
            " cohesive ",
            " sentence ",
            " task ",
            " graph "
        };

        return englishSignals.Count(signal => lower.Contains(signal, StringComparison.Ordinal)) >= 2;
    }

    private static bool ContainsVietnameseSignal(string lowerValue)
    {
        const string vietnameseMarks = "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ";
        if (lowerValue.Any(vietnameseMarks.Contains))
        {
            return true;
        }

        var vietnameseWords = new[]
        {
            " bài ",
            " của ",
            " và ",
            " là ",
            " có ",
            " cần ",
            " nên ",
            " tuy nhiên ",
            " cải thiện ",
            " luận điểm ",
            " ngữ pháp ",
            " từ vựng ",
            " đoạn văn ",
            " người đọc "
        };

        return vietnameseWords.Any(word => lowerValue.Contains(word, StringComparison.Ordinal));
    }
}
