using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace EnglishExamApp.Infrastructure.Services;

internal static class GeminiModelOutputSanitizer
{
    public static string Sanitize(string rawText)
    {
        var normalized = rawText
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var jsonMessage = TryExtractJsonMessage(normalized);
        if (!string.IsNullOrWhiteSpace(jsonMessage))
        {
            return jsonMessage;
        }

        normalized = StripCodeFenceWrapper(normalized);

        var finalSection = ExtractAfterFinalMarker(normalized);
        if (!string.IsNullOrWhiteSpace(finalSection))
        {
            normalized = finalSection;
        }

        var answerSection = ExtractUserFacingAnswerSection(normalized);
        if (!string.IsNullOrWhiteSpace(answerSection))
        {
            normalized = answerSection;
        }

        var lines = normalized
            .Split('\n')
            .Select(line => line.TrimEnd())
            .ToList();
        var reasoningLineCount = lines.Count(line => IsInternalReasoningLine(line) || LooksLikeContextLeakLine(line));
        if (reasoningLineCount == 0)
        {
            return CollapseBlankLines(lines);
        }

        var filteredLines = lines
            .Where(line => !IsInternalReasoningLine(line))
            .Where(line => !LooksLikeContextLeakLine(line))
            .ToList();

        var sanitized = CollapseBlankLines(filteredLines);
        return string.IsNullOrWhiteSpace(sanitized)
            ? CollapseBlankLines(lines)
            : sanitized;
    }

    private static string? TryExtractJsonMessage(string rawText)
    {
        var candidate = StripCodeFenceWrapper(rawText.Trim());
        if (TryReadJsonMessage(candidate, out var message))
        {
            return message;
        }

        var startIndex = candidate.IndexOf('{');
        var endIndex = candidate.LastIndexOf('}');
        if (startIndex >= 0 && endIndex > startIndex)
        {
            var embeddedJson = candidate[startIndex..(endIndex + 1)];
            if (TryReadJsonMessage(embeddedJson, out message))
            {
                return message;
            }
        }

        return null;
    }

