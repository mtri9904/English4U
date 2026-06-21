using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace EnglishExamApp.Infrastructure.Services;

internal sealed record ReadingQuestionGroupOutline(
    int StartQuestion,
    int EndQuestion,
    string BoundaryToken,
    string Tags,
    string? Instruction,
    string? GroupType);

internal static partial class ReadingQuestionGroupOutlineParser
{
    public static IReadOnlyList<ReadingQuestionGroupOutline> Extract(string? rawPassageText)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return [];
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var contentBoundaryIndex = FindContentBoundaryIndex(normalized);
        var markers = ExtractMarkers(normalized, contentBoundaryIndex);
        if (markers.Count == 0)
        {
            return [];
        }

        var result = new List<ReadingQuestionGroupOutline>(markers.Count);
        for (var index = 0; index < markers.Count; index++)
        {
            var marker = markers[index];
            var nextStartIndex = index < markers.Count - 1
                ? markers[index + 1].StartIndex
                : contentBoundaryIndex;
            var instruction = ExtractInstruction(normalized, marker, nextStartIndex);

            result.Add(new ReadingQuestionGroupOutline(
                StartQuestion: marker.StartQuestion,
                EndQuestion: marker.EndQuestion,
                BoundaryToken: $"RANGE:{marker.StartQuestion}-{marker.EndQuestion}",
                Tags: marker.Tags,
                Instruction: instruction,
                GroupType: DetectGroupType(instruction, marker.StartQuestion, marker.EndQuestion)));
        }

