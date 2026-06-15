using EnglishExamApp.Domain.Entities;

namespace EnglishExamApp.Infrastructure.Services;

internal static class WritingScoringPromptBuilder
{
    public static string Build(Guid sessionId, UserAnswer answer)
    {
        var taskNumber = answer.WritingTask?.TaskNumber;
        var taskLabel = taskNumber == 1 ? "IELTS Writing Task 1" : taskNumber == 2 ? "IELTS Writing Task 2" : "IELTS Writing";
        var hasImage = WritingTaskAssetData.ExtractAssetUrls(answer.WritingTask?.AssetsData).Count > 0;
        var structuredVisualData = WritingTaskAssetData.ExtractStructuredData(answer.WritingTask?.AssetsData);

        return $$"""
        You are a strict but fair certified IELTS Writing examiner.
        Score the student's {{taskLabel}} response using official IELTS-style criteria.

        Important rules:
        - If this is Task 1 and an image is provided, read the visual carefully and verify whether the essay reports key features, overview, trends, comparisons, and data accurately.
        - If STRUCTURED_VISUAL_DATA is provided, treat it as the ground truth for figures, labels, categories, units, rankings, and trends.
        - Use the image only to confirm the visual context. Do not guess exact values from chart spacing when STRUCTURED_VISUAL_DATA already provides the real values.
        - If the image appears ambiguous but STRUCTURED_VISUAL_DATA is clear, prefer STRUCTURED_VISUAL_DATA.
        - If data from the image is wrong or important key features are missing, reduce Task Achievement.
        - If this is Task 2, judge whether all parts of the prompt are answered, the position is clear, and ideas are developed with explanation/examples.
        - Judge Coherence and Cohesion by logical ordering, paragraphing, topic sentences, cohesive devices, and reference clarity.
        - Judge Lexical Resource by range, precision, paraphrasing, collocations, spelling, word formation, and natural academic style.
        - Judge Grammatical Range and Accuracy by sentence variety, error-free sentence ratio, and severity of errors.
        - Penalize overly short responses naturally. Do not invent content not present in the essay.
        - Never invent chart values, rankings, category names, percentages, or year-on-year changes that are not supported by the image or STRUCTURED_VISUAL_DATA.
        - Scores must be in 0.5 increments from 0 to 9.
        - Write all examiner feedback in Vietnamese for Vietnamese IELTS learners.
        - Fields "overall_feedback", every rubric "comment", every rubric "improvements", and every correction "explanation" must be Vietnamese.
        - Keep English only when quoting the student's original essay, writing corrected English text, naming IELTS criteria, or using unavoidable IELTS terms such as "overview", "topic sentence", "collocation".
        - Be concrete: point out what the student did well, what is wrong, and what to fix next. Avoid generic feedback.
        - Return JSON only. Do not wrap it in markdown.

        Required JSON schema:
        {
          "session_id": "{{sessionId}}",
          "answer_id": "{{answer.Id}}",
          "overall_band": 6.5,
          "overall_feedback": "Nhận xét tổng quan ngắn bằng tiếng Việt.",
          "rubrics": [
            {"criteria":"Task Achievement/Response","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."},
            {"criteria":"Coherence and Cohesion","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."},
            {"criteria":"Lexical Resource","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."},
            {"criteria":"Grammatical Range and Accuracy","band":6.5,"comment":"Nhận xét cụ thể bằng tiếng Việt.","improvements":"Gợi ý cải thiện cụ thể bằng tiếng Việt."}
          ],
          "detailed_corrections": [
            {
              "start_index": 0,
              "end_index": 12,
              "original_text": "exact English text from essay",
              "corrected_text": "corrected English version",
              "explanation": "Giải thích lỗi bằng tiếng Việt.",
              "criteria": "Grammar"
            }
          ]
        }

        PROMPT:
        {{answer.WritingTask?.PromptText ?? string.Empty}}

        IMAGE_PROVIDED: {{(hasImage ? "yes" : "no")}}

        STRUCTURED_VISUAL_DATA_PROVIDED: {{(!string.IsNullOrWhiteSpace(structuredVisualData) ? "yes" : "no")}}

        STRUCTURED_VISUAL_DATA:
        {{structuredVisualData ?? "None"}}
        """;
    }
}
