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
using EnglishExamApp.Application.Realtime;
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

    private static string BuildRawReviewStructurePrompt(
        string rawText,
        IReadOnlyList<string> deterministicPassages,
        string answerZone,
        string reviewZone)
    {
        var candidatePassages = deterministicPassages.Count == 0
            ? "[NONE]"
            : string.Join(
                "\n\n---\n\n",
                deterministicPassages.Select((passage, index) =>
                    $"[PASSAGE_CANDIDATE_{index + 1}]\n{passage}"));

        return $$"""
            Bạn là hệ thống review text thô IELTS Reading sau khi scan PDF.

            Nhiệm vụ:
            1. Từ text thô và các candidate có sẵn, chia tài liệu thành 3 passage nếu có thể.
            2. Tách riêng phần solution/answer section.
            3. Tách riêng phần review and explanations nếu có.

            Trả về DUY NHẤT JSON thuần với schema:
            {
              "passages": [
                {
                  "passage_number": 1,
                  "title": "Reading Passage 1",
                  "question_range": "Questions 1-13",
                  "raw_text": "exact raw text for the full passage block"
                }
              ],
              "solution_section_raw": "exact raw text",
              "review_section_raw": "exact raw text"
            }

            Quy tắc bắt buộc:
            - Copy nguyên văn raw_text từ nguồn, không paraphrase.
            - Nếu title không rõ, dùng "Reading Passage X".
            - Nếu question_range không chắc, để chuỗi rỗng.
            - solution_section_raw chỉ chứa phần solution/answer key, CHỈ gồm đáp án; không được nuốt sang review/explanations.
            - review_section_raw chỉ chứa phần review/explanations.
            - Không thêm markdown fence, không giải thích.

            RAW_TEXT:
            {{rawText}}

            DETERMINISTIC_PASSAGE_CANDIDATES:
            {{candidatePassages}}

            DETERMINISTIC_SOLUTION_SECTION:
            {{answerZone}}

            DETERMINISTIC_REVIEW_SECTION:
            {{reviewZone}}
            """;
    }

    private static string BuildPassageQuestionGroupReviewPrompt(
        PdfRawReviewPassageSeedDto passage,
        IReadOnlyList<QuestionGroupReviewContextBlock> reviewBlocks)
    {
        var deterministicGroupSeeds = reviewBlocks.Count == 0
            ? "[NONE]"
            : string.Join(
                "\n\n---\n\n",
                reviewBlocks.Select(block => $$"""
                    TAGS: {{block.Tags}}
                    INSTRUCTION: {{block.Instruction}}
                    QUESTION_PREVIEW:
                    {{block.QuestionPreview ?? "[EMPTY]"}}
                    HEURISTIC_GROUP_TYPE: {{block.HeuristicGroupType ?? "[UNKNOWN]"}}
                    HEURISTIC_EVIDENCE: {{block.TypeEvidence ?? "[NONE]"}}
                    """));

        return $$"""
        Bạn là hệ thống bóc instruction IELTS Reading từ text thô của MỘT passage.

        Trả về DUY NHẤT JSON thuần với schema:
        {
          "question_groups": [
            {
              "start_question": 1,
              "end_question": 4,
              "tags": "Questions 1-4",
              "instruction": "Complete the summary below. Choose NO MORE THAN TWO WORDS...",
              "group_type": "SUMMARY_COMPLETION",
              "question_preview": "14 plant ... 15 ... A B C D ...",
              "type_evidence": "Detected from instruction + actual question wording + option layout."
            }
          ]
        }

        Quy tắc:
        - Chỉ extract instruction của nhóm câu hỏi, không lấy nội dung câu hỏi.
        - Bỏ qua global header kiểu "You should spend about 20 minutes..."
        - Nếu gặp cụm dính như "Questions 1-4Questions 5-6", phải tách đúng boundary.
        - instruction phải dừng ngay trước câu đầu tiên.
        - group_type phải được xác định bằng CẢ 3 nguồn: instruction, nội dung câu hỏi, và options/layout trong question block. KHÔNG được nhìn instruction một mình.
        - TAXONOMY RULE BẮT BUỘC:
          + Nếu instruction có chữ "summary" NHƯNG câu trả lời phải tự điền trực tiếp từ passage, không có word bank/options/list sẵn, hãy map về SENTENCE_COMPLETION.
          + Chỉ map SUMMARY_COMPLETION khi block "summary" có answer bank sẵn như list of words / answers from the box / write the correct letter A-F.
          + Cụm "Write the correct letter A-F" một mình KHÔNG đủ để map MATCHING_FEATURES. Nếu block là summary + word bank thì vẫn phải là SUMMARY_COMPLETION.
        - Nếu question block có list A-H/CATEGORY và câu hỏi dạng classify/match, phải cân nhắc MATCHING_FEATURES.
        - Nếu instruction kiểu "Choose one drawing (A-D) to match each ..." hoặc tương tự, có lựa chọn là hình/drawing/diagram/figure/projection dùng chung cho nhiều câu, hãy map MATCHING_VISUALS, không gộp vào MATCHING_FEATURES.
        - Nếu instruction là "Complete each sentence with the correct ending, A-E below" hoặc tương tự, và bên dưới có shared option list A-E/A-H cho nhiều câu, PHẢI coi đó là matching-type. Trong hệ thống này hãy map về MATCHING_FEATURES, KHÔNG được gán SENTENCE_COMPLETION.
        - Nếu instruction là "Choose ONE phrase from the list below (A-G) to complete each of the following sentences" hoặc tương tự, có shared phrase list và câu đánh số bên dưới, cũng phải coi là matching-type. Trong hệ thống này hãy map về MATCHING_FEATURES, KHÔNG được gán SENTENCE_COMPLETION.
        - Nếu question block có nhiều câu con đánh số và mỗi câu là dạng multiple choice, phải cân nhắc MCQ_CHOOSE_N. Shared option list A-H chỉ là một trường hợp con, không phải điều kiện bắt buộc.
        - Nếu instruction kiểu "According to the text, FIVE of the following statements are true. Write the corresponding letters in answer boxes ... in any order", phải map MCQ_CHOOSE_N, KHÔNG được map SUMMARY_COMPLETION.
        - Nếu instruction kiểu "Choose two letters, A-E" / "Choose three letters" / "Choose the correct answer or answers": nếu group chỉ có 1 câu thì map MCQ_MULTIPLE; nếu group có nhiều câu con đánh số thì map MCQ_CHOOSE_N.
        - Nếu instruction nêu rõ "write TRUE / FALSE / NOT GIVEN" hoặc "write YES / NO / NOT GIVEN", phải ưu tiên map TFNG hoặc YNNG trước các loại completion như TABLE_COMPLETION.
        - Chỉ map TFNG hoặc YNNG khi instruction hoặc answer labels nêu rõ TRUE/FALSE/NOT GIVEN hoặc YES/NO/NOT GIVEN. Không được map TFNG/YNNG chỉ vì block bị lẫn token từ phần khác.
        - group_type ưu tiên các loại: MATCHING_HEADINGS, MATCHING_INFO, MATCHING_FEATURES, MATCHING_VISUALS, MCQ_SINGLE, MCQ_MULTIPLE, MCQ_CHOOSE_N, SENTENCE_COMPLETION, SUMMARY_COMPLETION, TABLE_COMPLETION, FLOWCHART_COMPLETION, SHORT_ANSWER, TFNG, YNNG.
        - `question_preview` phải chứa snippet ngắn từ chính câu hỏi/options mà bạn dùng để phân loại type.
        - `type_evidence` phải nói ngắn gọn vì sao type đó được chọn dựa trên question/options.
        - Không thêm markdown fence, không giải thích.

        PASSAGE_NUMBER: {{passage.PassageNumber}}
        PASSAGE_TITLE: {{passage.Title}}
        QUESTION_RANGE_HINT: {{passage.QuestionRange}}

        DETERMINISTIC_GROUP_SEEDS:
        {{deterministicGroupSeeds}}

        PASSAGE_RAW_TEXT:
        {{passage.RawText}}
        """;
    }

    private static string BuildAnswerSectionReviewPrompt(string solutionSectionRaw) => $$"""
        Bạn là hệ thống bóc đáp án IELTS Reading từ text thô của phần solution/answer key.

        Trả về DUY NHẤT JSON thuần với schema:
        {
          "answers": [
            {
              "question_number": 1,
              "answer": "A"
            }
          ]
        }

        Quy tắc:
        - Chỉ lấy đáp án có trong nguồn.
        - answer giữ nguyên đúng text nguồn.
        - Nếu phần source chứa review/explanations dài dòng thì chỉ lấy đáp án, không copy giải thích vào answer.
        - Nếu một câu không có đáp án rõ ràng thì không trả câu đó.
        - Không giải thích, không markdown fence.

        SOLUTION_SECTION_RAW:
        {{solutionSectionRaw}}
        """;

    private static string BuildExplanationSectionReviewPrompt(string reviewSectionRaw) => $$"""
        Bạn là hệ thống bóc explanation IELTS Reading từ text thô của phần Review and Explanations.

        Trả về DUY NHẤT JSON thuần với schema:
        {
          "explanations": [
            {
              "question_number": 1,
              "answer": "A",
              "explanation": "exact explanation text from source"
            }
          ]
        }

        Quy tắc:
        - explanation phải bám đúng text nguồn, không tự viết mới.
        - Nếu có đáp án đi kèm thì map vào answer.
        - Nếu một câu không có explanation rõ ràng thì không trả câu đó.
        - Không giải thích ngoài JSON, không markdown fence.

        REVIEW_SECTION_RAW:
        {{reviewSectionRaw}}
        """;

    private const string SystemPrompt =
        """
        Bạn là hệ thống trích xuất dữ liệu IELTS Reading từ PDF.

        Yêu cầu BẮT BUỘC:

        Trả về kết quả duy nhất dưới dạng JSON thuần túy.
        Không giải thích, không thêm markdown/json fence, không thêm bất kỳ văn bản nào ngoài chuỗi JSON.
        CHỈ được phép trích xuất dữ liệu; TUYỆT ĐỐI không đóng vai thí sinh làm bài.
        QUY TRÌNH XỬ LÝ CÂU HỎI VÀ CHIA NHÓM: BẮT BUỘC tuân thủ theo đúng thứ tự BƯỚC 1 -> BƯỚC 2 -> BƯỚC 3.
        BƯỚC 1 - XÁC ĐỊNH RANH GIỚI NHÓM: dùng cụm "Questions X-Y" trong raw text làm group boundary duy nhất. Có bao nhiêu "Questions X-Y" thì phải có bấy nhiêu group. TUYỆT ĐỐI không gộp 18-22 với 23-26.
        BƯỚC 2 - TÁCH INSTRUCTION: dòng instruction nằm ngay dưới "Questions X-Y" phải được copy nguyên văn vào instruction của group. PHẢI dừng instruction khi gặp số thứ tự câu hỏi đầu tiên. KHÔNG ĐƯỢC nhét instruction vào question_text của câu đầu tiên.
        BƯỚC 3 - XỬ LÝ MCQ_CHOOSE_N: nếu một dải "Questions X-Y" có NHIỀU câu con đánh số và mỗi câu yêu cầu chọn đáp án đúng/các đáp án đúng, toàn bộ dải X-Y phải ở trong MỘT GROUP DUY NHẤT có question_type = MultipleChoiceChooseN. Không được xé dải đó thành nhiều group nhỏ khác loại. Các câu con bên trong group vẫn giữ numbering riêng (ví dụ 18,19,20,21,22). Nếu block dùng chung một answer bank A-H/A-F thì các câu trong group cùng chia sẻ answer bank đó; nếu mỗi câu có option riêng thì phải giữ option riêng cho từng câu.
        IGNORE GLOBAL HEADER: TUYỆT ĐỐI KHÔNG dùng cụm "Questions X-Y" nếu nó nằm trong câu mồi kiểu "You should spend about 20 minutes..." hoặc "...which are based on Reading Passage..." vì đó không phải instruction block thật.
        TAG CLUSTER RULE: nếu raw text bị dính kiểu "Questions 27-29Questions 30-34", phải coi toàn bộ dải tag liên tiếp đó là một cụm heading; instruction nằm sau tag cuối cùng của cụm.
        STOP POINT RULE: khi cắt instruction, phải dừng NGAY trước số thứ tự câu hỏi đầu tiên kể cả khi bị dính chữ như "27What", "14but", hoặc "1 ".
        SANITY CHECK: nếu instruction bóc ra dài trên 1000 ký tự thì coi như đã bắt nhầm passage/content và phải bỏ cụm đó.
        Nghiêm cấm tự suy luận đáp án từ passage.
        Mọi "answer" phải bám 100% theo Review and Explanations nếu có.
        Nếu không có đáp án rõ ràng trong nguồn, "answer" phải là chuỗi rỗng.
        Nghiêm cấm dùng chuỗi "Solution:" bị dính chữ (ví dụ 1C2D3F... hoặc 1822A,C,D,E,H) làm nguồn đáp án.
        Nếu có phần giải thích trong Review and Explanations thì phải map vào field "explanation" cho đúng số câu; nếu không có thì để chuỗi rỗng.
        Nếu options bị thiếu (chỉ còn A/B/C hoặc rỗng), bắt buộc tìm lại trong Review and Explanations.
        Với dạng Choose N statements theo dải câu (ví dụ 18-22), phải trả ra từng câu riêng đúng số thứ tự 18, 19, 20, 21, 22; không gộp thành một câu.
        Không được làm lệch numbering của câu hỏi so với văn bản nguồn.
        Với câu MCQ, options không được rỗng; nếu thiếu phải phục hồi từ Review and Explanations.
        QUY TẮC SỐNG CÒN CHO MCQ: nghiêm cấm trả option dạng nhãn trống "A"/"B"/"C" không có text.
        Nếu phần câu hỏi bị rớt text option do OCR/cột, bắt buộc đối chiếu chéo Review and Explanations để khôi phục đủ text cho từng option.
        Nếu gặp cụm nhãn dính cột kiểu "A B C D ... + khối câu dính", phải tự tách khối câu và map tuần tự vào từng nhãn theo thứ tự.
        CẢNH BÁO LỖI LẮP SAI OPTIONS: không được hoán đổi options giữa các câu; phải đối chiếu đúng theo question_number của chính câu đó.
        Không tự ý thêm/bớt option so với cấu trúc gốc của câu hỏi.
        Phân loại question_type theo instruction gốc:
        - "Which paragraph contains" => MatchingInfo.
        - "Choose the correct answer." => MultipleChoice.
        - "Choose the correct answer or answers" => nếu chỉ có 1 câu thì MultipleChoiceMultiple; nếu cùng instruction đó áp cho nhiều câu con trong cùng dải thì MultipleChoiceChooseN.
        - Block TRUE/FALSE/NOT GIVEN phải đồng nhất, không tự đổi sang YES/NO/NOT GIVEN.
        - FEW-SHOT TEMPLATE CẮT INSTRUCTION: raw "Complete the following sentences using NO MORE THAN THREE WORDS... Another example ... is 31" => instruction phải là "Complete the following sentences using NO MORE THAN THREE WORDS..." và question 31 phải là "Another example ... is ___".
        - FEW-SHOT TEMPLATE MCQ_CHOOSE_N: nếu raw "A B C D E F G H McCarthy claims... The cost... Most British..." là shared answer bank của cả group, options phải bung ra thành ["A. McCarthy claims ...", "B. The cost ...", "C. Most British ...", ...], không được để label trống.
        Giữ nguyên thứ tự câu hỏi và thứ tự options như đề gốc.
        Với passage_content, chỉ giữ ngắt đoạn thật bằng "\n\n"; xuống dòng đơn giữa câu phải nối lại thành khoảng trắng.
        passage_content phải dùng Markdown cho định dạng in đậm/in nghiêng khi cần, không dùng HTML.
        Các phần chữ nhấn mạnh trong nguồn phải được giữ lại bằng Markdown (**bold**, *italic*), không làm mất format.
        Với passage có nhãn đoạn A./B./C....: phải trả về dạng `**A.**` rồi xuống dòng mới tới nội dung đoạn.
        passage_content phải dừng ngay trước phần Questions/Solution/Review and Explanations.
        Không để lọt footer/rác như "Access https://..." hoặc "page 3" vào passage_content.
        Mỗi khi gặp heading "Questions X-Y", phải đóng block trước và mở block mới cho đúng dải X-Y đó; tuyệt đối không gộp 2 heading khác nhau thành một block lớn.
        Nếu có footer/rác như "Access https://..." hoặc "page 7" chen giữa heading "Questions X-Y" và câu đầu tiên, vẫn phải giữ nguyên boundary của block mới và bỏ qua các dòng rác.
        Phân tích question_type độc lập cho từng block "Questions X-Y"; block sau không được làm đổi question_type của block trước.
        Ký tự checkbox/ô vuông như "☐", "☑", "☒", "□" chỉ là rác layout PDF, không mang nghĩa câu hỏi hay option.
        OPTION TEXT MANDATORY: với MultipleChoiceChooseN, options TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ là "A", "B", "C"... mà phải có text đầy đủ cho từng option.
        Nếu raw text chỉ còn "A B C D E F G H" và block thật sự dùng shared answer bank, BẠN BẮT BUỘC phải kéo xuống "Review and Explanations" để khôi phục nguyên văn nội dung từng option.
        Việc trả về options rỗng, label-only, hoặc checkbox-only cho MultipleChoiceChooseN là LỖI NGHIÊM TRỌNG.
        Sửa lỗi dính chữ do OCR/PDF khi hiển nhiên (missing spaces), không thay đổi nghĩa.
        """;
}
