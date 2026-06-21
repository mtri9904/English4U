using System.Net;
using System.Text;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Docnet.Core;
using Docnet.Core.Models;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService
{

    private static bool ShouldStartNewQuestionGroup(QuestionGroupBuilder currentGroup, string? boundaryToken)
    {
        if (string.IsNullOrWhiteSpace(boundaryToken))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(currentGroup.BoundaryToken))
        {
            return currentGroup.Questions.Count > 0;
        }

        return !string.Equals(currentGroup.BoundaryToken, boundaryToken, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractExplicitGroupBoundaryToken(string mappedQuestionType, string? questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return null;
        }

        var lines = questionText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();
        if (lines.Count == 0)
        {
            return null;
        }

        var firstLine = lines[0].Trim();
        var rangeMatch = QuestionRangeBoundaryRegex().Match(firstLine);
        if (rangeMatch.Success)
        {
            if (TryParseBoundaryQuestions(rangeMatch, out var start, out var end))
            {
                return $"RANGE:{start}-{end}";
            }
        }

        var instructionLine = ExtractStrongInstructionLine(mappedQuestionType, lines);
        return string.IsNullOrWhiteSpace(instructionLine)
            ? null
            : $"INSTR:{NormalizeToken(instructionLine)}";
    }

    private static string ResolveGroupInstruction(string mappedQuestionType, string? sharedInstruction)
    {
        if (!string.IsNullOrWhiteSpace(sharedInstruction))
        {
            var cleaned = Regex.Replace(sharedInstruction, @"\[Table Headers:\s*[^\]]*\]", string.Empty, RegexOptions.IgnoreCase).Trim();
            cleaned = Regex.Replace(cleaned, @"\[Table (?:Rows|Structure):\s*(?:[^\[\]]|\[Q\s*\d+\]|\[\s*EMPTY\s*\]|\\n|\n)*\]", string.Empty, RegexOptions.IgnoreCase | RegexOptions.Singleline).Trim();
            if (!string.IsNullOrWhiteSpace(cleaned))
            {
                return cleaned;
            }
        }

        return BuildInstruction(mappedQuestionType);
    }

    private static List<string[]> ApplyRowMergingAlgorithm(List<string[]> rowsList, int maxCols)
    {
        var mergedRows = new List<string[]>();
        var usedIndices = new HashSet<int>();

        for (int i = 0; i < rowsList.Count; i++)
        {
            if (usedIndices.Contains(i))
            {
                continue;
            }

            var currentMergedRow = (string[])rowsList[i].Clone();

            for (int j = i + 1; j < rowsList.Count; j++)
            {
                if (usedIndices.Contains(j))
                {
                    continue;
                }

                var candidateRow = rowsList[j];

                var labelA = currentMergedRow[0]?.Trim() ?? string.Empty;
                var labelB = candidateRow[0]?.Trim() ?? string.Empty;

                if (!string.Equals(labelA, labelB, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var canMerge = true;
                for (int col = 1; col < maxCols; col++)
                {
                    var cellA = currentMergedRow[col] ?? string.Empty;
                    var cellB = candidateRow[col] ?? string.Empty;

                    if (!string.IsNullOrEmpty(cellA) && !string.IsNullOrEmpty(cellB))
                    {
                        canMerge = false;
                        break;
                    }
                }

                if (canMerge)
                {
                    for (int col = 1; col < maxCols; col++)
                    {
                        if (string.IsNullOrEmpty(currentMergedRow[col]) && !string.IsNullOrEmpty(candidateRow[col]))
                        {
                            currentMergedRow[col] = candidateRow[col];
                        }
                    }
                    usedIndices.Add(j);
                }
            }

            mergedRows.Add(currentMergedRow);
            usedIndices.Add(i);
        }

        return mergedRows;
    }

    private static string? BuildGroupContentData(
        string mappedQuestionType,
        string? sharedInstruction,
        List<CreateQuestionDto> questions,
        QuestionGroupBuilder builder)
    {


        if (!IsCompletionTemplateType(mappedQuestionType, questions))
        {
            return null;
        }

        if (questions.Count <= 1)
        {
            return null;
        }

        var templateLines = questions
            .OrderBy(question => question.QuestionNumber ?? int.MaxValue)
            .Select(BuildSentenceCompletionTemplateLine)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (templateLines.Count == 0)
        {
            return null;
        }

        for (var index = 0; index < questions.Count; index++)
        {
            questions[index] = questions[index] with { Content = null };
        }

        if ((string.Equals(mappedQuestionType, "TABLE_COMPLETION", StringComparison.Ordinal) ||
             string.Equals(mappedQuestionType, "MATCHING_TABLE", StringComparison.Ordinal)) &&
            templateLines.Any(line => line.Contains('|')))
        {
            string[]? tableHeaders = null;
            if (!string.IsNullOrWhiteSpace(sharedInstruction))
            {
                var match = Regex.Match(sharedInstruction, @"\[Table Headers:\s*(?<headers>[^\]]*)\]", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    tableHeaders = match.Groups["headers"].Value.Split('|').Select(h => h.Trim()).ToArray();
                }
            }

            var rowsList = new List<string[]>();
            var maxCols = 0;
            var hasRowsFromInstruction = false;

            if (!string.IsNullOrWhiteSpace(sharedInstruction))
            {
                var rowsMatch = Regex.Match(sharedInstruction, @"\[Table (?:Rows|Structure):\s*(?<rows>(?:[^\[\]]|\[Q\s*\d+\]|\[\s*EMPTY\s*\]|\\n|\n)*)\]", RegexOptions.IgnoreCase | RegexOptions.Singleline);
                if (rowsMatch.Success)
                {
                    var rawRowsStr = rowsMatch.Groups["rows"].Value;
                    var rawRows = rawRowsStr.Replace("\\n", "\n").Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    foreach (var r in rawRows)
                    {
                        var cells = r.Split('|').Select(c =>
                        {
                            var trimmed = c.Trim();
                            return string.Equals(trimmed, "[EMPTY]", StringComparison.OrdinalIgnoreCase) ? string.Empty : trimmed;
                        }).ToArray();

                        if (cells.Length > maxCols)
                        {
                            maxCols = cells.Length;
                        }
                        rowsList.Add(cells);
                    }
                    hasRowsFromInstruction = rowsList.Count > 0;
                }
            }

            if (!hasRowsFromInstruction)
            {
                var tempRows = new List<string[]>();
                foreach (var line in templateLines)
                {
                    var cells = line.Split('|').Select(c =>
                    {
                        var trimmed = c.Trim();
                        return string.Equals(trimmed, "[EMPTY]", StringComparison.OrdinalIgnoreCase) ? string.Empty : trimmed;
                    }).ToArray();
                    tempRows.Add(cells);
                    if (cells.Length > maxCols)
                    {
                        maxCols = cells.Length;
                    }
                }

                string[]? matchingHeaders = null;
                if (tableHeaders != null && tableHeaders.Length > 0)
                {
                    matchingHeaders = (string[])tableHeaders.Clone();
                    if (matchingHeaders.Length == maxCols - 1 &&
                        tempRows.Any(row => row.Length == maxCols && !LooksLikeQuestionPlaceholderOnly(row[0])))
                    {
                        matchingHeaders = [string.Empty, .. matchingHeaders];
                    }
                }

                if (matchingHeaders == null || matchingHeaders.Length == 0)
                {
                    matchingHeaders = new string[maxCols];
                    for (int col = 1; col < maxCols; col++)
                    {
                        var colValues = tempRows
                            .Select(row => row.Length > col ? row[col]?.Trim() : string.Empty)
                            .Where(val => !string.IsNullOrEmpty(val) && !LooksLikeQuestionPlaceholderOnly(val) && val.Length < 30)
                            .ToList();

                        if (colValues.Count > 0)
                        {
                            var mostFrequent = colValues
                                .GroupBy(v => v, StringComparer.OrdinalIgnoreCase)
                                .OrderByDescending(g => g.Count())
                                .FirstOrDefault();

                            if (mostFrequent != null && (mostFrequent.Count() >= 2 || colValues.Count == 1))
                            {
                                matchingHeaders[col] = mostFrequent.Key ?? string.Empty;
                            }
                            else
                            {
                                matchingHeaders[col] = string.Empty;
                            }
                        }
                        else
                        {
                            matchingHeaders[col] = string.Empty;
                        }
                    }
                }

                for (int i = 0; i < tempRows.Count; i++)
                {
                    if (tempRows[i].Length < maxCols)
                    {
                        var expanded = new string[maxCols];
                        Array.Copy(tempRows[i], expanded, tempRows[i].Length);
                        for (int j = tempRows[i].Length; j < maxCols; j++)
                        {
                            expanded[j] = string.Empty;
                        }
                        tempRows[i] = expanded;
                    }

                    if (matchingHeaders != null)
                    {
                        for (int col = 1; col < maxCols; col++)
                        {
                            if (col >= matchingHeaders.Length) continue;

                            var currentCell = tempRows[i][col]?.Trim() ?? string.Empty;
                            var currentHeader = matchingHeaders[col]?.Trim() ?? string.Empty;

                            if (string.IsNullOrEmpty(currentHeader)) continue;

                            for (int otherCol = 1; otherCol < maxCols; otherCol++)
                            {
                                if (otherCol == col) continue;

                                var otherCell = tempRows[i][otherCol]?.Trim() ?? string.Empty;

                                if (string.Equals(otherCell, matchingHeaders[otherCol], StringComparison.OrdinalIgnoreCase) &&
                                    LooksLikeQuestionPlaceholderOnly(currentCell))
                                {
                                    tempRows[i][otherCol] = currentCell;
                                    tempRows[i][col] = string.Empty;
                                    break;
                                }
                            }
                        }

                        for (int col = 1; col < maxCols; col++)
                        {
                            if (col >= matchingHeaders.Length) continue;
                            var cellVal = tempRows[i][col]?.Trim() ?? string.Empty;
                            var headerVal = matchingHeaders[col]?.Trim() ?? string.Empty;
                            if (!string.IsNullOrEmpty(cellVal) &&
                                !string.IsNullOrEmpty(headerVal) &&
                                string.Equals(cellVal, headerVal, StringComparison.OrdinalIgnoreCase))
                            {
                                tempRows[i][col] = string.Empty;
                            }
                        }
                    }
                }

                rowsList = ApplyRowMergingAlgorithm(tempRows, maxCols);
            }
            else
            {
                for (int i = 0; i < rowsList.Count; i++)
                {
                    if (rowsList[i].Length < maxCols)
                    {
                        var expanded = new string[maxCols];
                        Array.Copy(rowsList[i], expanded, rowsList[i].Length);
                        for (int j = rowsList[i].Length; j < maxCols; j++)
                        {
                            expanded[j] = string.Empty;
                        }
                        rowsList[i] = expanded;
                    }
                }
            }

            if (maxCols > 0)
            {
                var normalizedRows = new List<string[]>();
                if (tableHeaders != null && tableHeaders.Length > 0)
                {
                    if (tableHeaders.Length == maxCols - 1 &&
                        rowsList.Any(row => row.Length == maxCols && !LooksLikeQuestionPlaceholderOnly(row[0])))
                    {
                        tableHeaders = [string.Empty, .. tableHeaders];
                    }

                    var headerRow = new string[maxCols];
                    for (int i = 0; i < maxCols; i++)
                    {
                        var cellVal = i < tableHeaders.Length ? tableHeaders[i] : string.Empty;
                        headerRow[i] = string.IsNullOrWhiteSpace(cellVal) ? string.Empty : $"**{cellVal}**";
                    }
                    normalizedRows.Add(headerRow);
                }

                normalizedRows.AddRange(rowsList);

                var tablePayload = new
                {
                    layout = "table",
                    title = string.Empty,
                    rows = normalizedRows
                };

                return JsonSerializer.Serialize(tablePayload, JsonOptions);
            }
        }

        var finalContent = string.Join("\n", templateLines);
        if (string.Equals(mappedQuestionType, "FLOWCHART_COMPLETION", StringComparison.Ordinal) ||
            string.Equals(mappedQuestionType, "MAP_LABELLING", StringComparison.Ordinal))
        {
            if (!IsMeaningfulFlowchartTemplate(finalContent))
            {
                return null;
            }
        }

        return finalContent;
    }

    private static bool LooksLikeQuestionPlaceholderOnly(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        Regex.IsMatch(value.Trim(), @"^\[Q\s*\d{1,2}\]$", RegexOptions.IgnoreCase);

    private static string BuildListeningMultiSelectContentData(string prompt)
    {
        var payload = new
        {
            layout = "listening_multi_select",
            prompt = prompt ?? string.Empty
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    private static string BuildSentenceCompletionTemplateLine(CreateQuestionDto question)
    {
        var content = question.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content) || !question.QuestionNumber.HasValue)
        {
            return string.Empty;
        }

        var placeholderToken = $"[Q{question.QuestionNumber.Value}]";
        if (content.Contains(placeholderToken, StringComparison.Ordinal))
        {
            return content;
        }

        if (BlankPlaceholderRegex().IsMatch(content))
        {
            return BlankPlaceholderRegex().Replace(content, placeholderToken, 1);
        }

        return $"{content} {placeholderToken}".Trim();
    }

    private static string? NormalizeQuestionBody(string mappedQuestionType, string? questionText, int? questionNumber)
    {
        var normalized = NormalizeQuestionContent(mappedQuestionType, questionText, questionNumber);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        var cleaned = normalized
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        cleaned = RemoveLeadingQuestionRangeHeading(cleaned) ?? string.Empty;

        if (questionNumber.HasValue)
        {
            cleaned = Regex.Replace(
                cleaned,
                $@"^\s*{questionNumber.Value}\s*[).:\-]?\s*",
                string.Empty,
                RegexOptions.IgnoreCase);
        }

        if (mappedQuestionType is "MATCHING_HEADINGS" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MCQ_CHOOSE_N")
        {
            cleaned = LeadingQuestionNumberRegex().Replace(cleaned, string.Empty, 1);
        }

        if (!IsCompletionTemplateType(mappedQuestionType) && questionNumber.HasValue)
        {
            cleaned = Regex.Replace(
                cleaned,
                $@"\s*\[Q\s*{questionNumber.Value}\]\s*",
                " ",
                RegexOptions.IgnoreCase);
            cleaned = Regex.Replace(cleaned, @"\s{2,}", " ").Trim();
        }

        return cleaned.Trim();
    }

    private static string? NormalizeAnswerByGroupType(string mappedQuestionType, string? rawAnswer)
    {
        if (string.IsNullOrWhiteSpace(rawAnswer))
        {
            return rawAnswer?.Trim();
        }

        if (mappedQuestionType is not "MCQ_CHOOSE_N" and not "MCQ_MULTIPLE")
        {
            return rawAnswer.Trim();
        }

        var normalizedTokens = SplitAnswerTokens(rawAnswer)
            .Select(token => token.Trim())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => IsSingleLetterAnswerToken(token) ? token.ToUpperInvariant() : token)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return normalizedTokens.Count == 0
            ? rawAnswer.Trim()
            : string.Join("|", normalizedTokens);
    }

    private static bool IsMeaningfulFlowchartTemplate(string? template)
    {
        if (string.IsNullOrWhiteSpace(template))
        {
            return false;
        }

        var cleaned = Regex.Replace(template, @"\[Q\d+\]", string.Empty, RegexOptions.IgnoreCase);
        cleaned = Regex.Replace(cleaned, @"[^a-zA-Z]", " ").ToLowerInvariant();
        
        var words = cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(w => w.Length >= 2)
            .ToList();

        var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "example", "question", "questions", "q"
        };

        var meaningfulWords = words.Where(w => !stopWords.Contains(w)).ToList();
        return meaningfulWords.Count >= 2;
    }
}
