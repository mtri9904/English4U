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

    private static (string? GroupType, string? TypeEvidence) InferQuestionGroupTypeAndEvidence(
        string? instruction,
        string? questionPreview,
        string? blockText,
        string? fallbackGroupType,
        int? startQuestion = null,
        int? endQuestion = null)
    {
        var normalizedInstruction = Regex.Replace(instruction ?? string.Empty, @"\s+", " ").Trim();
        var normalizedQuestionPreview = Regex.Replace(questionPreview ?? string.Empty, @"\s+", " ").Trim();
        var normalizedBlockText = Regex.Replace(blockText ?? string.Empty, @"\s+", " ").Trim();
        var combined = Regex.Replace(
            string.Join("\n", [normalizedInstruction, normalizedQuestionPreview, normalizedBlockText]),
            @"\s+",
            " ").Trim();
        if (string.IsNullOrWhiteSpace(combined))
        {
            return (NormalizeGroupType(fallbackGroupType), null);
        }

        var upper = combined.ToUpperInvariant();
        var instructionScope = string.Join(" ", [normalizedInstruction, normalizedQuestionPreview]).Trim();
        var instructionText = string.IsNullOrWhiteSpace(normalizedInstruction) ? combined : normalizedInstruction;
        var explicitQuestionCount =
            startQuestion.HasValue &&
            endQuestion.HasValue &&
            endQuestion.Value >= startQuestion.Value
                ? endQuestion.Value - startQuestion.Value + 1
                : 0;
        var hasMultipleQuestionsInGroup = explicitQuestionCount > 1;
        var visibleQuestionPromptCount = CountVisibleGroupQuestionPromptMarkers(
            string.IsNullOrWhiteSpace(normalizedQuestionPreview)
                ? normalizedBlockText
                : normalizedQuestionPreview,
            startQuestion,
            endQuestion);
        var hasExplicitPerQuestionPrompts = visibleQuestionPromptCount > 0;
        var inlineDistinctOptionLabels = Regex.Matches(
                instructionText,
                @"(?<![A-Za-z0-9])(?<label>[A-H])\s+(?=[A-Z(])",
                RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Select(match => match.Groups["label"].Value[0])
            .Distinct()
            .Count();
        var distinctOptionLabels = Regex.Matches(blockText ?? string.Empty, @"(?im)^\s*[A-H]\s*[).:\-]?\s+\S")
            .Cast<Match>()
            .Select(match => match.Value.Trim()[0])
            .Distinct()
            .Count();
        var totalDistinctOptionLabels = Math.Max(distinctOptionLabels, inlineDistinctOptionLabels);
        var hasSharedOptionList = totalDistinctOptionLabels >= 3 ||
                                  Regex.IsMatch(combined, @"(?is)\bA\b.{0,40}\bB\b.{0,40}\bC\b(?:.{0,40}\bD\b)?");
        var hasExplicitLetterRangeInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\b(?:letters?|ending(?:s)?)\s*[A-H]\s*[-â€“]\s*[A-H]\b|\b[A-H]\s*[-â€“]\s*[A-H]\b");
        var hasSharedOptionMechanism = hasSharedOptionList || hasExplicitLetterRangeInstruction;
        var hasSelectableAnswerBank = hasSharedOptionMechanism ||
                                      Regex.IsMatch(
                                          combined,
                                          @"(?i)\blist\s+of\s+words\b|\bfrom\s+the\s+box\b|\bchoose\s+your\s+answers?\s+from\s+the\s+box\b|\bwrite\s+the\s+correct\s+letter\b");
        var hasSummaryInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+summary\b|\bsummary\b");
        var hasExplicitShortAnswerInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\banswer\s+the\s+(?:following\s+)?questions?\b|\bchoose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\b");
        var hasCompletionStyleInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\b|\bfill\s+in\s+the\s+blanks?\b|\blabel\s+the\b");
        var hasTableInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+table\b|\btable\s+below\b|\btable\s+completion\b");
        var hasGenericCompleteFollowingInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+following\s+using\b|\bcomplete\s+the\s+description\s+below\b");
        var hasSentenceEndingInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcorrect\s+ending\b|\bsentence\s+endings?\b");
        var hasTimelineDiagramCompletionInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+timeline\s+diagram\s+below\b");
        var hasGenericDiagramCompletionInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bcomplete\s+the\s+diagram\s+below\b");
        var hasTimelineMarkersInDiagramContent = Regex.IsMatch(
            string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
            @"(?i)\b(?:1[5-9]\d{2}|20\d{2})(?:s)?\b|\bToday\b|\bPresent\b|\bCurrent\b");
        var hasExplicitGapMarkersInQuestionBlock = Regex.IsMatch(
            string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
            @"_{2,}|\.{3,}|\bblank\b");
        var hasInterrogativeQuestionPrompts = Regex.IsMatch(
                string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
                @"\?") ||
            Regex.IsMatch(
                string.Join(" ", [normalizedQuestionPreview, normalizedBlockText]),
                @"(?i)(?:(?<=^)|(?<=\s)|(?<=\d\s))(?:what|which|when|where|who|whose|why|how)\b");
        var hasTableLikeBlock = Regex.IsMatch(
                combined,
                @"(?i)\bhemp\b.*\bmarijuana\b|\bfibre\b|\bdrug\s+content\b") ||
            Regex.Matches(
                blockText ?? string.Empty,
                @"(?im)^\s*[A-Za-z][A-Za-z\- ]{1,24}\s*$")
            .Count >= 2;
        var hasSharedPhraseListSentenceInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+phrase(?:s)?\b|\bphrase(?:s)?\s+from\s+the\s+list\b|\blist\s+of\s+phrases\b|\bthere\s+are\s+more\s+phrases\s+than\s+questions\b") &&
            Regex.IsMatch(
                instructionText,
                @"(?i)\bcomplete\s+each\s+of\s+the\s+following\s+sentences\b|\bcomplete\s+each\s+sentence\b|\bcomplete\s+the\s+following\s+sentences\b");
        var hasSharedClassificationListInstruction =
            Regex.IsMatch(
                instructionText,
                @"(?i)\b(?:from\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*)?classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\s+characteristic\s+of\b") ||
            (
                Regex.IsMatch(
                    instructionText,
                    @"(?i)\bchoose\s+the\s+.+?\s+from\s+the\s+list\s+[A-H](?:\s*[-â€“]\s*[A-H])?\s+below\b") &&
                Regex.IsMatch(
                    instructionText,
                    @"(?i)\bwhich\s+corresponds?\s+to\b|\baccording\s+to\s+the\s+findings\b|\bfindings?\s+of\s+the\s+study\b|\bbest\s+matches?\b"));
        var hasClassificationInstruction = Regex.IsMatch(
            instructionText,
            @"(?i)\b(?:from\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*)?classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\b|\bas\s+characteristic\s+of\b");
        var hasFlowchartLikeAnswerBankInstruction =
            hasSharedOptionMechanism &&
            Regex.IsMatch(
                instructionText,
                @"(?i)\bre-?order\s+the\s+following\s+letters?\b|\bshow\s+the\s+sequence\s+of\s+events\b");
        var hasFlowchartLikePlaceholderRun =
            Regex.IsMatch(normalizedQuestionPreview, @"^(?:\d{1,2}\s+){2,}\d{1,2}$") ||
            Regex.IsMatch(
                normalizedBlockText,
                @"(?i)\bthe\s+first\s+one\s+has\s+been\s+done\s+for\s+you\s+as\s+an\s+example\b");
        var hasMatchingFeaturesInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\blook\s+at\s+the\s+following\s+statements\b|\bmatch\s+each\s+statement\s+to\s+the\s+correct\s+(?:person|people|researcher|researchers|country|countries|category|categories|group|groups|option|options)\b|\blist\s+of\s+(?:people|researchers|countries|categories|groups|options)\b|\byou\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\b|\bthere\s+may\s+be\s+more\s+than\s+one\s+correct\s+answer\b|\buse\s+the\s+information\s+in\s+the\s+(?:text|passage)\s+to\s+match\b|\bwith\s+the\s+(?:characteristics|statements|descriptions?|features|opinions)\s+(?:listed\s+)?below\b");
        var hasTfngInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bdo\s+the\s+following\s+statements\b|\btrue\s*\/\s*false\s*\/\s*not\s+given\b|\btrue\s+false\s+not\s+given\b|\bwrite\s*:\s*true\b|\bwrite\s+true\b|\bwrite\s+true\s+if\b|\bwrite\s+false\s+if\b|\bnot\s+given\s+if\b");
        var hasYnngInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bdo\s+the\s+following\s+statements\b|\byes\s*\/\s*no\s*\/\s*not\s+given\b|\byes\s+no\s+not\s+given\b|\bwrite\s*:\s*yes\b|\bwrite\s+yes\b|\bwrite\s+yes\s+if\b|\bwrite\s+no\s+if\b|\bnot\s+given\s+if\b");
        var hasMcqMultipleInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\b|\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+letters?\b|\bchoose\s+\w+\s+letters?\b");
        var hasOnlyOneChoiceInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b");
        var hasMcqSingleInstruction = Regex.IsMatch(
            string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
            @"(?i)\bchoose\s+the\s+correct\s+letter\b|\bchoose\s+the\s+correct\s+answer(?!\s+or\s+answers?)\b|\bcircle\s+the\s+correct\s+answer\b|\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b");
        var hasGenericChooseLettersInstruction =
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bwhich\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+of\s+the\s+following\b") &&
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+letters?\b");
        var hasChooseNStatementsInstruction =
            !hasOnlyOneChoiceInstruction &&
            hasSharedOptionMechanism &&
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\b(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+of\s+the\s+following\s+statements\s+are\s+(?:true|correct)\b|\bwrite\s+the\s+corresponding\s+letters\b|\bin\s+any\s+order\b");
        var hasSharedMultiSelectAnswerBoxes =
            explicitQuestionCount > 1 &&
            hasSharedOptionMechanism &&
            !hasExplicitPerQuestionPrompts &&
            (hasChooseNStatementsInstruction || hasGenericChooseLettersInstruction || hasMcqMultipleInstruction);

        if (Regex.IsMatch(instructionText, @"(?i)\bchoose\s+the\s+most\s+suitable\s+heading\b|\blist\s+of\s+headings\b"))
        {
            return ("MATCHING_HEADINGS", "Detected from instruction and block: list of headings / suitable heading pattern.");
        }

        if (Regex.IsMatch(instructionText, @"(?i)\bwhich\s+paragraphs?\s+contain(?:s)?\b|\bwhich\s+section\s+contains\b"))
        {
            return ("MATCHING_INFO", "Detected from question wording: which paragraph/section contains.");
        }

        if (hasTfngInstruction && upper.Contains("TRUE") && upper.Contains("FALSE") && upper.Contains("NOT GIVEN"))
        {
            return ("TFNG", "Detected from explicit TRUE/FALSE/NOT GIVEN instruction.");
        }

        if (hasYnngInstruction && upper.Contains("YES") && upper.Contains("NO") && upper.Contains("NOT GIVEN"))
        {
            return ("YNNG", "Detected from explicit YES/NO/NOT GIVEN instruction.");
        }

        if (hasChooseNStatementsInstruction)
        {
            return hasSharedMultiSelectAnswerBoxes
                ? ("MCQ_MULTIPLE", "Detected from choose-N instruction with a shared option bank and answer boxes, without explicit per-question stems.")
                : ("MCQ_CHOOSE_N", "Detected from multi-question choose-N instruction; the group contains several numbered questions that require one or more correct answers.");
        }

        if (hasGenericChooseLettersInstruction)
        {
            if (hasSharedMultiSelectAnswerBoxes)
            {
                return ("MCQ_MULTIPLE", "Detected from choose-letters instruction with shared options and answer boxes, without explicit per-question stems.");
            }

            return hasMultipleQuestionsInGroup
                ? ("MCQ_CHOOSE_N", "Detected from multi-question choose-letters instruction; each question in the range uses lettered choices.")
                : ("MCQ_MULTIPLE", "Detected from single-question choose-letters instruction with multiple correct answers.");
        }

        if (hasSummaryInstruction)
        {
            return (hasSelectableAnswerBank || hasExplicitLetterRangeInstruction)
                ? ("SUMMARY_COMPLETION", "Detected from summary instruction plus selectable answer bank/list of words/options.")
                : ("SENTENCE_COMPLETION", "Detected from summary text without any selectable answer bank; answers must be supplied directly from the passage.");
        }

        if (Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|\d+)\s+(?:drawing|drawings|diagram|diagrams|figure|figures|image|images|picture|pictures|map|maps|plan|plans|projection|projections)\b") &&
            Regex.IsMatch(
                string.IsNullOrWhiteSpace(instructionScope) ? combined : instructionScope,
                @"(?i)\bmatch\s+each\b|\bto\s+match\s+each\b|\bcorresponds?\s+to\b|\bprojection\s+types?\b"))
        {
            return ("MATCHING_VISUALS", "Detected from choose-a-drawing/diagram instruction plus shared visual option set.");
        }

        if (hasFlowchartLikeAnswerBankInstruction && hasFlowchartLikePlaceholderRun)
        {
            return ("FLOWCHART_COMPLETION", "Detected from reordered-letter instruction plus flowchart-style numbered placeholders and shared answer bank.");
        }

        if (hasMatchingFeaturesInstruction)
        {
            return ("MATCHING_FEATURES", "Detected from matching-features instruction: statements must be matched to named people/researchers/categories, possibly with repeated letters.");
        }

        if (hasSharedClassificationListInstruction && hasSharedOptionMechanism)
        {
            return ("MATCHING_FEATURES", "Detected from choose-from-list instruction plus shared lettered answer bank used across multiple numbered items.");
        }

        if (hasClassificationInstruction ||
            Regex.IsMatch(combined, @"(?i)\bclassify\s+the\s+following(?:\s*\([^)]+\))?\s+as\b|\bmatch\s+one\s+of\s+the\b|\bwhich\s+researcher\b|\bwhich\s+category\b"))
        {
            return ("MATCHING_FEATURES", "Detected from question block: classification/matching to named categories or people.");
        }

        if (hasSentenceEndingInstruction && hasSharedOptionMechanism)
        {
            return ("MATCHING_FEATURES", "Detected from explicit sentence-ending wording plus shared option list; this is not fill-in-the-blank sentence completion.");
        }

        if (hasSharedPhraseListSentenceInstruction && hasSharedOptionMechanism)
        {
            return ("MATCHING_FEATURES", "Detected from shared phrase list plus numbered sentence stems; this is matching-type, not direct sentence completion.");
        }

        if (hasTableInstruction)
        {
            return (hasSelectableAnswerBank || hasSharedOptionMechanism)
                ? ("MATCHING_TABLE", "Detected from instruction: table completion plus selectable answer bank/list of words/options.")
                : ("TABLE_COMPLETION", "Detected from instruction: table completion.");
        }

        if (hasGenericCompleteFollowingInstruction && hasTableLikeBlock)
        {
            return (hasSelectableAnswerBank || hasSharedOptionMechanism)
                ? ("MATCHING_TABLE", "Detected from generic complete-the-following instruction plus table-like headers/content structure and selectable answer bank/options.")
                : ("TABLE_COMPLETION", "Detected from generic complete-the-following instruction plus table-like headers/content structure.");
        }

        if (Regex.IsMatch(instructionText, @"(?i)\blabel\s+the\s+(diagram|map)\b"))
        {
            return ("MAP_LABELLING", "Detected from instruction: label the diagram/map.");
        }

        if (hasTimelineDiagramCompletionInstruction ||
            (hasGenericDiagramCompletionInstruction && hasTimelineMarkersInDiagramContent))
        {
            return ("SENTENCE_COMPLETION", "Detected from diagram wording plus timeline/chronology markers; this remains text-based sentence completion.");
        }

        if (hasGenericDiagramCompletionInstruction)
        {
            return ("MAP_LABELLING", "Detected from instruction: complete the diagram below, without timeline markers.");
        }

        if (Regex.IsMatch(combined, @"(?i)\bflow[\s-]?chart\b"))
        {
            return hasSelectableAnswerBank || hasExplicitLetterRangeInstruction
                ? ("FLOWCHART_COMPLETION", "Detected from flowchart instruction plus shared answer bank / lettered option set.")
                : ("FLOWCHART_COMPLETION", "Detected from instruction: flowchart completion.");
        }

        if (hasExplicitShortAnswerInstruction &&
            (!hasCompletionStyleInstruction || hasInterrogativeQuestionPrompts) &&
            !hasExplicitGapMarkersInQuestionBlock)
        {
            return ("SHORT_ANSWER", "Detected from explicit short-answer instruction without sentence-template gap placeholders.");
        }

        if (Regex.IsMatch(combined, @"(?i)\bshort\s+answer\b|\banswer\s+the\s+questions?\s+below\b"))
        {
            return ("SHORT_ANSWER", "Detected from instruction/question wording: short answer format.");
        }

        if (hasMcqMultipleInstruction)
        {
            if (hasSharedMultiSelectAnswerBoxes)
            {
                return ("MCQ_MULTIPLE", "Detected from shared multi-select instruction with answer boxes and no explicit per-question stems.");
            }

            if (hasMultipleQuestionsInGroup && !hasExplicitPerQuestionPrompts)
            {
                return ("MCQ_CHOOSE_N", "Detected from multi-question instruction/question wording: each question may have multiple correct answers.");
            }

            return ("MCQ_MULTIPLE", "Detected from instruction/question wording: multiple correct answers per question.");
        }

        if (hasMultipleQuestionsInGroup && hasMcqSingleInstruction && hasSharedOptionList && totalDistinctOptionLabels >= 5)
        {
            return ("MCQ_CHOOSE_N", "Detected from multi-question block with a shared option list and numbered prompts/statements.");
        }

        if (hasMcqSingleInstruction)
        {
            return ("MCQ_SINGLE", "Detected from question block: single-choice instruction with lettered options.");
        }

        if (Regex.IsMatch(combined, @"(?i)\bcomplete\s+the\s+sentences?\b|\bfill\s+in\s+the\s+blanks?\b|\bno\s+more\s+than\b|\bchoose\s+your\s+answers?\s+from\s+the\s+box\b"))
        {
            return ("SENTENCE_COMPLETION", "Detected from instruction and blanks/word-limit pattern.");
        }

        return (NormalizeGroupType(fallbackGroupType), string.IsNullOrWhiteSpace(fallbackGroupType)
            ? null
            : "Fallback to parser/AI group type because question block did not match a stronger heuristic.");
    }

    private static string? NormalizeGroupType(string? groupType)
    {
        if (string.IsNullOrWhiteSpace(groupType))
        {
            return null;
        }

        var normalized = groupType
            .Trim()
            .Replace(' ', '_')
            .Replace('-', '_')
            .ToUpperInvariant();

        return normalized switch
        {
            "MULTIPLECHOICE" or "MULTIPLE_CHOICE" or "MCQ" or "MCQ_SINGLE_CHOICE" => "MCQ_SINGLE",
            "MULTIPLECHOICE_MULTIPLE" or "MULTIPLE_CHOICE_MULTIPLE" or "MCQ_MULTI" => "MCQ_MULTIPLE",
            "FILLINBLANKS" or "FILL_IN_BLANKS" or "FILLINBLANK" or "FILL_IN_BLANK" or "SENTENCECOMPLETION" => "SENTENCE_COMPLETION",
            "SUMMARYCOMPLETION" => "SUMMARY_COMPLETION",
            "TABLECOMPLETION" => "TABLE_COMPLETION",
            "MATCHINGTABLE" => "MATCHING_TABLE",
            "MATCHING_INFORMATION" => "MATCHING_INFO",
            "MATCHING_ENDINGS" or "SENTENCE_ENDINGS" or "MATCHING_SENTENCE_ENDINGS" => "MATCHING_FEATURES",
            "MATCHING_CLASSIFICATION" or "CLASSIFICATION" => "MATCHING_FEATURES",
            "MATCHING_VISUALS" or "MATCHING_DRAWINGS" or "MATCHING_IMAGES" or "MATCHING_PROJECTIONS" => "MATCHING_VISUALS",
            "MAP_LABELLING" or "MAP_LABELING" or "DIAGRAM_LABELLING" or "DIAGRAM_LABELING" => "MAP_LABELLING",
            _ => normalized
        };
    }

    private static int CountVisibleGroupQuestionPromptMarkers(string? text, int? startQuestion, int? endQuestion)
    {
        if (string.IsNullOrWhiteSpace(text) ||
            !startQuestion.HasValue ||
            !endQuestion.HasValue ||
            endQuestion.Value < startQuestion.Value)
        {
            return 0;
        }

        var count = 0;
        for (var questionNumber = startQuestion.Value; questionNumber <= endQuestion.Value; questionNumber++)
        {
            if (Regex.IsMatch(
                    text,
                    $@"(?<![A-Za-z0-9]){Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture))}(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'â€œâ€˜(\[])",
                    RegexOptions.IgnoreCase))
            {
                count++;
            }
        }

        return count;
    }
}