    private static bool TryReadJsonMessage(string value, out string message)
    {
        message = string.Empty;

        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            if (!document.RootElement.TryGetProperty("message", out var messageProperty)
                || messageProperty.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            message = messageProperty.GetString()?.Trim() ?? string.Empty;
            return !string.IsNullOrWhiteSpace(message);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string StripCodeFenceWrapper(string value)
    {
        var trimmed = value.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstLineEnd = trimmed.IndexOf('\n');
        if (firstLineEnd < 0)
        {
            return trimmed;
        }

        var lastFenceIndex = trimmed.LastIndexOf("```", StringComparison.Ordinal);
        if (lastFenceIndex <= firstLineEnd)
        {
            return trimmed[(firstLineEnd + 1)..].Trim();
        }

        return trimmed[(firstLineEnd + 1)..lastFenceIndex].Trim();
    }

    private static string? ExtractAfterFinalMarker(string value)
    {
        var lines = value
            .Split('\n')
            .Select(line => line.TrimEnd())
            .ToList();
        var markers = new[]
        {
            "da tra loi dung",
            "da chon dung",
            "da lam dung",
            "dap an dung la",
            "ban chon",
            "ket luan:",
            "tra loi cuoi:",
            "cau tra loi cuoi:",
            "conclusion:",
            "final answer:",
            "final:",
            "answer:"
        };

        for (var index = lines.Count - 1; index >= 0; index--)
        {
            var line = lines[index].Trim();
            var normalizedLine = NormalizeForMarker(line);
            var matchedMarker = markers.FirstOrDefault(marker => normalizedLine.StartsWith(marker, StringComparison.Ordinal));
            if (matchedMarker is null)
            {
                continue;
            }

            var colonIndex = line.IndexOf(':', StringComparison.Ordinal);
            var resultLines = colonIndex >= 0
                ? new[] { line[(colonIndex + 1)..].Trim() }.Concat(lines.Skip(index + 1))
                : lines.Skip(index);

            return CollapseBlankLines(resultLines);
        }

        return null;
    }

    private static bool IsInternalReasoningLine(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        var rawPrefixes = new[]
        {
            "Step 1",
            "Step 2",
            "Step 3",
            "Step 4",
            "Step 5",
            "Step 6",
            "Current Focus:",
            "User's current focus:",
            "User's question:",
            "Context:",
            "Question ",
            "Student's choice:",
            "Student choice:",
            "Correct Answer:",
            "Correct Answer for",
            "Correct Answers:",
            "Student's Answer:",
            "Student chose",
            "Result:",
            "The question is about",
            "The statement says",
            "Scanning",
            "Found in",
            "This matches",
            "Answer ",
            "Evidence from",
            "Direct answer:",
            "Specify the location:",
            "Provide the English evidence:",
            "Explain why",
            "Need to",
            "Looking at",
            "Wait,",
            "The questions",
            "The correct answers",
            "However, the actual",
            "Rule:",
            "Observation:",
            "Acknowledged",
            "State that",
            "Begin,",
            "Action:",
            "Analysis:",
            "Reasoning:",
            "Thought:",
            "Plan:",
            "Execution:",
            "Response Structure:",
            "Drafting:",
            "Refining",
            "Self-Correction",
            "Final Polish:",
            "Check constraints:",
            "Constraint:",
            "Constraints:",
            "Conclusion:",
            "Final answer:",
            "Final:",
            "Tone:",
            "No external knowledge",
            "No meta-talk",
            "No LaTeX",
            "Clear, natural",
            "Use labels",
            "English quotes included",
            "Check against mandatory rules",
            "Correct labels",
            "Correct format",
            "No internal thoughts",
            "Start immediately",
            "Language:"
        };

        if (rawPrefixes.Any(prefix => trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (Regex.IsMatch(trimmed, @"^(?:Correct Answer(?:s)?(?:\s+for\b)?|Location|Evidence in text|Evidence|Explanation|Student'?s Choice|Plan|Execution|Response Structure|Drafting|Refining|Self-Correction|Final Polish|Constraint(?:s)?|Check constraints)\s*:", RegexOptions.IgnoreCase))
        {
            return true;
        }

        if (Regex.IsMatch(trimmed, @"^(?:đáp án đúng|dap an dung|để trả lời|de tra loi)\s+(?:cho\s+)?câu\s+này\.?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            return true;
        }

        if (Regex.IsMatch(trimmed, @"^(?:No meta-talk|No LaTeX|Correct labels|Correct format|Language|No internal thoughts|Start immediately|Check against mandatory rules)\??\s*:?\s*(?:Yes|Vietnamese)?\.?$", RegexOptions.IgnoreCase))
        {
            return true;
        }

        if (Regex.IsMatch(trimmed, @"^(?:Student chose correctly|Student did not answer|Student didn't answer),?\s+so\b", RegexOptions.IgnoreCase))
        {
            return true;
        }

        if (LooksLikePromptChecklistFragment(trimmed))
        {
            return true;
        }

        var normalizedMarker = NormalizeForMarker(trimmed);
        if (normalizedMarker.StartsWith("ket luan:", StringComparison.Ordinal))
        {
            return true;
        }

        if (Regex.IsMatch(trimmed, @"^[A-E](?:\s*\([^)]+\))?(?:\s+and\s+[A-E](?:\s*\([^)]+\))?)?\s*[-\u2013\u2014]\s*based\b", RegexOptions.IgnoreCase))
        {
            return true;
        }

        if (Regex.IsMatch(trimmed, @"^(?:Acting|Lighting|Sound|Make-?up|Making puppets)\s*:\s*\[\d", RegexOptions.IgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static bool LooksLikeContextLeakLine(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        var normalizedMarker = NormalizeForMarker(trimmed);
        if (trimmed.StartsWith("[", StringComparison.Ordinal)
            && trimmed.Contains(']')
            && !normalizedMarker.StartsWith("[doan ", StringComparison.Ordinal))
        {
            return true;
        }

        var normalizedPrefixes = new[]
        {
            "must ",
            "must not ",
            "identify ",
            "provide ",
            "ensure ",
            "follow ",
            "tone:",
            "current focus:",
            "question content:",
            "students choice:",
            "student choice:",
            "scanning ",
            "found in ",
            "answer ",
            "evidence from ",
            "direct answer:",
            "specify the location:",
            "provide the english evidence:",
            "explain why",
            "constraint:",
            "constraints:",
            "check constraints:",
            "plan:",
            "execution:",
            "response structure:",
            "drafting:",
            "refining",
            "self-correction",
            "final polish:",
            "no external knowledge",
            "no meta-talk",
            "no latex",
            "use labels",
            "english quotes included",
            "location:",
            "timestamp:",
            "transcript ",
            "transcript window",
            "transcript content:",
            "evidence segment:",
            "relevant text:",
            "context provided:",
            "map analysis:",
            "the speaker ",
            "the transcript ",
            "start at ",
            "turn right",
            "turn left",
            "looking at the map",
            "prompt chung:",
            "noi dung:",
            "dap an dung:",
            "hoc vien chon:"
        };

        if (normalizedPrefixes.Any(prefix => normalizedMarker.StartsWith(prefix, StringComparison.Ordinal)))
        {
            return true;
        }

        return trimmed.StartsWith("Section ", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Part ", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("CURRENT_", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Transcript window", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Review document", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Replay audio", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Tapescript", StringComparison.OrdinalIgnoreCase);
    }

    private static bool LooksLikePromptChecklistFragment(string line)
    {
        var normalized = NormalizeForMarker(line);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var labelHits = 0;
        var labels = new[]
        {
            "doc o",
            "dap an dung",
            "dan chung",
            "vi sao khop",
            "vi sao lua chon"
        };

        foreach (var label in labels)
        {
            if (normalized.Contains(label, StringComparison.Ordinal))
            {
                labelHits += 1;
            }
        }

        return labelHits >= 2
            && Regex.IsMatch(normalized, @"(?:^|\s)(?:1|2|3|4|5)\.\s*[""']?")
            && (line.Contains('"', StringComparison.Ordinal) || line.Contains('\'', StringComparison.Ordinal));
    }

    private static string? ExtractUserFacingAnswerSection(string value)
    {
        var lines = value
            .Split('\n')
            .Select(line => line.TrimEnd())
            .ToList();

        for (var index = 0; index < lines.Count; index++)
        {
            var answerStartIndex = FindUserFacingAnswerStartIndex(lines[index]);
            if (answerStartIndex < 0)
            {
                continue;
            }

            var resultLines = new[] { lines[index][answerStartIndex..].Trim() }.Concat(lines.Skip(index + 1));
            return CollapseBlankLines(resultLines);
        }

        return null;
    }

    private static int FindUserFacingAnswerStartIndex(string line)
    {
        var normalized = NormalizeForMarker(line);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return -1;
        }

        var answerPrefixes = new[]
        {
            "doc o",
            "de tra loi",
            "em can doc",
            "ban can doc",
            "vi sao dap an",
            "bang chung",
            "dan chung",
            "giai thich",
            "dap an",
            "cach loai tru",
            "voi dap an",
            "trong doan nay",
            "trong [doan",
            "ban hay nghe",
            "o cau nay",
            "o [doan"
        };

        if (answerPrefixes.Any(prefix => normalized.StartsWith(prefix, StringComparison.Ordinal)))
        {
            return 0;
        }

        var answerStartPatterns = new[]
        {
            @"(?:Đọc|Doc)\s+(?:ở|o)\s*:",
            @"(?:Để|De)\s+(?:trả|tra)\s+(?:lời|loi)",
            @"(?:Đ|D)áp\s+(?:án|an)(?:\s+(?:đúng|dung))?",
            @"(?:Dẫn|Dan)\s+(?:chứng|chung)",
            @"(?:Bằng|Bang)\s+(?:chứng|chung)",
            @"(?:Em|Bạn|Ban)\s+(?:cần|can)\s+(?:đọc|doc)",
            @"(?:Ở|O|Trong)\s+\[?(?:Đoạn|Doan)"
        };

        foreach (var pattern in answerStartPatterns)
        {
            var match = Regex.Match(line, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (match.Success)
            {
                return match.Index;
            }
        }

        return -1;
    }

    private static string NormalizeForMarker(string value)
    {
        var formD = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(formD.Length);

        foreach (var character in formD)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            builder.Append(character is '\u0111' or '\u0110' ? 'd' : char.ToLowerInvariant(character));
        }

        return Regex.Replace(builder.ToString(), @"\s+", " ").Trim();
    }

    private static string CollapseBlankLines(IEnumerable<string> lines)
    {
        var builder = new StringBuilder();
        var previousLineBlank = false;

        foreach (var line in lines)
        {
            var trimmedLine = line.TrimEnd();
            var isBlank = string.IsNullOrWhiteSpace(trimmedLine);
            if (isBlank)
            {
                if (previousLineBlank || builder.Length == 0)
                {
                    continue;
                }

                builder.AppendLine();
                previousLineBlank = true;
                continue;
            }

            if (builder.Length > 0 && !previousLineBlank)
            {
                builder.AppendLine();
            }

            builder.Append(trimmedLine);
            previousLineBlank = false;
        }

        return builder.ToString().Trim();
    }
}