        return result;
    }

    private static int FindContentBoundaryIndex(string normalizedText)
    {
        var boundaryIndex = normalizedText.Length;

        var reviewHeadingMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        if (reviewHeadingMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, reviewHeadingMatch.Index);
        }

        var answerHeadingMatch = AnswerSectionHeadingRegex().Match(normalizedText);
        if (answerHeadingMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, answerHeadingMatch.Index);
        }

        var looseAnswerHeadingMatch = LooseAnswerSectionHeadingRegex().Match(normalizedText);
        if (looseAnswerHeadingMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, looseAnswerHeadingMatch.Index);
        }

        var inlineSolutionMatch = InlineSolutionHeadingRegex().Match(normalizedText);
        if (inlineSolutionMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, inlineSolutionMatch.Index);
        }

        return boundaryIndex;
    }

    private static List<QuestionGroupMarker> ExtractMarkers(string normalizedText, int maxStartIndex)
    {
        var markers = new List<QuestionGroupMarker>();

        foreach (Match match in LooseQuestionRangeBoundaryRegex().Matches(normalizedText))
        {
            if (!TryBuildRangeMarker(match, maxStartIndex, out var marker) ||
                IsIgnoredGlobalHeader(normalizedText, marker.StartIndex))
            {
                continue;
            }

            markers.Add(marker);
        }

        foreach (Match match in SingleQuestionBoundaryRegex().Matches(normalizedText))
        {
            if (!TryBuildSingleQuestionMarker(match, maxStartIndex, out var marker) ||
                IsIgnoredGlobalHeader(normalizedText, marker.StartIndex))
            {
                continue;
            }

            markers.Add(marker);
        }

        var orderedMarkers = markers
            .OrderBy(marker => marker.StartIndex)
            .GroupBy(marker => (marker.StartQuestion, marker.EndQuestion))
            .Select(group => group.OrderBy(marker => marker.StartIndex).First())
            .ToList();

        return RemoveLikelyGlobalIntroRange(orderedMarkers);
    }

    private static bool TryBuildRangeMarker(Match match, int maxStartIndex, out QuestionGroupMarker marker)
    {
        marker = default;
        if (!match.Success || match.Index < 0 || match.Index >= maxStartIndex)
        {
            return false;
        }

        var startQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value);
        if (startQuestion is < 1 or > 45)
        {
            return false;
        }

        if (!TryParseRangeEndQuestionNumber(match.Groups["end"].Value, startQuestion, out var endQuestion))
        {
            return false;
        }

        marker = new QuestionGroupMarker(
            StartQuestion: startQuestion,
            EndQuestion: endQuestion,
            StartIndex: match.Index,
            EndIndex: match.Index + match.Length,
            Tags: $"Questions {startQuestion}-{endQuestion}");
        return true;
    }

    private static bool TryBuildSingleQuestionMarker(Match match, int maxStartIndex, out QuestionGroupMarker marker)
    {
        marker = default;
        if (!match.Success || match.Index < 0 || match.Index >= maxStartIndex)
        {
            return false;
        }

        var questionNumber = ParseOcrQuestionNumber(match.Groups["number"].Value);
        if (questionNumber is < 1 or > 45)
        {
            return false;
        }

        marker = new QuestionGroupMarker(
            StartQuestion: questionNumber,
            EndQuestion: questionNumber,
            StartIndex: match.Index,
            EndIndex: match.Index + match.Length,
            Tags: $"Question {questionNumber}");
        return true;
    }

    private static bool TryParseRangeEndQuestionNumber(string rawEndToken, int startQuestion, out int endQuestion)
    {
        endQuestion = -1;
        var normalized = NormalizeOcrNumericToken(rawEndToken);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        for (var length = Math.Min(2, normalized.Length); length >= 1; length--)
        {
            if (!int.TryParse(normalized[..length], out var candidate))
            {
                continue;
            }

            if (candidate >= startQuestion && candidate <= 45)
            {
                endQuestion = candidate;
                return true;
            }
        }

        return false;
    }

    private static List<QuestionGroupMarker> RemoveLikelyGlobalIntroRange(List<QuestionGroupMarker> orderedMarkers)
    {
        if (orderedMarkers.Count < 2)
        {
            return orderedMarkers;
        }

        var first = orderedMarkers[0];
        var hasNestedExerciseRanges = orderedMarkers
            .Skip(1)
            .Any(marker =>
                marker.StartQuestion >= first.StartQuestion &&
                marker.EndQuestion <= first.EndQuestion);
        if (!hasNestedExerciseRanges)
        {
            return orderedMarkers;
        }

        var firstRangeWidth = first.EndQuestion - first.StartQuestion;
        return firstRangeWidth >= 9 || first.StartQuestion is 1 or 14 or 27
            ? orderedMarkers.Skip(1).ToList()
            : orderedMarkers;
    }

    private static bool IsIgnoredGlobalHeader(string normalizedText, int markerStartIndex)
    {
        if (string.IsNullOrWhiteSpace(normalizedText) || markerStartIndex < 0 || markerStartIndex >= normalizedText.Length)
        {
            return false;
        }

        var line = ExtractLineContainingIndex(normalizedText, markerStartIndex);
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var normalizedLine = Regex.Replace(line, @"\s+", " ").Trim();
        return PassageQuestionIntroLineRegex().IsMatch(normalizedLine) ||
               GlobalQuestionRangeHeaderRegex().IsMatch(normalizedLine);
    }

    private static string ExtractLineContainingIndex(string text, int index)
    {
        index = Math.Clamp(index, 0, text.Length - 1);
        var lineStart = text.LastIndexOf('\n', index);
        lineStart = lineStart < 0 ? 0 : lineStart + 1;
        var lineEnd = text.IndexOf('\n', index);
        lineEnd = lineEnd < 0 ? text.Length : lineEnd;
        return text[lineStart..lineEnd];
    }

    private static string? ExtractInstruction(string normalizedText, QuestionGroupMarker marker, int nextMarkerStartIndex)
    {
        if (nextMarkerStartIndex <= marker.EndIndex)
        {
            return null;
        }

        var snippet = normalizedText[marker.EndIndex..nextMarkerStartIndex];
        snippet = RemoveSelectionMarkers(snippet);
        snippet = RemoveInlineNoise(snippet);
        if (string.IsNullOrWhiteSpace(snippet))
        {
            return null;
        }

        var questionStartIndex = FindFirstQuestionStartIndex(snippet, marker.StartQuestion);
        var beforeQuestion = questionStartIndex >= 0
            ? snippet[..questionStartIndex].Trim()
            : TrimAtKnownInstructionEnd(snippet);
        beforeQuestion = TrimTrailingInstructionArtifacts(beforeQuestion);
        if (string.IsNullOrWhiteSpace(beforeQuestion))
        {
            return null;
        }

        var instructionBlock = ExtractInstructionBlock(beforeQuestion, marker.StartQuestion);
        instructionBlock = TrimTrailingInstructionArtifacts(instructionBlock);
        if (string.IsNullOrWhiteSpace(instructionBlock))
        {
            return null;
        }

        var normalizedInstruction = Regex.Replace(instructionBlock, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalizedInstruction) || normalizedInstruction.Length > 1000)
        {
            return null;
        }

        return normalizedInstruction;
    }

    private static string? ExtractInstructionBlock(string beforeQuestion, int currentQuestionNumber)
    {
        var normalized = TrimLeadingNoiseLines(RemoveInlineNoise(beforeQuestion));
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        normalized = TrimTrailingInstructionArtifacts(normalized);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var knownInstructionPrefix = TryExtractKnownInstructionPrefix(normalized);
        if (!string.IsNullOrWhiteSpace(knownInstructionPrefix))
        {
            return knownInstructionPrefix;
        }

        var previousQuestionBoundary = FindLastPreviousQuestionBoundaryIndex(normalized, currentQuestionNumber);
        if (previousQuestionBoundary < 0)
        {
            var firstAnchorIndex = FindFirstStrongInstructionAnchor(normalized, 0);
            if (firstAnchorIndex < 0)
            {
                return LooksLikeInstructionBlock(normalized)
                    ? TrimTrailingInstructionArtifacts(normalized)
                    : null;
            }

            return firstAnchorIndex == 0
                ? TrimTrailingInstructionArtifacts(normalized)
                : LooksLikeInstructionPreamble(normalized[..firstAnchorIndex])
                    ? TrimTrailingInstructionArtifacts(normalized)
                    : TrimTrailingInstructionArtifacts(normalized[firstAnchorIndex..]);
        }

        var anchorIndex = FindFirstStrongInstructionAnchor(normalized, previousQuestionBoundary);
        if (anchorIndex < 0)
        {
            return null;
        }

        return TrimTrailingInstructionArtifacts(normalized[anchorIndex..]);
    }

    private static string TrimAtKnownInstructionEnd(string snippet)
    {
        if (string.IsNullOrWhiteSpace(snippet))
        {
            return string.Empty;
        }

        var normalized = TrimLeadingNoiseLines(RemoveInlineNoise(snippet));
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        normalized = TrimTrailingInstructionArtifacts(normalized);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var knownInstructionPrefix = TryExtractKnownInstructionPrefix(normalized);
        if (!string.IsNullOrWhiteSpace(knownInstructionPrefix))
        {
            return knownInstructionPrefix;
        }

        var firstAnchorIndex = FindFirstStrongInstructionAnchor(normalized, 0);
        if (firstAnchorIndex < 0)
        {
            return TrimTrailingInstructionArtifacts(normalized);
        }

        var anchored = normalized[firstAnchorIndex..].Trim();
        anchored = TrimTrailingInstructionArtifacts(anchored);
        var clauses = SplitInstructionClauses(anchored);
        if (clauses.Count == 0)
        {
            return anchored;
        }

        var selectedClauses = new List<string>();
        for (var index = 0; index < clauses.Count; index++)
        {
            var clause = clauses[index];
            if (string.IsNullOrWhiteSpace(clause))
            {
                continue;
            }

            if (selectedClauses.Count == 0)
            {
                if (!LooksLikeInstructionClause(clause, true))
                {
                    continue;
                }

                selectedClauses.Add(clause);
                continue;
            }

            if (!LooksLikeInstructionClause(clause, false))
            {
                break;
            }

            selectedClauses.Add(clause);
        }

        return selectedClauses.Count == 0
            ? anchored
            : TrimTrailingInstructionArtifacts(string.Join(" ", selectedClauses));
    }

    private static int FindLastPreviousQuestionBoundaryIndex(string text, int currentQuestionNumber)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return -1;
        }

        var bestIndex = -1;
        foreach (Match match in QuestionContentStartRegex().Matches(text))
        {
            var number = ParseOcrQuestionNumber(match.Groups["number"].Value);
            if (number is < 1 or > 45 || number == currentQuestionNumber)
            {
                continue;
            }

            bestIndex = Math.Max(bestIndex, match.Index);
        }

        return bestIndex;
    }

    private static int FindFirstStrongInstructionAnchor(string text, int startIndex)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return -1;
        }

        startIndex = Math.Clamp(startIndex, 0, text.Length);
        var anchors = new[]
        {
            "answer the following questions using",
            "choose one word from the passage",
            "choose two words from the passage",
            "choose three words from the passage",
            "choose one word from the text",
            "choose two words from the text",
            "choose three words from the text",
            "using no more than",
            "complete the timeline diagram below",
            "complete the diagram below",
            "complete the following sentences using",
            "complete the description below",
            "complete the following using",
            "using one word only",
            "using one word",
            "using two words only",
            "using two words",
            "using three words only",
            "using three words",
            "re-order the following letters",
            "reorder the following letters",
            "choose the most suitable heading",
            "according to the information given in the text",
            "according to the information given in the passage",
            "choose the correct letter",
            "choose the correct answer or answers",
            "choose the correct answer or answers from the choices given",
            "choose the correct answer",
            "for each question, only one of the choices is correct",
            "choose one phrase from the list of phrases",
            "choose two phrases from the list of phrases",
            "choose three phrases from the list of phrases",
            "look at the following statements",
            "which of the following",
            "which one of the following",
            "which two of the following",
            "which three of the following",
            "which four of the following",
            "which five of the following",
            "complete each sentence with the correct ending",
            "complete each of the following sentences",
            "complete each sentence",
            "complete the summary below",
            "complete the table below",
            "complete the table",
            "complete the notes below",
            "complete the flow-chart below",
            "complete the sentences below",
            "complete the sentences",
            "fill in the blanks",
            "do the following statements",
            "do the following statements reflect",
            "from the information given in the passage",
            "classify the following as",
            "match each statement to the correct",
            "match one of the researchers",
            "match one of the",
            "match the following",
            "use the information in the text to match",
            "choose your answers from the box",
            "write the appropriate numbers",
            "write yes",
            "write no",
            "write not given"
        };

        var bestIndex = int.MaxValue;
        foreach (var anchor in anchors)
        {
            var index = text.IndexOf(anchor, startIndex, StringComparison.OrdinalIgnoreCase);
            if (index >= 0)
            {
                bestIndex = Math.Min(bestIndex, index);
            }
        }

        return bestIndex == int.MaxValue
            ? -1
            : bestIndex;
    }

    private static string? TryExtractKnownInstructionPrefix(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var normalized = Regex.Replace(text, @"\s+", " ").Trim();

        var patterns = new[]
        {
            @"^\s*(?<instruction>Answer\s+the\s+following\s+questions\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\.?)",
            @"^\s*(?<instruction>Using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\s*,?\s*complete\s+the\s+following\.?)",
            @"^\s*(?<instruction>Choose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+(?:timeline\s+)?diagram\s+below\.?\s+Write\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+each\s+(?:answer|gap)\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|description)\s+below\.?\s+Choose\s+your\s+answers?\s+from\s+the\s+box\s+below\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|description)\.?\s+Choose\s+your\s+answers?\s+from\s+the\s+box\s+below\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+summary\s+with\s+the\s+list\s+of\s+words\s*,?\s*[A-HI](?:\s*[-–]\s*[A-HI])?(?:\s+below)?\.?(?:\s+Write\s+the\s+correct\s+letter\s*,?\s*[A-HI](?:\s*[-–]\s*[A-HI])?\s*,?\s+in\s+(?:spaces|boxes)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+below\.?)?)",
            @"^\s*(?<instruction>Complete\s+the\s+table\s+below\.?\s+Choose\s+\d+\s+answers?\s+from\s+the\s+box\s+and\s+write\s+the\s+correct\s+letter\s*,?\s*[A-L](?:\s*[-–]\s*[A-L])?\s*,?\s+next\s+to\s+questions?\s+\d{1,2}\s*(?:-|–|—|‑|−|to)\s*\d{1,2}\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+description\s+below\.?\s+Choose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+following\s+sentences\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+following\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^\s*(?<instruction>Re-?order\s+the\s+following\s+letters?\s*\([A-H](?:\s*[-–]\s*[A-H])?\)\s+to\s+show\s+the\s+sequence\s+of\s+events(?:\s+according\s+to\s+the\s+passage)?\.?)",
            @"^\s*(?<instruction>Do\s+the\s+following\s+statements?\s+agree\s+with\s+the\s+information\s+given\s+in\s+(?:the\s+(?:text|passage)|Reading\s+Passage\s+\d+)\?\s+For\s+questions?\s+\d{1,2}\s*(?:-|–|—|‑|−|to)\s*\d{1,2}\s*,?\s*write\s+TRUE.+?FALSE.+?NOT\s+GIVEN.+?)$",
            @"^\s*(?<instruction>According\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\.?)",
            @"^\s*(?<instruction>According\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\s+from\s+the\s+choices\s+given\.?)",
            @"^\s*(?<instruction>For\s+each\s+question\s*,?\s*only\s+ONE\s+of\s+the\s+choices?\s+is\s+correct\.?\s+Write\s+the\s+corresponding\s+letter\s+in\s+the\s+appropriate\s+box(?:es)?\s+on\s+your\s+answer\s+sheet\.?)",
            @"^\s*(?<instruction>(?:Choose|Circle)\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\.?)",
            @"^\s*(?<instruction>(?:Choose|Circle)\s+the\s+correct\s+answer(?:\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?)?\.?)",
            @"^\s*(?<instruction>Choose\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*,\s*[A-H])*(?:\s+or\s+[A-H])?\.?)",
            @"^\s*(?<instruction>Choose\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])\.?)",
            @"^\s*(?<instruction>Choose\s+the\s+correct\s+answer(?:\s+or\s+answers?)?\.?)",
            @"^\s*(?<instruction>Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases\s+[A-H](?:\s*[-–]\s*[A-H])?\s+below\s+to\s+complete\s+each\s+of\s+the\s+following\s+sentences\.?(?:\s+There\s+are\s+more\s+phrases\s+than\s+questions\s+so\s+you\s+will\s+not\s+use\s+all\s+of\s+them\.?)?)",
            @"^\s*(?<instruction>Look\s+at\s+the\s+following\s+statements?.+?Match\s+each\s+statement\s+to\s+the\s+correct\s+(?:person|people|researcher|researchers|country|countries|category|categories|group|groups|option|options)\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?\.?(?:\s+You\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\.?)?)",
            @"^\s*(?<instruction>Which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following.+?\?\s*Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters?\s+[A-H](?:\s*[-–]\s*[A-H])?\.?)",
            @"^\s*(?<instruction>Complete\s+the\s+(?:table|summary|notes?|flow-?chart)(?:\s+(?:on|about|of)\s+[^.?!]{1,120})?\s+(?:using|with)\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\.?)",
            @"^\s*(?<instruction>Complete\s+(?:each\s+sentence|each\s+of\s+the\s+following\s+sentences?|the\s+following\s+sentences?)\s+with\s+the\s+correct\s+ending\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?\s*,?\s+below\.?(?:\s+Write\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*[-–]\s*[A-H])?\s*,?\s+in\s+the\s+spaces?\s+below\.?)?)",
            @"^\s*(?<instruction>Complete\s+the\s+summary\s+(?:with|using)\s+the\s+list\s+of\s+words\s+[A-HI](?:\s*[-–]\s*[A-HI])?\s+below\.?(?:\s+Write\s+the\s+correct\s+letter\s+[A-HI](?:\s*[-–]\s*[A-HI])?\s+in\s+(?:spaces|boxes)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+below\.?)?)",
            @"^\s*(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|sentences?)\s+below\.?(?:\s+Choose\s+[^.?!]+[.?!])?(?:\s+There\s+are\s+more[^.?!]+[.?!])?)",
            @"^\s*(?<instruction>Fill\s+in\s+the\s+blanks\s+with\s+NO\s+MORE\s+THAN\s+\w+(?:\s+\w+){0,4}\s+from\s+the\s+passage\.?)",
            @"^\s*(?<instruction>Do\s+the\s+following\s+statements?.+?(?:TRUE.+?FALSE.+?NOT\s+GIVEN|YES.+?NO.+?NOT\s+GIVEN).*)$",
            @"^\s*(?<instruction>Do\s+the\s+following\s+statements.+?(?:writer\s+thinks\s+about\s+this|passage\?)\.?(?:\s*Write\s*:?\s*YES.+?NOT\s+GIVEN.+?this\.?)?)",
            @"^\s*(?<instruction>From\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\s+characteristic\s+of\s*:?)",
            @"^\s*(?<instruction>Classify\s+the\s+following\s+as\s*:?\s*.+?)\b(?:(?:Question|Questions)\s+\d|\d{1,2}\s{2,}|Example\b)",
            @"^\s*(?<instruction>Match\s+ONE\s+of\s+the\s+.+?\s+to\s+each\s+of\s+the\s+statements?\s*\(.+?\)\s+below\.?)",
            @"^\s*(?<instruction>Use\s+the\s+information\s+in\s+the\s+text\s+to\s+match\s+.+?\s+with\s+.+?\b(?:listed\s+below|below)\.?)",
            @"^\s*(?<instruction>Use\s+the\s+information\s+in\s+the\s+text\s+to\s+match\s+.+?\.)",
            @"^\s*(?<instruction>The\s+passage\s+has\s+\d+\s+sections?\s+[A-Z](?:-[A-Z])?\.?\s+Choose\s+the\s+most\s+suitable\s+heading.+?all\.?)"
        };

        foreach (var pattern in patterns)
        {
            var match = Regex.Match(normalized, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                var instruction = match.Groups["instruction"].Value.Trim();
                if (!string.IsNullOrWhiteSpace(instruction))
                {
                    return TrimTrailingInstructionArtifacts(ExtendKnownInstructionPrefix(normalized, instruction));
                }
            }
        }

        return null;
    }

    private static string ExtendKnownInstructionPrefix(string normalizedText, string seedInstruction)
    {
        if (string.IsNullOrWhiteSpace(normalizedText) || string.IsNullOrWhiteSpace(seedInstruction))
        {
            return seedInstruction.Trim();
        }

        var normalizedSeed = Regex.Replace(seedInstruction, @"\s+", " ").Trim();
        var seedIndex = normalizedText.IndexOf(normalizedSeed, StringComparison.OrdinalIgnoreCase);
        if (seedIndex < 0)
        {
            return normalizedSeed;
        }

        var remainingStart = seedIndex + normalizedSeed.Length;
        if (remainingStart >= normalizedText.Length)
        {
            return normalizedSeed;
        }

        var remaining = normalizedText[remainingStart..].TrimStart();
        if (string.IsNullOrWhiteSpace(remaining))
        {
            return normalizedSeed;
        }

        var continuationClauses = SplitInstructionClauses(remaining);
        if (continuationClauses.Count == 0)
        {
            return normalizedSeed;
        }

        var selectedClauses = new List<string> { normalizedSeed };
        foreach (var clause in continuationClauses)
        {
            if (!LooksLikeContinuationInstructionClause(clause))
            {
                break;
            }

            selectedClauses.Add(clause);
        }

        return string.Join(" ", selectedClauses).Trim();
    }

    private static bool LooksLikeInstructionPreamble(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return InstructionPreambleRegex().IsMatch(Regex.Replace(value, @"\s+", " ").Trim());
    }

    private static bool LooksLikeInstructionBlock(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var normalized = Regex.Replace(value, @"\s+", " ").Trim();
        return StrongInstructionAnchorRegex().IsMatch(normalized) ||
               InstructionPreambleRegex().IsMatch(normalized);
    }

    private static List<string> SplitInstructionClauses(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = Regex.Replace(
            normalized,
            @"(?i)(?=\b(?:There\s+are\s+more|List\s+of|Write\s*:|Write\s+YES|Write\s+NO|Write\s+NOT\s+GIVEN|Write\s+the\s+correct|Use\s+NO\s+MORE|Use\s+ONE\s+WORD|Use\s+ONE\s+WORD\s+ONLY|Choose\s+your\s+answers|Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters|Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?|Fill\s+in\s+the|Complete\s+each|Do\s+the\s+following|Look\s+at\s+the\s+following|Classify\s+the\s+following|Match\s+ONE|Match\s+each\s+statement|The\s+passage\s+has|Which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following)\b)",
            "\n");

        return Regex.Split(normalized, @"(?<=[.!?])\s*|\n+")
            .Select(part => Regex.Replace(part, @"\s+", " ").Trim())
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .ToList();
    }

    private static bool LooksLikeInstructionClause(string clause, bool isFirstClause)
    {
        if (string.IsNullOrWhiteSpace(clause))
        {
            return false;
        }

        var normalized = Regex.Replace(clause, @"\s+", " ").Trim();
        if (StrongInstructionAnchorRegex().IsMatch(normalized) ||
            InstructionPreambleRegex().IsMatch(normalized))
        {
            return true;
        }

        if (YesNoInstructionClauseRegex().IsMatch(normalized))
        {
            return true;
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)^(?:which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following\b|do\s+the\s+following\s+statements\b|look\s+at\s+the\s+following\s+statements\b|match\s+each\s+statement\s+to\s+the\s+correct\b)"))
        {
            return true;
        }

        if (!isFirstClause &&
            Regex.IsMatch(
                normalized,
                @"(?i)\b(?:there\s+are\s+more|you\s+will\s+not\s+use|you\s+may\s+use\s+any\s+letter\s+more\s+than\s+once|list\s+of\s+(?:people|researchers|countries|categories|groups|options)|from\s+the\s+box|next\s+to\s+questions?|in\s+boxes?|if\s+the\s+statement|if\s+it\s+is\s+impossible|appropriate\s+numbers?|correct\s+letter|A-H|A-L|use\s+no\s+more|use\s+one\s+word|for\s+each\s+answer|from\s+the\s+passage)\b"))
        {
            return true;
        }

        return false;
    }

    private static bool LooksLikeContinuationInstructionClause(string clause)
    {
        if (string.IsNullOrWhiteSpace(clause))
        {
            return false;
        }

        var normalized = Regex.Replace(clause, @"\s+", " ").Trim();
        if (LooksLikeInstructionClause(normalized, false))
        {
            return true;
        }

        return Regex.IsMatch(
            normalized,
            @"(?i)^(?:use\s+no\s+more\s+than|use\s+one\s+word|use\s+one\s+word\s+only|write\s+the\s+correct\s+letter|write\s+the\s+appropriate|choose\s+your\s+answers?|there\s+are\s+more|you\s+will\s+not\s+use|from\s+the\s+box|for\s+each\s+answer)");
    }

    private static string TrimTrailingInstructionArtifacts(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (Regex.IsMatch(
                value.Trim(),
                @"(?i)^\[\s*(?:instruction_not_found|unknown|null|n/?a)\s*\]$"))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var boundaryIndex = FindInstructionArtifactBoundaryIndex(normalized);
        if (boundaryIndex > 0)
        {
            normalized = normalized[..boundaryIndex].TrimEnd();
        }

        normalized = StripTrailingInstructionFooterNoise(normalized);
        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static string StripTrailingInstructionFooterNoise(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        while (true)
        {
            var previous = normalized;
            normalized = Regex.Replace(normalized, @"(?i)\s+Access\s+https?://\S+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+https?://\S+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+for\s+more\s+practices\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+page\s*\d+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+Access\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

            if (string.Equals(previous, normalized, StringComparison.Ordinal))
            {
                break;
            }
        }

        return normalized;
    }

    private static int FindInstructionArtifactBoundaryIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var patterns = new[]
        {
            @"(?im)(?<boundary>^\s*List\s+of\s+(?:words|phrases|headings|people|researchers|countries|categories|groups|options)\b.*$)",
            @"(?i)(?<boundary>\s+List\s+of\s+Words(?:/Phrases)?\b)",
            @"(?im)(?<boundary>^\s*Types?\s+of\s+[A-Za-z][A-Za-z\s]{0,40}\b.*$)",
            @"(?im)(?<boundary>^\s*Example\b.*$)",
            @"(?im)(?<boundary>^\s*Access\s+https?://\S+.*$)",
            @"(?im)(?<boundary>^\s*https?://\S+.*$)",
            @"(?<boundary>(?<![A-Za-z])Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,3}\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+List\s+of\s+(?:words|phrases|headings|people|researchers|countries|categories|groups|options)\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+Types?\s+of\s+[A-Za-z][A-Za-z\s]{0,40}\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+Example\b)",
            @"(?i)(?<boundary>\s+Example\b)",
            @"(?i)(?<boundary>\s+Access\s+https?://\S+)",
            @"(?i)(?<boundary>\s+https?://\S+)",
            @"(?i)(?<boundary>\s+Write\s*:\s*[A-H]\s*[-–])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(value, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (match.Success)
            {
                var boundaryIndex = match.Groups["boundary"].Index;
                if (ShouldIgnoreInstructionArtifactBoundary(value, boundaryIndex))
                {
                    continue;
                }

                bestIndex = Math.Min(bestIndex, boundaryIndex);
            }
        }

        var inlineAnswerBankBoundaryIndex = FindInlineSharedOptionBankBoundaryIndex(value);
        if (inlineAnswerBankBoundaryIndex > 0)
        {
            bestIndex = Math.Min(bestIndex, inlineAnswerBankBoundaryIndex);
        }

        return bestIndex == int.MaxValue
            ? -1
            : bestIndex;
    }

    private static bool ShouldIgnoreInstructionArtifactBoundary(string value, int boundaryIndex)
    {
        if (string.IsNullOrWhiteSpace(value) || boundaryIndex <= 0 || boundaryIndex > value.Length)
        {
            return false;
        }

        var prefix = Regex.Replace(value[..boundaryIndex], @"\s+", " ").TrimEnd();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return false;
        }

        return Regex.IsMatch(
            prefix,
            @"(?i)\b(?:with|using)\s+the$|\bfor$|\bnext\s+to$|\bin\s+(?:spaces?|boxes?)$|\banswer\s+boxes?$|\bquestion(?:s)?$");
    }

    private static int FindInlineSharedOptionBankBoundaryIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var matches = Regex.Matches(value, @"(?<![A-Za-z0-9])(?<label>[A-H])\s+(?=\S)")
            .Cast<Match>()
            .Where(match => match.Success)
            .ToList();
        if (matches.Count < 3)
        {
            return -1;
        }

        for (var index = 0; index <= matches.Count - 3; index++)
        {
            var firstMatch = matches[index];
            if (firstMatch.Index <= 0)
            {
                continue;
            }

            var prefix = value[..firstMatch.Index].TrimEnd();
            if (string.IsNullOrWhiteSpace(prefix) ||
                !Regex.IsMatch(prefix, @"(?i)(?:[.:;?]\s*$|\b(?:below|of|passage|answer|answers|characteristic\s+of)\s*$)"))
            {
                continue;
            }

            var distinctLabels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (var lookAhead = index; lookAhead < matches.Count && lookAhead < index + 6; lookAhead++)
            {
                distinctLabels.Add(matches[lookAhead].Groups["label"].Value);
            }

            if (distinctLabels.Count >= 3)
            {
                return firstMatch.Index;
            }
        }

        return -1;
    }

    private static int FindFirstQuestionStartIndex(string snippet, int questionNumber)
    {
        if (string.IsNullOrWhiteSpace(snippet) || questionNumber <= 0)
        {
            return -1;
        }

        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var patterns = new[]
        {
            $@"^\s*(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
            $@"(?<=[\n\.\?!:;])\s*(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
            $@"(?<![A-Za-z0-9])(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=[A-Za-z""'“‘(\[])",
            $@"(?<![A-Za-z0-9])(?<number>{escapedQuestionNumber})(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s+[A-Z""'“‘(\[])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(snippet, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, match.Index);
            }
        }

        return bestIndex == int.MaxValue
            ? -1
            : bestIndex;
    }

    private static string RemoveInlineNoise(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        cleaned = Regex.Replace(cleaned, @"https?://\S+", " ", RegexOptions.IgnoreCase);
        cleaned = Regex.Replace(cleaned, @"(?i)\bfor\s+more\s+practices\b", " ");
        cleaned = Regex.Replace(cleaned, @"(?im)\bpage\s*\d+\b", " ");
        cleaned = Regex.Replace(cleaned, @"(?im)^\s*access\s*$", string.Empty);
        cleaned = Regex.Replace(cleaned, @"[ \t]{2,}", " ");
        cleaned = Regex.Replace(cleaned, @"[ \t]+\n", "\n");
        cleaned = Regex.Replace(cleaned, @"\n[ \t]+", "\n");
        return cleaned.Trim();
    }

    private static string TrimLeadingNoiseLines(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var lines = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');
        var startIndex = 0;
        while (startIndex < lines.Length)
        {
            var line = RemoveInlineNoise(lines[startIndex]);
            if (string.IsNullOrWhiteSpace(line) ||
                AccessOrPageNoiseRegex().IsMatch(line) ||
                StandaloneAccessLineRegex().IsMatch(line))
            {
                startIndex++;
                continue;
            }

            break;
        }

        return string.Join('\n', lines[startIndex..]).Trim();
    }

    private static string RemoveSelectionMarkers(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = SelectionMarkerRegex().Replace(value, " ");
        normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n[ \t]+", "\n");
        return normalized.Trim();
    }

    private static string? DetectGroupType(string? instruction, int? startQuestion = null, int? endQuestion = null)
    {
        if (string.IsNullOrWhiteSpace(instruction))
        {
            return null;
        }

        var normalized = instruction.Trim();
        var explicitQuestionCount = startQuestion.HasValue && endQuestion.HasValue && endQuestion.Value >= startQuestion.Value
            ? (endQuestion.Value - startQuestion.Value) + 1
            : 0;
        var hasMultipleQuestionsInGroup = explicitQuestionCount > 1;
        if (Regex.IsMatch(normalized, @"(?i)\bcorrect\s+ending\b|\bsentence\s+endings?\b"))
        {
            return "MATCHING_FEATURES";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases\b") &&
            Regex.IsMatch(
                normalized,
                @"(?i)\bcomplete\s+each\s+of\s+the\s+following\s+sentences\b|\bcomplete\s+each\s+sentence\b|\bcomplete\s+the\s+following\s+sentences\b"))
        {
            return "MATCHING_FEATURES";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:drawing|drawings|diagram|diagrams|figure|figures|image|images|picture|pictures|map|maps|plan|plans|projection|projections)\b") &&
            Regex.IsMatch(
                normalized,
                @"(?i)\bmatch\s+each\b|\bto\s+match\s+each\b|\bcorresponds?\s+to\b|\bprojection\s+types?\b"))
        {
            return "MATCHING_VISUALS";
        }

        if ((Regex.IsMatch(
                 normalized,
                 @"(?i)\bchoose\s+the\s+.+?\s+from\s+the\s+list\s+[A-H](?:\s*[-–]\s*[A-H])?\s+below\b") &&
             Regex.IsMatch(
                 normalized,
                 @"(?i)\bwhich\s+corresponds?\s+to\b|\baccording\s+to\s+the\s+findings\b|\bfindings?\s+of\s+the\s+study\b|\bbest\s+matches?\b")) ||
            Regex.IsMatch(
                normalized,
                @"(?i)\b(?:from\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*)?classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\b|\bas\s+characteristic\s+of\b"))
        {
            return "MATCHING_FEATURES";
        }

        if (Regex.IsMatch(normalized, @"(?i)\blabel\s+the\s+(diagram|map)\b"))
        {
            return "MAP_LABELLING";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\banswer\s+the\s+(?:following\s+)?questions?\b|\bchoose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\b") &&
            !Regex.IsMatch(
                normalized,
                @"(?i)\bcomplete\b|\bfill\s+in\s+the\s+blanks?\b|\blabel\s+the\b"))
        {
            return "SHORT_ANSWER";
        }

        if (Regex.IsMatch(normalized, @"(?i)\bcomplete\s+the\s+timeline\s+diagram\s+below\b"))
        {
            return "SENTENCE_COMPLETION";
        }

        if (Regex.IsMatch(normalized, @"(?i)\bcomplete\s+the\s+diagram\s+below\b"))
        {
            return "FLOWCHART_COMPLETION";
        }

        if (Regex.IsMatch(normalized, @"(?i)\bre-?order\s+the\s+following\s+letters?\b") &&
            Regex.IsMatch(normalized, @"(?i)\bsequence\s+of\s+events\b"))
        {
            return "FLOWCHART_COMPLETION";
        }

        if (Regex.IsMatch(normalized, @"(?i)\bflow[\s-]?chart\b"))
        {
            return "FLOWCHART_COMPLETION";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\blook\s+at\s+the\s+following\s+statements\b|\bmatch\s+each\s+statement\s+to\s+the\s+correct\s+(?:person|people|researcher|researchers|country|countries|category|categories|group|groups|option|options)\b|\blist\s+of\s+(?:people|researchers|countries|categories|groups|options)\b|\bthere\s+may\s+be\s+more\s+than\s+one\s+correct\s+answer\b"))
        {
            return "MATCHING_FEATURES";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\buse\s+the\s+information\s+in\s+the\s+(?:text|passage)\s+to\s+match\b") &&
            Regex.IsMatch(
                normalized,
                @"(?i)\bwith\s+the\s+(?:characteristics|statements|descriptions?|features|opinions)\s+(?:listed\s+)?below\b|\bmap\s+projections?\b"))
        {
            return "MATCHING_FEATURES";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b"))
        {
            return "MCQ_SINGLE";
        }

        if (ChooseNInstructionRegex().IsMatch(normalized))
        {
            return "MCQ_MULTIPLE";
        }

        if (ContainsAllTokens(normalized, "TRUE", "FALSE", "NOT", "GIVEN"))
        {
            return "TFNG";
        }

        if (ContainsAllTokens(normalized, "YES", "NO", "NOT", "GIVEN"))
        {
            return "YNNG";
        }

        if (MatchingInfoRegex().IsMatch(normalized))
        {
            return "MATCHING_INFO";
        }

        if (MatchingHeadingsRegex().IsMatch(normalized))
        {
            return "MATCHING_HEADINGS";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)\bwhich\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following\b|\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters?\b"))
        {
            return "MCQ_MULTIPLE";
        }

        if (SentenceCompletionRegex().IsMatch(normalized))
        {
            return "SENTENCE_COMPLETION";
        }

        if (McqMultipleRegex().IsMatch(normalized))
        {
            return "MCQ_MULTIPLE";
        }

        if (McqSingleRegex().IsMatch(normalized))
        {
            return "MCQ_SINGLE";
        }

        return null;
    }

    private static bool ContainsAllTokens(string value, params string[] tokens)
    {
        var uppercase = value.ToUpperInvariant();
        return tokens.All(token => uppercase.Contains(token, StringComparison.Ordinal));
    }

    private static int ParseOcrQuestionNumber(string value)
    {
        var normalized = NormalizeOcrNumericToken(value);
        return int.TryParse(normalized, out var parsed) ? parsed : -1;
    }

    private static string NormalizeOcrNumericToken(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value
            .Trim()
            .Replace('O', '0')
            .Replace('o', '0')
            .Replace('I', '1')
            .Replace('l', '1')
            .Replace('|', '1');
    }

    [GeneratedRegex(@"(?im)^\s*(?:answer\s*key(?:s)?|answers?|solution(?:s)?|review\s+and\s+explanations?|explanation(?:s)?|đáp\s*án)\s*[:\-]?\s*(?:\([^)]+\))?\s*$")]
    private static partial Regex AnswerSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer(?:\s*key(?:s)?)?|answers?|solution(?:s)?|review\s+and\s+explanations?|explanation(?:s)?)\b.*$")]
    private static partial Regex LooseAnswerSectionHeadingRegex();

    [GeneratedRegex(@"(?is)\bsolution\s*:\s*(?=\s*(?:\d|Q|question\b|answer\b|TRUE|FALSE|YES|NO|NOT\b|[A-Za-z]))")]
    private static partial Regex InlineSolutionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*review\s+and\s+explanations?\b.*$")]
    private static partial Regex ReviewSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:you\s+should\s+spend\s+about\s+\d+\s+minutes?\s+on\s+)?questions?\s*(?-i:[0-9OoIl\|]){1,2}\s*(?:-|–|—|‑|−|to)\s*(?-i:[0-9OoIl\|]){1,3}\s*,?\s*which\s+are\s+based\s+on\s*(?:this\s+passage|reading\s+passage\s*(?-i:[0-9OoIl\|]){1,2}\s+below)\.?\s*$")]
    private static partial Regex PassageQuestionIntroLineRegex();

    [GeneratedRegex(@"(?i)\b(?:you\s+should\s+spend\s+about\s+\d+\s+minutes?|which\s+are\s+based\s+on\s*(?:this\s+passage|(?:this\s+)?reading\s+passage)|based\s+on\s*(?:this\s+passage|(?:this\s+)?reading\s+passage)|reading\s+passage\s*(?-i:[0-9OoIl\|]){1,2}\s+below)\b")]
    private static partial Regex GlobalQuestionRangeHeaderRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))Questions?\s*(?<start>(?-i:[0-9OoIl\|]){1,2})\s*(?:-|–|—|‑|−|to)\s*(?<end>(?-i:[0-9OoIl\|]){1,4})(?=\b|[A-Za-z])")]
    private static partial Regex LooseQuestionRangeBoundaryRegex();

    [GeneratedRegex(@"(?i)\bQuestion\s*(?<number>(?-i:[0-9OoIl\|]){1,3})(?=\b|[A-Za-z])")]
    private static partial Regex SingleQuestionBoundaryRegex();

    [GeneratedRegex(@"(?ix)
        (?<![A-Za-z0-9])
        (?<number>\d{1,2})
        (?!\s*(?:-|–|—|‑|−|to)\s*\d)
        (?=\s|[).:\-]|[A-Za-z""'“‘(\[])")]
    private static partial Regex QuestionContentStartRegex();

    [GeneratedRegex(@"(?i)\b(?:access\s+https?://|https?://|page\s*\d+)\b")]
    private static partial Regex AccessOrPageNoiseRegex();

    [GeneratedRegex(@"(?im)^\s*access\s*$")]
    private static partial Regex StandaloneAccessLineRegex();

    [GeneratedRegex(@"[\u2610-\u2612\u25A1\u25A3\u25FB\u25FC]")]
    private static partial Regex SelectionMarkerRegex();

    [GeneratedRegex(@"(?i)\b(the\s+passage\s+has|there\s+are\s+more|list\s+of\s+headings|list\s+of\s+words|list\s+of\s+(?:phrases|people|researchers|countries|categories|groups|options)|write\s+the\s+appropriate|choose\s+your\s+answers|according\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)|choose\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given|for\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct|choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters|choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases|which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following|answer\s+the\s+following\s+questions\s+using|using\s+no\s+more\s+than|using\s+one\s+word(?:\s+only)?|using\s+two\s+words(?:\s+only)?|using\s+three\s+words(?:\s+only)?|complete\s+the|complete\s+the\s+following\s+sentences\s+using|complete\s+each\s+sentence|complete\s+each\s+of\s+the\s+following\s+sentences|fill\s+in\s+the|do\s+the\s+following|look\s+at\s+the\s+following|classify\s+the\s+following|match\s+one\s+of\s+the|match\s+each\s+statement\s+to\s+the\s+correct|use\s+the\s+information\s+in\s+the\s+text\s+to\s+match|you\s+may\s+use\s+any\s+letter\s+more\s+than\s+once)\b")]
    private static partial Regex InstructionPreambleRegex();

    [GeneratedRegex(@"(?i)\b(choose\s+the\s+most\s+suitable\s+heading|according\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)|choose\s+the\s+correct\s+letter|choose\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given|choose\s+the\s+correct\s+answer(?:\s+or\s+answers?)?|for\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct|choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases|which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following|choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters|answer\s+the\s+following\s+questions\s+using|using\s+no\s+more\s+than|using\s+one\s+word(?:\s+only)?|using\s+two\s+words(?:\s+only)?|using\s+three\s+words(?:\s+only)?|complete\s+the|complete\s+the\s+following\s+sentences\s+using|complete\s+each\s+sentence(?:\s+with\s+the\s+correct\s+ending)?|complete\s+each\s+of\s+the\s+following\s+sentences|fill\s+in\s+the\s+blanks|do\s+the\s+following\s+statements|look\s+at\s+the\s+following\s+statements|classify\s+the\s+following|match\s+one\s+of\s+the|match\s+each\s+statement\s+to\s+the\s+correct|use\s+the\s+information\s+in\s+the\s+text\s+to\s+match|choose\s+your\s+answers\s+from\s+the\s+box|write\s+the\s+appropriate\s+numbers|use\s+no\s+more\s+than|use\s+one\s+word(?:\s+only)?)\b")]
    private static partial Regex StrongInstructionAnchorRegex();

    [GeneratedRegex(@"(?i)^(?:write\s*:?\s*)?(?:YES|NO|NOT\s+GIVEN)\b.*\b(?:agrees|contradicts|impossible)\b")]
    private static partial Regex YesNoInstructionClauseRegex();

    [GeneratedRegex(@"(?i)\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b\s+of\s+the\s+following\s+(statements?|options?)\b|\bin\s+any\s+order\b|\bcorresponding\s+letters\b")]
    private static partial Regex ChooseNInstructionRegex();

    [GeneratedRegex(@"(?i)\bwhich\s+paragraphs?\s+contain(?:s)?\b|\bwhich\s+paragraph\s+contains\b")]
    private static partial Regex MatchingInfoRegex();

    [GeneratedRegex(@"(?i)\bheadings?\b|\bparagraphs?\s*\(\s*[A-Z]\s*-\s*[A-Z]\s*\)|\bmost\s+suitable\s+heading\b")]
    private static partial Regex MatchingHeadingsRegex();

    [GeneratedRegex(@"(?i)\b(complete|fill\s+in\s+the\s+blanks|no\s+more\s+than|one\s+word|two\s+words|three\s+words|summary|table|notes|flow-chart)\b")]
    private static partial Regex SentenceCompletionRegex();

    [GeneratedRegex(@"(?i)\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\b|\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\b|\bchoose\s+the\s+correct\s+answers?\b")]
    private static partial Regex McqMultipleRegex();

    [GeneratedRegex(@"(?i)\bchoose\s+the\s+correct\s+letter\b|\bchoose\s+the\s+correct\s+answer\b|\bcircle\s+the\s+correct\s+answer\b|\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b")]
    private static partial Regex McqSingleRegex();

    private readonly record struct QuestionGroupMarker(
        int StartQuestion,
        int EndQuestion,
        int StartIndex,
        int EndIndex,
        string Tags);
}
