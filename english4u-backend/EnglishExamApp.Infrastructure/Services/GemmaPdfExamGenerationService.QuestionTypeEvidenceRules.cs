using System.Linq;
using System.Text.RegularExpressions;
using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService
{
    private static string ReconcileQuestionTypeByEvidence(
        string mappedQuestionType,
        string? instruction,
        string? questionText,
        List<string> options,
        string? answerText)
    {
        var evidenceText = JoinEvidenceText(instruction, questionText);

        var isTimeline = evidenceText.Contains("timeline", StringComparison.OrdinalIgnoreCase) ||
                         Regex.IsMatch(evidenceText, @"(?im)^\s*(?:\d{3,4}s?|Today|Recently|Currently|Nowadays|Originally|Historically)\b") ||
                         Regex.IsMatch(evidenceText, @"(?i)\b(?:in|by|during|since|from|until)\s+\d{3,4}s?\b") ||
                         Regex.IsMatch(evidenceText, @"(?i)\b(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first)\s+century\b");
        if (isTimeline)
        {
            if (mappedQuestionType is "FLOWCHART_COMPLETION" or "MAP_LABELLING")
            {
                mappedQuestionType = "SENTENCE_COMPLETION";
            }
        }

        if (mappedQuestionType is "FLOWCHART_COMPLETION" or "MAP_LABELLING")
        {
            var hasLetterOptions = IsPurelyLetterOptions(options);
            var hasLetterAnswers = IsPurelyLetterAnswers(answerText);
            if (options.Count > 0 && !hasLetterOptions)
            {
                mappedQuestionType = "FLOWCHART_COMPLETION";
            }
            else if (hasLetterOptions || hasLetterAnswers)
            {
                mappedQuestionType = "MAP_LABELLING";
            }
            else
            {
                mappedQuestionType = "FLOWCHART_COMPLETION";
            }
        }

        if (LooksLikeMapOrPlanLabellingInstruction(evidenceText) &&
            mappedQuestionType is not "FLOWCHART_COMPLETION")
        {
            return "MAP_LABELLING";
        }

        if (LooksLikeDiagramOrFlowchartCompletionInstruction(evidenceText))
        {
            var isStrictFlowchartKeyword = Regex.IsMatch(evidenceText, @"(?i)\bflow[\s-]?chart\b|\bprocess\s+(?:chart|diagram)\b");
            var aiClassifiedAsText = mappedQuestionType is "SENTENCE_COMPLETION" or "SUMMARY_COMPLETION" or "FillInBlanks";
            if (!(aiClassifiedAsText && !isStrictFlowchartKeyword))
            {
                return "FLOWCHART_COMPLETION";
            }
        }

        if (LooksLikeMatchingSentenceEndingsInstruction(evidenceText, options))
        {
            return "MATCHING_FEATURES";
        }

        if (LooksLikeTableCompletionInstruction(evidenceText))
        {
            if (HasSharedCompletionOptionBank(instruction, options))
            {
                return "MATCHING_TABLE";
            }
            return "TABLE_COMPLETION";
        }

        if (ContainsTfngInstruction(evidenceText))
        {
            return "TFNG";
        }

        if (ContainsYnngInstruction(evidenceText))
        {
            return "YNNG";
        }

        if (ChooseNStatementsInstructionRegex().IsMatch(evidenceText))
        {
            return "MCQ_CHOOSE_N";
        }

        if (LooksLikeChooseNLettersInstruction(evidenceText) &&
            string.Equals(mappedQuestionType, "MCQ_CHOOSE_N", StringComparison.Ordinal))
        {
            return "MCQ_CHOOSE_N";
        }

        if (HasExplicitMatchingTaskInstruction(evidenceText))
        {
            if (MatchingHeadingsInstructionRegex().IsMatch(evidenceText))
            {
                return "MATCHING_HEADINGS";
            }

            if (Regex.IsMatch(evidenceText, @"(?i)\b(classify|match\s+each|match\s+the|match\s+one)\b"))
            {
                return "MATCHING_FEATURES";
            }

            return "MATCHING_INFO";
        }



        if (IsMatchingType(mappedQuestionType) && HasMeaningfulChoiceOptions(options))
        {
            return mappedQuestionType;
        }

        if (LooksLikeCompletionInstruction(evidenceText) || FillInBlankInstructionRegex().IsMatch(evidenceText))
        {
            if (mappedQuestionType is "TFNG" or "YNNG" or "SHORT_ANSWER" || IsMcqType(mappedQuestionType) || IsMatchingType(mappedQuestionType))
            {
                return mappedQuestionType;
            }

            if (HasSharedCompletionOptionBank(instruction, options))
            {
                return "SUMMARY_COMPLETION";
            }

            if (mappedQuestionType is "FLOWCHART_COMPLETION" or "TABLE_COMPLETION" or "MATCHING_TABLE" or "MAP_LABELLING" or "SUMMARY_COMPLETION")
            {
                if (mappedQuestionType == "TABLE_COMPLETION" && HasSharedCompletionOptionBank(instruction, options))
                {
                    return "MATCHING_TABLE";
                }
                if (mappedQuestionType == "SUMMARY_COMPLETION")
                {
                    return "SENTENCE_COMPLETION";
                }
                return mappedQuestionType;
            }

            return "SENTENCE_COMPLETION";
        }

        if (LooksLikeMcqChoiceQuestion(evidenceText, options, answerText) ||
            HasExplicitMcqInstruction(evidenceText) && HasMeaningfulChoiceOptions(options))
        {
            return HasMultipleLetterAnswerTokens(answerText) ? "MCQ_MULTIPLE" : "MCQ_SINGLE";
        }

        if (IsMcqType(mappedQuestionType) && !LooksLikeMcqChoiceSet(options))
        {
            return string.IsNullOrWhiteSpace(questionText) ? "SENTENCE_COMPLETION" : mappedQuestionType;
        }

        if (mappedQuestionType is "MATCHING_INFO" or "MATCHING_FEATURES" &&
            LooksLikeMcqChoiceSet(options))
        {
            return HasMultipleLetterAnswerTokens(answerText) ? "MCQ_MULTIPLE" : "MCQ_SINGLE";
        }

        return mappedQuestionType;
    }

    private static string ReconcileGroupTypeByEvidence(
        string groupType,
        string? instruction,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        var options = questions
            .SelectMany(question => question.Options)
            .Select(option => option.OptionText)
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var questionText = string.Join("\n", questions.Select(question => question.Content));
        var answerText = string.Join(" ", questions.Select(question => question.CorrectAnswer));

        if (questions.Count > 1 &&
            LooksLikeChooseNLettersInstruction(instruction) &&
            (groupType is "MCQ_MULTIPLE" or "MCQ_CHOOSE_N"))
        {
            return "MCQ_CHOOSE_N";
        }

        if (IsMcqChoiceGroup(questions))
        {
            return questions.Any(q => HasMultipleLetterAnswerTokens(q.CorrectAnswer)) ? "MCQ_MULTIPLE" : "MCQ_SINGLE";
        }

        var finalType = ReconcileQuestionTypeByEvidence(groupType, instruction, questionText, options, answerText);
        if (finalType == "MCQ_SINGLE" && questions.Any(q => HasMultipleLetterAnswerTokens(q.CorrectAnswer)))
        {
            return "MCQ_MULTIPLE";
        }
        return finalType;
    }

    private static void ValidateQuestionTypeEvidence(
        string groupLabel,
        string mappedType,
        string? instruction,
        IReadOnlyList<CreateQuestionDto> questions,
        List<string> issues)
    {
        var evidenceText = JoinEvidenceText(instruction, string.Join("\n", questions.Select(question => question.Content)));
        var allOptions = questions
            .SelectMany(question => question.Options)
            .Select(option => option.OptionText)
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .ToList();

        if (mappedType is "MATCHING_INFO" or "MATCHING_FEATURES" &&
            (LooksLikeMcqChoiceSet(allOptions) || HasExplicitMcqInstruction(evidenceText) && HasMeaningfulChoiceOptions(allOptions)) &&
            !HasExplicitMatchingTaskInstruction(evidenceText))
        {
            issues.Add($"{groupLabel} is mapped as {mappedType} but evidence looks like MCQ choices.");
        }

        if (IsMcqType(mappedType) &&
            HasExplicitMatchingTaskInstruction(evidenceText) &&
            !HasExplicitMcqInstruction(evidenceText))
        {
            issues.Add($"{groupLabel} is mapped as {mappedType} but instruction looks like a matching task.");
        }

        if (mappedType is "SENTENCE_COMPLETION" or "SUMMARY_COMPLETION" &&
            LooksLikeMcqChoiceSet(allOptions) &&
            !LooksLikeCompletionInstruction(evidenceText))
        {
            issues.Add($"{groupLabel} is mapped as completion but evidence looks like MCQ choices.");
        }
    }

    private static string JoinEvidenceText(string? instruction, string? questionText) =>
        string.Join(
            "\n",
            new[] { instruction, questionText }
                .Where(value => !string.IsNullOrWhiteSpace(value)));

    private static bool LooksLikeMapOrPlanLabellingInstruction(string evidenceText)
    {
        if (string.IsNullOrWhiteSpace(evidenceText))
        {
            return false;
        }

        return Regex.IsMatch(
            evidenceText,
            @"(?i)\b(?:label|complete)\s+the\s+(?:map|plan|layout)\b|\b(?:map|plan|layout)\s+below\b");
    }

    private static bool LooksLikeDiagramOrFlowchartCompletionInstruction(string evidenceText)
    {
        if (string.IsNullOrWhiteSpace(evidenceText))
        {
            return false;
        }

        if (evidenceText.Contains("timeline", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return Regex.IsMatch(
            evidenceText,
            @"(?i)\bflow[\s-]?chart\b|\bprocess\s+(?:chart|diagram)\b");
    }

    private static bool LooksLikeTableCompletionInstruction(string evidenceText)
    {
        if (string.IsNullOrWhiteSpace(evidenceText))
        {
            return false;
        }

        var hasTableKeywords = Regex.IsMatch(
            evidenceText,
            @"(?i)\bcomplete\s+the\s+table\b|\btable\s+below\b|\btable\s+completion\b");

        var hasTableHeadersMarker = Regex.IsMatch(
            evidenceText,
            @"(?i)\[table\s+headers\s*:");

        if (hasTableHeadersMarker && !hasTableKeywords)
        {
            if (Regex.IsMatch(evidenceText, @"(?i)\b(match|classify)\b"))
            {
                return false;
            }
            if (Regex.IsMatch(evidenceText, @"(?i)\bcomplete\s+each\s+sentence\b|\bcomplete\s+the\s+following\s+sentences\b|\bcomplete\s+the\s+sentences\b|\bcomplete\s+each\s+of\s+the\s+following\s+sentences\b|\bsentence\s+endings?\b"))
            {
                return false;
            }
        }

        return hasTableKeywords || hasTableHeadersMarker;
    }

    private static bool HasExplicitMcqInstruction(string evidenceText)
    {
        if (string.IsNullOrWhiteSpace(evidenceText))
        {
            return false;
        }

        return ContainsMcqSingleInstruction(evidenceText) ||
               ContainsMcqMultipleInstruction(evidenceText) ||
               Regex.IsMatch(
                   evidenceText,
                   @"(?i)\bchoose\s+the\s+correct\s+letter\b|\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b");
    }

    private static bool LooksLikeChooseNLettersInstruction(string? evidenceText)
    {
        if (string.IsNullOrWhiteSpace(evidenceText))
        {
            return false;
        }

        return Regex.IsMatch(
            evidenceText,
            @"(?i)\bchoose\s+(?:two|three|four|five|six|2|3|4|5|6)\s+(?:letters?|statements?|answers?|claims?|reasons?|paragraphs?|options?)\b") ||
               Regex.IsMatch(
            evidenceText,
            @"(?i)\bwhich\s+(?:two|three|four|five|six|2|3|4|5|6)\b");
    }

    private static bool LooksLikeMatchingSentenceEndingsInstruction(string? evidenceText, IReadOnlyList<string> options)
    {
        if (string.IsNullOrWhiteSpace(evidenceText) || !HasMeaningfulChoiceOptions(options))
        {
            return false;
        }

        return Regex.IsMatch(
            evidenceText,
            @"(?i)\bcomplete\s+each\s+sentence\s+with\s+the\s+correct\s+ending\b|\bcorrect\s+endings?\s*,?\s*[A-Z]\s*[-–—]\s*[A-Z]\b|\bsentence\s+endings?\b|\bchoose\s+\w+\s+phrase\b.*\bcomplete\s+each\s+(?:of\s+the\s+following\s+)?sentences?\b");
    }

    private static bool HasMeaningfulChoiceOptions(IReadOnlyList<string> options)
    {
        if (options.Count is < 2 or > 8)
        {
            return false;
        }

        return options.Count(option =>
        {
            var normalized = Regex.Replace(option ?? string.Empty, @"\s+", " ").Trim();
            return normalized.Length >= 2 && !IsOptionLabelOnly(normalized);
        }) >= 2;
    }

    private static bool IsPurelyLetterOptions(IReadOnlyList<string> options)
    {
        if (options == null || options.Count == 0)
        {
            return false;
        }
        return options.All(option =>
        {
            if (string.IsNullOrWhiteSpace(option))
            {
                return false;
            }
            var trimmed = option.Trim();
            return Regex.IsMatch(trimmed, @"^[A-Z](?:\s*[\.\-]\s*)?$");
        });
    }

    private static bool IsPurelyLetterAnswers(string? answerText)
    {
        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }
        var tokens = Regex.Split(answerText, @"\s+");
        var validTokens = tokens.Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
        if (validTokens.Count == 0)
        {
            return false;
        }
        return validTokens.All(t => Regex.IsMatch(t.Trim(), @"^[A-Z]$"));
    }

    private static bool IsMcqChoiceGroup(IReadOnlyList<CreateQuestionDto> questions)
    {
        if (questions.Count == 0)
        {
            return false;
        }

        if (questions.Count > 1)
        {
            var firstOpts = questions[0].Options.Select(o => o.OptionText?.Trim()).Where(t => !string.IsNullOrEmpty(t)).OrderBy(t => t).ToList();
            var secondOpts = questions[1].Options.Select(o => o.OptionText?.Trim()).Where(t => !string.IsNullOrEmpty(t)).OrderBy(t => t).ToList();
            if (firstOpts.Count > 0 && firstOpts.SequenceEqual(secondOpts, StringComparer.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        return questions.Any(q =>
        {
            var opts = q.Options.Select(o => o.OptionText).Where(o => !string.IsNullOrWhiteSpace(o)).ToList();
            if (LooksLikeMcqChoiceSet(opts))
            {
                return true;
            }

            if (q.Options.Count >= 2 && q.Options.Count <= 5 && !string.IsNullOrWhiteSpace(q.CorrectAnswer))
            {
                var ans = q.CorrectAnswer.Trim().ToUpperInvariant();
                if (ans.Length == 1 && ans[0] >= 'A' && ans[0] < 'A' + q.Options.Count)
                {
                    return true;
                }
            }

            return false;
        });
    }
}
