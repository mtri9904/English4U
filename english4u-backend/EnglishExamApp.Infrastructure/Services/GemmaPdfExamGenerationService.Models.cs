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
    private const string PdfGenerationProgressEventType = "exam.pdf-generation.progress";

    [GeneratedRegex(@"(?im)^\s*reading\s*passage\s*(?<number>[1-3]|one|two|three)\b")]
    private static partial Regex ReadingPassageRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))reading\s*passage\s*(?<number>[1-3]|one|two|three)(?=\b|[A-Z])")]
    private static partial Regex InlineReadingPassageRegex();

    [GeneratedRegex(@"(?im)^\s*(?:reading\s+)?passage\s*(?<number>[1-3]|one|two|three)\b")]
    private static partial Regex FallbackPassageRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))(?:reading\s+)?passage\s*(?<number>[1-3]|one|two|three)(?=\b|[A-Z])")]
    private static partial Regex InlineFallbackPassageRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer\s*key(?:s)?|answers?|solution(?:s)?|đáp\s*án)\s*[:\-]?\s*(?:\([^)]+\))?\s*$")]
    private static partial Regex SolutionSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer(?:\s*key(?:s)?)?|answers?|solution(?:s)?)\b.*$")]
    private static partial Regex LooseSolutionSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer\s*key(?:s)?|answers?|solution(?:s)?|review\s+and\s+explanations?|explanation(?:s)?|đáp\s*án)\s*[:\-]?\s*(?:\([^)]+\))?\s*$")]
    private static partial Regex AnswerSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:answer(?:\s*key(?:s)?)?|answers?|solution(?:s)?|review\s+and\s+explanations?|explanation(?:s)?)\b.*$")]
    private static partial Regex LooseAnswerSectionHeadingRegex();

    [GeneratedRegex(@"(?is)\bsolution\s*:\s*(?=\s*(?:\d|Q|question\b|answer\b|TRUE|FALSE|YES|NO|NOT\b|[A-Za-z]))")]
    private static partial Regex InlineSolutionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*review\s+and\s+explanations?\b.*$")]
    private static partial Regex ReviewSectionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*question\s+\d{1,2}\b")]
    private static partial Regex ExplanationQuestionHeadingRegex();

    [GeneratedRegex(@"(?im)^\s*(?:question\s*)?(?<number>\d{1,2})\s*[).:\-]\s*")]
    private static partial Regex ExplanationBlockStartRegex();

    [GeneratedRegex(@"(?is)(?<!\d)(?<range>Q?\s*\d{1,2}(?:\s*(?:to|[-–—])\s*Q?\s*\d{1,2})?)\s*Answer\s*:\s*(?<raw>.*?)(?=(?<!\d)Q?\s*\d{1,2}(?:\s*(?:to|[-–—])\s*Q?\s*\d{1,2})?\s*Answer\s*:|$)")]
    private static partial Regex ReviewAnswerEntryRegex();

    [GeneratedRegex(@"(?ix)
        (?<=[A-Za-z0-9])
        (?=
            The\s+keywords?|
            Keywords?\s*in\s*Questions?|
            Similar\s*words?\s*in\s*Passage|
            In\s+this\s+question|
            From\s+these|
            At\s+paragraph|
            According\s+to|
            Throughout\s+the\s+passage|
            Q\s*\d+\s*:|
            Q\s*\d+\s*(?:to|[-–—])\s*Q?\s*\d+\b|
            Note\s*:|
            page\s*\d+\b|
            Access\s+https?://
        )")]
    private static partial Regex GluedReviewMarkerRegex();

    [GeneratedRegex(@"(?ix)
        \b(
            The\s+keywords?|
            Keywords?\s*in\s*Questions?|
            Similar\s*words?\s*in\s*Passage|
            In\s+this\s+question|
            From\s+these|
            At\s+paragraph|
            According\s+to|
            Throughout\s+the\s+passage|
            Q\s*\d+\s*:|
            Q\s*\d+\s*(?:to|[-–—])\s*Q?\s*\d+\b|
            Note\s*:|
            page\s*\d+\b|
            Access\s+https?://
        )")]
    private static partial Regex ReviewExplanationMarkerRegex();

    [GeneratedRegex(@"(?im)^\s*(?:\d{1,2}\s*[).:\-]\s*[A-Za-z0-9][^\n]*|\d{1,2}\s+[A-Za-z][^\n]*)$")]
    private static partial Regex AnswerEntryLineRegex();

    [GeneratedRegex(@"(?i)(?:(?<=^)|(?<=[^A-Za-z])|(?<=[a-z]))Questions?\s*(?<start>[0-9OoIl\|]{1,2})\s*(?:-|–|—|‑|−|to)\s*(?<end>[0-9OoIl\|]{1,4})(?=\b|[A-Za-z])")]
    private static partial Regex QuestionRangeBoundaryRegex();

    [GeneratedRegex(@"(?i)\bQuestion\s*(?<number>[0-9OoIl\|]{1,3})(?=\b|[A-Za-z])")]
    private static partial Regex SingleQuestionBoundaryRegex();

    [GeneratedRegex(@"(?im)^\s*(?:you\s+should\s+spend\s+about\s+\d+\s+minutes?.*|which\s+are\s+based\s+on\s+reading\s+passage\s+\d+.*|write\s+your\s+answers?.*|on\s+your\s+answer\s+sheet.*|access\s+https?://\S+.*|https?://\S*ieltsonlinetests\.com\S*.*|page\s*\d+\s*)$")]
    private static partial Regex PassageNoiseLineRegex();

    [GeneratedRegex(@"(?im)^\s*(?:you\s+should\s+spend\s+about\s+\d+\s+minutes?\s+on\s+)?questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,3}\s*,?\s*which\s+are\s+based\s+on\s*(?:this\s+passage|reading\s+passage\s*[0-9OoIl\|]{1,2}\s+below)\.?\s*$")]
    private static partial Regex PassageQuestionIntroLineRegex();

    [GeneratedRegex(@"(?i)\b(?:page\s*\d+\s*)?(?:access\s+https?://|https?://\S*ieltsonlinetests\.com)\b")]
    private static partial Regex InlinePassageFooterNoiseRegex();

    [GeneratedRegex(@"(?im)^\s*(?:questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,2}\b|question\s*[0-9OoIl\|]{1,2}\b|do\s+the\s+following\s+statements\b|complete\s+the\s+following\s+sentences\b|according\s+to\s+the\s+information\s+given\b|for\s+each\s+question\b|in\s+boxes?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,2}\b|the\s+text\s+has\s+\d+\s+paragraphs?\b|choose\s+the\s+required\s+letters\b|choose\s+the\s+correct\s+answer(?:\s+or\s+answers?)?\b|solution\s*:|review\s+and\s+explanations?\b)\b.*$")]
    private static partial Regex PassageQuestionBoundaryLineRegex();

    [GeneratedRegex(@"(?i)(?<![A-Za-z])questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|–|—|‑|−|to)\s*[0-9OoIl\|]{1,2}\b")]
    private static partial Regex InlinePassageQuestionBoundaryRegex();

    [GeneratedRegex(@"(?<!\b[A-Z]\.)(?<=[\.\?!""'”’\)\]])\s*(?=(?:\*\*)?[A-H](?:\s*[).:\-]|[.])?(?:\*\*)?\s+)")]
    private static partial Regex CollapsedPassageParagraphBoundaryRegex();

    [GeneratedRegex(@"(?m)(?<=\b[A-Z])\.\s*\n\s*(?=[A-Z]\.)")]
    private static partial Regex BrokenAbbreviationAcrossLinesRegex();

    [GeneratedRegex(@"(?m)^[ \t]*\*\*(?<label>[A-H])(?:[ \t]*[).:\-]|[.])?[ \t]*\*\*[ \t]*(?<text>\S.*)$")]
    private static partial Regex MarkdownLabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)^[ \t]*(?<label>[A-H])(?:(?:[ \t]*[).:\-]|[.])[ \t]*|[ \t]+)(?<text>\S.*)$")]
    private static partial Regex LabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)^[ \t]*\*\*(?<label>[A-H])(?:[ \t]*[).:\-]|[.])?[ \t]*\*\*[ \t]*$")]
    private static partial Regex StandaloneMarkdownLabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)^[ \t]*(?<label>[A-H])(?:[ \t]*[).:\-]|[.])?[ \t]*$")]
    private static partial Regex StandaloneLabeledPassageLineRegex();

    [GeneratedRegex(@"(?m)(?<!^)(?<!\n\n)(?=^[ \t]*(?:\*\*[A-H](?:[ \t]*[).:\-]|[.])?[ \t]*\*\*|\*\*[A-H]\*\*\.|[A-H](?:[ \t]*[).:\-]|[.])?)(?:[ \t]|\S))")]
    private static partial Regex MissingBlankLineBeforeLabeledPassageRegex();

    [GeneratedRegex(@"(?<quote>[’'""”])\s+(?<speaker>[A-Z][\p{L}'’\.-]+(?:\s+[A-Z][\p{L}'’\.-]+){1,6}\s+\((?:[^()\n]{3,220})\))")]
    private static partial Regex InlineSpeakerAttributionRegex();

    [GeneratedRegex(@"^\s*(?:\*\*\*)?(?<speaker>[A-Z][\p{L}'’\.-]+(?:\s+[A-Z][\p{L}'’\.-]+){1,6}\s+\((?:[^()\n]{3,220})\))(?:\*\*\*)?\s*$")]
    private static partial Regex SpeakerSignatureLineRegex();

    [GeneratedRegex(@"(?m)^[\s\u200B-\u200D\uFEFF]*(?:\*{2,}|_{2,})\s+(?=\S)")]
    private static partial Regex OrphanLeadingMarkdownMarkerRegex();

    [GeneratedRegex(@"(?m)(?<=\S)\s+(?:\*{2,}|_{2,})\s*$")]
    private static partial Regex OrphanTrailingMarkdownMarkerRegex();

    [GeneratedRegex(@"^\s*```(?:json)?\s*|\s*```\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex JsonFenceRegex();

    [GeneratedRegex(@"""passage_content""\s*:\s*""", RegexOptions.IgnoreCase)]
    private static partial Regex PassageContentStartRegex();

    [GeneratedRegex(@"""\s*,\s*""questions""\s*:", RegexOptions.IgnoreCase)]
    private static partial Regex PassageContentEndRegex();

    [GeneratedRegex(@"'(?<key>[A-Za-z_][A-Za-z0-9_]*)'\s*:")]
    private static partial Regex SingleQuotedPropertyRegex();

    [GeneratedRegex(@"(?<=\{|,)\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*:")]
    private static partial Regex UnquotedPropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*(""(?:[A-Za-z_][A-Za-z0-9_]*)""\s*:)")]
    private static partial Regex MissingCommaBeforePropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*([A-Za-z_][A-Za-z0-9_]*\s*:)")]
    private static partial Regex MissingCommaBeforeUnquotedPropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*('(?:[A-Za-z_][A-Za-z0-9_]*)'\s*:)")]
    private static partial Regex MissingCommaBeforeSingleQuotedPropertyRegex();

    [GeneratedRegex(@"((?:""([^""\\]|\\.)*""|-?\d+(?:\.\d+)?(?:[eE][\+\-]?\d+)?|true|false|null|\}|\]))\s*((?:true|false|null|True|False|None)\b)")]
    private static partial Regex MissingCommaBeforeLiteralRegex();

    [GeneratedRegex(@"([:\[,]\s*)(?<literal>True|False|None)(\s*(?:,|\}|\]))")]
    private static partial Regex PythonLiteralRegex();

    [GeneratedRegex(@":\s*'(?<value>(?:[^'\\]|\\.)*)'(?=\s*(?:,|\}|\]))")]
    private static partial Regex SingleQuotedValueRegex();

    [GeneratedRegex(@",\s*([\}\]])")]
    private static partial Regex TrailingCommaRegex();

    [GeneratedRegex(@"(?im)^\s*(?<number>\d{1,2})\s*[).:\-]?\s*(?<answer>.+?)\s*$")]
    private static partial Regex SingleAnswerLineRegex();

    [GeneratedRegex(@"(?ix)
        (?<!\d)
        (?<number>\d{1,2})
        \s*[).:\-]?\s*
        (?<answer>
            NOT\ GIVEN|
            TRUE|
            FALSE|
            YES|
            NO|
            [A-H]|
            [A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*){0,4}
        )
        (?=
            \s*(?:\d{1,2}\s*[).:\-]?)|
            \s*$
        )")]
    private static partial Regex CompactAnswerPairRegex();

    [GeneratedRegex(@"(?ix)
        (?<!\d)
        (?<number>\d{1,2})
        \s*
        (?<answer>
            NOT\s*GIVEN|
            TRUE|
            FALSE|
            YES|
            NO|
            [A-H]
        )
        (?=
            \d|
            \s|
            $|
            [).:\-]
        )")]
    private static partial Regex UltraCompactAnswerPairRegex();

    [GeneratedRegex(@"(?ix)
        (?<!\d)
        (?<number>\d{1,2})
        \s*[).:\-]?\s*
        (?<answer>
            NOT\ GIVEN|
            TRUE|
            FALSE|
            YES|
            NO|
            [A-H]|
            [A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*){0,6}
        )
        (?=
            \s+\d{1,2}\s*[).:\-]?|
            \s*$
        )")]
    private static partial Regex AnswerPairInLineRegex();

    [GeneratedRegex(@"^(?<label>[A-H])\s*[).:\-]\s*(?<text>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex AnswerStartsWithLabelRegex();

    [GeneratedRegex(@"^(?<answer>.+?)(?:\s*(?:[-–—]|because|since|therefore|=>)\s+.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex AnswerBeforeExplanationRegex();

    [GeneratedRegex(@"^(?:TRUE|FALSE|YES|NO|NOT\s+GIVEN|[A-Z])(?:[).:\-]|\s)+(?<explanation>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex LeadingAnswerTokenRegex();

    [GeneratedRegex(@"(?i)\b(?:access\s+https?://|https?://|page\s*\d+)\b")]
    private static partial Regex AccessOrPageNoiseRegex();

    [GeneratedRegex(@"(?im)^\s*access\s*$")]
    private static partial Regex StandaloneAccessLineRegex();

    [GeneratedRegex(@"(?i)\b(?:https?://|access\b|open\s+this\s+url|how\s+to\s+use|on\s+your\s+computer|ways?\s+to\s+access|reading\s+passage|answer\s+sheet|ieltsonlinetests|page\s*\d+|questions?\b)\b")]
    private static partial Regex AnswerKeyNoiseHintRegex();

    [GeneratedRegex(@"(?i)(?:\d{1,2}\s*[A-Z]){3,}")]
    private static partial Regex CompactAnswerBlobRegex();

    [GeneratedRegex(@"^\s*(?<label>[A-Z])\s*[).:\-]\s*(?<text>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex OptionStartsWithLetterLabelRegex();

    [GeneratedRegex(@"^\s*(?<label>[A-Z])\s+(?<text>.+)$", RegexOptions.IgnoreCase)]
    private static partial Regex OptionStartsWithLetterSpaceRegex();

    [GeneratedRegex(@"^\s*\d{1,2}\s*[).:\-]?\s+")]
    private static partial Regex LeadingQuestionNumberRegex();

    [GeneratedRegex(@"\b(TRUE|FALSE|NOT\s+GIVEN)\b", RegexOptions.IgnoreCase)]
    private static partial Regex TrueFalseNotGivenRegex();

    [GeneratedRegex(@"\b(YES|NO|NOT\s+GIVEN)\b", RegexOptions.IgnoreCase)]
    private static partial Regex YesNoNotGivenRegex();

    [GeneratedRegex(@"\b(choose|write)\b.*\b(letter|letters)\b|\bA\s*-\s*[A-Z]\b", RegexOptions.IgnoreCase)]
    private static partial Regex MatchingInstructionRegex();

    [GeneratedRegex(@"\bwhich\s+paragraphs?\s+contain(?:s)?\b|\bwhich\s+paragraph\s+contains\b", RegexOptions.IgnoreCase)]
    private static partial Regex MatchingInfoInstructionRegex();

    [GeneratedRegex(@"\bheadings?\b|\bparagraphs?\s*\(\s*[A-Z]\s*-\s*[A-Z]\s*\)|\bparagraph\s+[A-Z]\b", RegexOptions.IgnoreCase)]
    private static partial Regex MatchingHeadingsInstructionRegex();

    [GeneratedRegex(@"\bchoose\s+the\s+correct\s+answer(?:\s+or\s+answers?)?\b|\bchoose\s+the\s+correct\s+answers?\b", RegexOptions.IgnoreCase)]
    private static partial Regex ChooseCorrectAnswerOrAnswersRegex();

    [GeneratedRegex(@"\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\b|\bchoose\s+the\s+correct\s+answers?\b", RegexOptions.IgnoreCase)]
    private static partial Regex ChooseCorrectAnswersOnlyRegex();

    [GeneratedRegex(@"\b(two|three|four|five|six|seven|eight|nine|ten|[2-9]|\d{2,})\b\s+of\s+the\s+following\s+(statements?|options?)\b|\bin\s+any\s+order\b|\bcorresponding\s+letters\b", RegexOptions.IgnoreCase)]
    private static partial Regex ChooseNStatementsInstructionRegex();

    [GeneratedRegex(@"\b(which|choose|according|match|write|complete|paragraph|headings?|statements?|following|correct)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SharedInstructionLineRegex();

    [GeneratedRegex(@"^[A-H]$", RegexOptions.IgnoreCase)]
    private static partial Regex SingleLetterAnswerRegex();

    [GeneratedRegex(@"^\s*[A-H]\s*(?:[).:\-]\s*)?(?:[A-H])?\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex OptionLabelOnlyRegex();

    [GeneratedRegex(@"[\u2610-\u2612\u25A1\u25A3\u25FB\u25FC]")]
    private static partial Regex SelectionMarkerRegex();

    [GeneratedRegex(@"\b(fill|complete|no\s+more\s+than|one\s+word|two\s+words)\b", RegexOptions.IgnoreCase)]
    private static partial Regex FillInBlankInstructionRegex();

    [GeneratedRegex(@"(?<=\p{L})-\n(?=\p{L})")]
    private static partial Regex HyphenatedWordAcrossLinesRegex();

    [GeneratedRegex(@"(?<=[a-z0-9,;:])\n(?=[a-z])")]
    private static partial Regex SoftLineBreakBetweenLowercaseWordsRegex();

    [GeneratedRegex(@"\b(?<prefix>to|their|getting|no)(?<suffix>learn|teachers|thrive|them|evidence)\b", RegexOptions.IgnoreCase)]
    private static partial Regex FixKnownGluedWordsRegex();

    [GeneratedRegex(@"_{2,}|\[Q\d+\]|\.\.\.", RegexOptions.IgnoreCase)]
    private static partial Regex BlankPlaceholderRegex();

    [GeneratedRegex(@"(?<=\S)[ \t]{4,}(?=\S)")]
    private static partial Regex MissingBlankGapRegex();

    [GeneratedRegex(@"([.?!])\s*$")]
    private static partial Regex SentenceEndingPunctuationRegex();

    private readonly record struct PassageMarker(int Number, int StartIndex);
    private readonly record struct PassageQuestionSegment(
        int SegmentIndex,
        int SegmentCount,
        int StartQuestion,
        int EndQuestion,
        string Text);
    private readonly record struct QuestionRangeSegment(
        int StartQuestion,
        int EndQuestion,
        int StartIndex);
    private readonly record struct GroupedQuestionRange(
        int StartQuestion,
        int EndQuestion,
        string BlockText);

    private sealed record IndexedQuestion(GemmaQuestionPayload Question, int Index);

    private sealed class QuestionGroupBuilder(string groupType, string? boundaryToken, RawQuestionGroupContext? rawContext)
    {
        public string GroupType { get; } = groupType;
        public string? BoundaryToken { get; } = boundaryToken;
        public RawQuestionGroupContext? RawContext { get; } = rawContext;
        public string? RawInstruction { get; } = rawContext?.Instruction;
        public string? RawBlockText { get; } = rawContext?.BlockText;
        public List<CreateQuestionDto> Questions { get; } = [];
    }

    private sealed record RawQuestionGroupContext(
        int StartQuestion,
        int EndQuestion,
        string? BoundaryToken,
        string? Instruction,
        string? GroupType,
        string? BlockText,
        string? QuestionPreview,
        IReadOnlyList<PdfRawVisualPreviewItemDto>? VisualPreviewItems,
        string? VisualPreviewNote,
        int? DiagramPreviewPageNumber,
        string? DiagramPreviewNote,
        string? TableData = null);

    private sealed class GemmaPassagePayload
    {
        [JsonPropertyName("passage_title")]
        public string? PassageTitle { get; set; }

        [JsonPropertyName("passage_content")]
        public string? PassageContent { get; set; }

        [JsonPropertyName("questions")]
        public List<GemmaQuestionPayload>? Questions { get; set; }
    }

    private sealed class GemmaQuestionPayload
    {
        [JsonPropertyName("question_number")]
        public JsonElement? QuestionNumber { get; set; }

        [JsonPropertyName("question_type")]
        public JsonElement? QuestionType { get; set; }

        [JsonPropertyName("instruction")]
        public JsonElement? Instruction { get; set; }

        [JsonPropertyName("question_text")]
        public JsonElement? QuestionText { get; set; }

        [JsonPropertyName("options")]
        public JsonElement? Options { get; set; }

        [JsonPropertyName("answer")]
        public JsonElement? Answer { get; set; }

        [JsonPropertyName("explanation")]
        public JsonElement? Explanation { get; set; }

        [JsonPropertyName("question_group")]
        public JsonElement? QuestionGroup { get; set; }

        [JsonPropertyName("table_data")]
        public JsonElement? TableData { get; set; }
    }

    private sealed record GeminiPassageContentRepairPayload(
        [property: JsonPropertyName("passage_content")] string? PassageContent);

    private sealed record MultiSelectContentData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("prompt")] string Prompt);

    private sealed record FlowchartGroupAssetsData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("imageUrl")] string ImageUrl,
        [property: JsonPropertyName("answerMode")] string AnswerMode,
        [property: JsonPropertyName("pageNumber")] int? PageNumber = null,
        [property: JsonPropertyName("note")] string? Note = null,
        [property: JsonPropertyName("cropBox")] PdfVisualCropBoxDto? CropBox = null);

    private sealed record MapLabellingGroupAssetsData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("imageUrl")] string ImageUrl,
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("zoom")] int Zoom,
        [property: JsonPropertyName("pageNumber")] int? PageNumber = null,
        [property: JsonPropertyName("note")] string? Note = null,
        [property: JsonPropertyName("cropBox")] PdfVisualCropBoxDto? CropBox = null);

    private sealed record MatchingVisualGroupAssetsData(
        [property: JsonPropertyName("layout")] string Layout,
        [property: JsonPropertyName("images")] IReadOnlyList<string> Images,
        [property: JsonPropertyName("pageNumbers")] IReadOnlyList<int> PageNumbers,
        [property: JsonPropertyName("note")] string? Note = null);

    private sealed record FallbackAnswerCandidate(
        int QuestionNumber,
        string QuestionType,
        string QuestionText,
        IReadOnlyList<string> Options,
        string CurrentAnswer);

    private sealed record FallbackAnswerMappingResult(
        int AppliedCount,
        HashSet<int> VerifiedQuestionNumbers);

    private sealed record FallbackOptionCandidate(
        int QuestionNumber,
        string QuestionType,
        string QuestionText,
        IReadOnlyList<string> ExpectedOptionLabels,
        IReadOnlyList<string> CurrentOptions);

    private sealed class FallbackAnswerResponse
    {
        [JsonPropertyName("answers")]
        public List<FallbackAnswerItem>? Answers { get; set; }
    }

    private sealed class FallbackAnswerItem
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("answer")]
        public string? Answer { get; set; }
    }

    private sealed class FallbackOptionResponse
    {
        [JsonPropertyName("options")]
        public List<FallbackOptionItem>? Options { get; set; }
    }

    private sealed class FallbackOptionItem
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("options")]
        public List<string>? Options { get; set; }
    }

    private sealed class RawReviewStructureResponse
    {
        [JsonPropertyName("passages")]
        public List<RawReviewStructurePassage>? Passages { get; set; }

        [JsonPropertyName("solution_section_raw")]
        public string? SolutionSectionRaw { get; set; }

        [JsonPropertyName("review_section_raw")]
        public string? ReviewSectionRaw { get; set; }
    }

    private sealed class RawReviewStructurePassage
    {
        [JsonPropertyName("passage_number")]
        public int PassageNumber { get; set; }

        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("question_range")]
        public string? QuestionRange { get; set; }

        [JsonPropertyName("raw_text")]
        public string? RawText { get; set; }
    }

    private sealed class RawReviewQuestionGroupsResponse
    {
        [JsonPropertyName("question_groups")]
        public List<RawReviewQuestionGroupItem>? QuestionGroups { get; set; }
    }

    private sealed class RawReviewQuestionGroupItem
    {
        [JsonPropertyName("start_question")]
        public int StartQuestion { get; set; }

        [JsonPropertyName("end_question")]
        public int EndQuestion { get; set; }

        [JsonPropertyName("tags")]
        public string? Tags { get; set; }

        [JsonPropertyName("instruction")]
        public string? Instruction { get; set; }

        [JsonPropertyName("group_type")]
        public string? GroupType { get; set; }

        [JsonPropertyName("question_preview")]
        public string? QuestionPreview { get; set; }

        [JsonPropertyName("type_evidence")]
        public string? TypeEvidence { get; set; }
    }

    private sealed class RawReviewAnswersResponse
    {
        [JsonPropertyName("answers")]
        public List<RawReviewAnswerItem>? Answers { get; set; }
    }

    private sealed class RawReviewAnswerItem
    {
        [JsonPropertyName("question_number")]
        public int QuestionNumber { get; set; }

        [JsonPropertyName("answer")]
        public string? Answer { get; set; }
    }

    private sealed class RawReviewExplanationsResponse
    {
        [JsonPropertyName("explanations")]
        public List<RawReviewExplanationItem>? Explanations { get; set; }
    }

    private sealed class SentenceCompletionTemplateResponse
    {
        [JsonPropertyName("templates")]
        public List<SentenceCompletionTemplateItem>? Templates { get; set; }
    }

    private sealed class SentenceCompletionTemplateItem
    {
        [JsonPropertyName("question_number")]
        public JsonElement QuestionNumber { get; set; }

        [JsonPropertyName("template")]
        public string? Template { get; set; }
    }

    private sealed class RawReviewExplanationItem
    {
        [JsonPropertyName("question_number")]
        public int QuestionNumber { get; set; }

        [JsonPropertyName("answer")]
        public string? Answer { get; set; }

        [JsonPropertyName("explanation")]
        public string? Explanation { get; set; }
    }

    private sealed record PdfExtractedWordLine(
        string Text,
        string NormalizedText,
        double TopFromPageTop,
        double BottomFromPageTop,
        double Left,
        double Right);

    private sealed record DiagramPreviewCropBounds(
        double TopRatio,
        double BottomRatio,
        bool HasExplicitBottomBoundary,
        bool HasExplicitInstructionBoundary,
        double LeftRatio = 0d,
        double RightRatio = 1d);

    private sealed record QuestionGroupReviewContextBlock(
        int StartQuestion,
        int EndQuestion,
        string Tags,
        string Instruction,
        string? QuestionPreview,
        string? BlockText,
        string? HeuristicGroupType,
        string? TypeEvidence);
    private sealed record GeminiDiagramCropResponse(
        [property: JsonPropertyName("crop_box")] GeminiDiagramCropBox? CropBox,
        [property: JsonPropertyName("page_number")] int? PageNumber,
        [property: JsonPropertyName("confidence")] double? Confidence = null,
        [property: JsonPropertyName("reason")] string? Reason = null);

    private sealed record GeminiDiagramCropBox(
        [property: JsonPropertyName("x")] double X,
        [property: JsonPropertyName("y")] double Y,
        [property: JsonPropertyName("width")] double Width,
        [property: JsonPropertyName("height")] double Height);
}

internal sealed record PdfGenerationProgressPayload(
    Guid UploadId,
    Guid UploadedBy,
    string Status,
    int ProgressPercent,
    string Stage,
    string Message,
    int? PassageNumber,
    int? TotalPassages,
    Guid? ExamId,
    string? ClientRequestId);
