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

    private static bool TryDeserializePassage(
        string rawResponse,
        out GemmaPassagePayload payload,
        out string error,
        string? fallbackPassageContent = null)
    {
        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            var parsed = TryDeserializePassageFromCandidates(normalizedJson, out var parseError);
            if (parsed is null)
            {
                throw new JsonException(parseError ?? "Deserialized payload is null.");
            }

            if (string.IsNullOrWhiteSpace(parsed.PassageContent) &&
                !string.IsNullOrWhiteSpace(fallbackPassageContent))
            {
                parsed.PassageContent = fallbackPassageContent.Trim();
            }

            if (string.IsNullOrWhiteSpace(parsed.PassageContent))
            {
                throw new JsonException("`passage_content` is missing.");
            }

            parsed.Questions ??= [];
            payload = parsed;
            error = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            payload = new GemmaPassagePayload();
            error = ex.Message;
            return false;
        }
    }

    private static GemmaPassagePayload? TryDeserializePassageFromCandidates(string normalizedJson, out string? parseError)
    {
        parseError = null;

        foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
        {
            if (TryDeserializeCandidateWithAutoFix(candidate, out var parsed, out parseError) && parsed is not null)
            {
                return parsed;
            }
        }

        return null;
    }

    private static bool TryDeserializeCandidateWithAutoFix(
        string candidateJson,
        out GemmaPassagePayload? payload,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                payload = JsonSerializer.Deserialize<GemmaPassagePayload>(workingJson, JsonOptions);
                if (payload is not null)
                {
                    return true;
                }

                parseError = "Deserialized payload is null.";
                break;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        payload = null;
        return false;
    }

    private static bool TryPatchJsonAtError(
        string json,
        JsonException jsonException,
        out string patchedJson)
    {
        patchedJson = json;
        var errorIndex = ResolveJsonErrorIndex(json, jsonException);
        if (errorIndex < 0 || errorIndex >= json.Length)
        {
            return false;
        }

        if (TryInsertMissingCommaAt(json, errorIndex, out patchedJson))
        {
            return true;
        }

        if (TryFixDuplicateCommaAt(json, errorIndex, out patchedJson))
        {
            return true;
        }

        if (TryRemoveUnexpectedTokenAfterValue(json, errorIndex, out patchedJson))
        {
            return true;
        }

        return false;
    }

    private static bool TryInsertMissingCommaAt(string json, int errorIndex, out string patchedJson)
    {
        patchedJson = json;

        var insertPosition = errorIndex;
        while (insertPosition > 0 && char.IsWhiteSpace(json[insertPosition - 1]))
        {
            insertPosition--;
        }

        if (insertPosition <= 0)
        {
            return false;
        }

        var previousChar = json[insertPosition - 1];
        if (previousChar is ',' or ':' or '{' or '[')
        {
            return false;
        }

        if (!LooksLikeJsonTokenStart(json[errorIndex]))
        {
            return false;
        }

        patchedJson = json[..insertPosition] + "," + json[insertPosition..];
        return true;
    }

    private static bool TryRemoveUnexpectedTokenAfterValue(string json, int errorIndex, out string patchedJson)
    {
        patchedJson = json;
        if (!char.IsLetter(json[errorIndex]))
        {
            return false;
        }

        var endIndex = errorIndex;
        while (endIndex < json.Length && json[endIndex] is not ',' and not '}' and not ']' and not '\n' and not '\r')
        {
            endIndex++;
        }

        if (endIndex <= errorIndex)
        {
            return false;
        }

        patchedJson = json[..errorIndex] + json[endIndex..];
        return true;
    }

    private static bool TryFixDuplicateCommaAt(string json, int errorIndex, out string patchedJson)
    {
        patchedJson = json;
        if (json[errorIndex] != ',')
        {
            return false;
        }

        var previousIndex = errorIndex - 1;
        while (previousIndex >= 0 && char.IsWhiteSpace(json[previousIndex]))
        {
            previousIndex--;
        }

        var nextIndex = errorIndex + 1;
        while (nextIndex < json.Length && char.IsWhiteSpace(json[nextIndex]))
        {
            nextIndex++;
        }

        if (previousIndex >= 0 && json[previousIndex] == ',')
        {
            patchedJson = json[..errorIndex] + json[(errorIndex + 1)..];
            return true;
        }

        if (nextIndex < json.Length && json[nextIndex] == ',')
        {
            patchedJson = json[..nextIndex] + json[(nextIndex + 1)..];
            return true;
        }

        return false;
    }

    private static bool LooksLikeJsonTokenStart(char value) =>
        value == '"' || value == '\'' || value == '{' || value == '[' || value == '-' || char.IsDigit(value) || char.IsLetter(value);

    private static int ResolveJsonErrorIndex(string json, JsonException jsonException)
    {
        if (string.IsNullOrEmpty(json))
        {
            return -1;
        }

        if (!jsonException.LineNumber.HasValue || !jsonException.BytePositionInLine.HasValue)
        {
            return -1;
        }

        var lineNumber = (int)Math.Max(0, jsonException.LineNumber.Value);
        var bytePositionInLine = (int)Math.Max(0, jsonException.BytePositionInLine.Value);

        var lineStart = 0;
        for (var line = 0; line < lineNumber; line++)
        {
            var newlineIndex = json.IndexOf('\n', lineStart);
            if (newlineIndex < 0)
            {
                return -1;
            }

            lineStart = newlineIndex + 1;
        }

        return Math.Clamp(lineStart + bytePositionInLine, 0, json.Length - 1);
    }

    private static string BuildJsonParseErrorMessage(string json, JsonException jsonException)
    {
        var index = ResolveJsonErrorIndex(json, jsonException);
        if (index < 0)
        {
            return jsonException.Message;
        }

        var start = Math.Max(0, index - 80);
        var length = Math.Min(160, json.Length - start);
        var snippet = json.Substring(start, length).Replace("\r", " ").Replace("\n", " ");
        return $"{jsonException.Message} | Near: {snippet}";
    }

    private static IEnumerable<string> BuildJsonParseCandidates(string normalizedJson)
    {
        yield return normalizedJson;

        if (TryEscapePassageContentJsonString(normalizedJson, out var escapedPassageContent))
        {
            yield return escapedPassageContent;
        }

        var repairedOnce = RepairMalformedJson(normalizedJson);
        if (!string.Equals(repairedOnce, normalizedJson, StringComparison.Ordinal))
        {
            yield return repairedOnce;
        }

        if (TryEscapePassageContentJsonString(repairedOnce, out var escapedAfterRepair))
        {
            yield return escapedAfterRepair;
        }

        var repairedTwice = RepairMalformedJson(repairedOnce);
        if (!string.Equals(repairedTwice, repairedOnce, StringComparison.Ordinal))
        {
            yield return repairedTwice;
        }

        if (TryEscapePassageContentJsonString(repairedTwice, out var escapedAfterSecondRepair))
        {
            yield return escapedAfterSecondRepair;
        }
    }

    private static bool TryEscapePassageContentJsonString(string json, out string escapedJson)
    {
        escapedJson = json;
        var startMatch = PassageContentStartRegex().Match(json);
        if (!startMatch.Success)
        {
            return false;
        }

        var contentStartIndex = startMatch.Index + startMatch.Length;
        var endMatch = PassageContentEndRegex().Match(json, contentStartIndex);
        if (!endMatch.Success || endMatch.Index <= contentStartIndex)
        {
            return false;
        }

        var rawContent = json[contentStartIndex..endMatch.Index];
        var escapedContent = EscapeJsonString(rawContent)
            .Replace("\r\n", "\n")
            .Replace("\r", "\n")
            .Replace("\n", "\\n");

        // Common malformed fragment from LLM output: ",," inside passage content.
        escapedContent = escapedContent.Replace("\\\",,\\\"", "\\\", ");

        if (string.Equals(rawContent, escapedContent, StringComparison.Ordinal))
        {
            return false;
        }

        escapedJson = json[..contentStartIndex] + escapedContent + json[endMatch.Index..];
        return true;
    }

    private static string RepairMalformedJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return json;
        }

        var repaired = json
            .Replace('\u201C', '"')
            .Replace('\u201D', '"')
            .Replace('\u2018', '\'')
            .Replace('\u2019', '\'');

        // Convert single-quoted keys: {'key': ...} -> {"key": ...}
        repaired = SingleQuotedPropertyRegex().Replace(repaired, "\"${key}\":");

        // Convert single-quoted string values: "answer": 'A' -> "answer": "A"
        repaired = SingleQuotedValueRegex().Replace(
            repaired,
            match => $": \"{EscapeJsonString(match.Groups["value"].Value)}\"");

        // Quote unquoted keys: {key: ...} -> {"key": ...}
        repaired = UnquotedPropertyRegex().Replace(repaired, "\"${key}\":");

        // Insert missing comma between JSON value and next property key.
        repaired = MissingCommaBeforePropertyRegex().Replace(repaired, "$1,$2");
        repaired = MissingCommaBeforeUnquotedPropertyRegex().Replace(repaired, "$1,$2");
        repaired = MissingCommaBeforeSingleQuotedPropertyRegex().Replace(repaired, "$1,$2");
        repaired = MissingCommaBeforeLiteralRegex().Replace(repaired, "$1,$2");

        // Normalize Python-style literals so JSON parser can consume them.
        repaired = PythonLiteralRegex().Replace(repaired, match =>
        {
            var literal = match.Groups["literal"].Value;
            var normalizedLiteral = literal switch
            {
                "True" => "true",
                "False" => "false",
                "None" => "null",
                _ => literal
            };

            return $"{match.Groups[1].Value}{normalizedLiteral}{match.Groups[3].Value}";
        });

        // Remove trailing commas before } or ].
        repaired = TrailingCommaRegex().Replace(repaired, "$1");

        return repaired;
    }

    private static string EscapeJsonString(string value) =>
        value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");

    private static string NormalizeJson(string rawResponse)
    {
        var cleaned = rawResponse.Trim();
        cleaned = JsonFenceRegex().Replace(cleaned, string.Empty).Trim();

        if (TryExtractFirstJsonObject(cleaned, out var extractedJson))
        {
            return extractedJson;
        }

        var firstCurly = cleaned.IndexOf('{');
        var lastCurly = cleaned.LastIndexOf('}');

        if (firstCurly >= 0 && lastCurly > firstCurly)
        {
            cleaned = cleaned[firstCurly..(lastCurly + 1)];
        }

        return cleaned;
    }

    private static bool TryExtractFirstJsonObject(string text, out string jsonObject)
    {
        jsonObject = string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var startIndex = -1;
        var depth = 0;
        var inString = false;
        var escaping = false;

        for (var i = 0; i < text.Length; i++)
        {
            var currentChar = text[i];

            if (inString)
            {
                if (escaping)
                {
                    escaping = false;
                    continue;
                }

                if (currentChar == '\\')
                {
                    escaping = true;
                    continue;
                }

                if (currentChar == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (currentChar == '"')
            {
                inString = true;
                continue;
            }

            if (currentChar == '{')
            {
                if (depth == 0)
                {
                    startIndex = i;
                }

                depth++;
                continue;
            }

            if (currentChar == '}' && depth > 0)
            {
                depth--;
                if (depth == 0 && startIndex >= 0)
                {
                    jsonObject = text[startIndex..(i + 1)];
                    return true;
                }
            }
        }

        return false;
    }
}
