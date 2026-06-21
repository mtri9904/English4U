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

    private static string BuildUserPrompt(string passageText) => $$"""
        Dưới đây là văn bản thô của một phần thi IELTS Reading. Hãy phân tích và trả về cấu trúc JSON theo đúng định dạng sau:

        {
          "passage_title": "Tiêu đề bài đọc",
          "passage_content": "Toàn bộ nội dung bài đọc, chia thành các đoạn văn bằng ký tự xuống dòng \n\n",
          "questions": [
            {
              "question_number": "Số thứ tự câu hỏi (ví dụ: 1, 2, 3...)",
              "question_type": "Loại câu hỏi (MultipleChoice / MultipleChoiceMultiple / MultipleChoiceChooseN / TrueFalseNotGiven / YesNoNotGiven / FillInBlanks / MatchingInfo / MatchingHeadings / MatchingFeatures / MatchingVisuals / FlowchartCompletion / MapLabelling)",
              "question_text": "Nội dung câu hỏi",
              "options": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C"],
              "answer": "Đáp án chính xác được trích xuất (nếu văn bản có đính kèm đáp án)",
              "explanation": "Giải thích ngắn vì sao chọn đáp án, lấy từ Review and Explanations nếu có, nếu không có thì để chuỗi rỗng"
            }
          ]
        }

        QUY TẮC CỨNG:
        - Bạn chỉ là bộ máy trích xuất dữ liệu, KHÔNG phải thí sinh làm bài.
        - QUY TRÌNH XỬ LÝ CÂU HỎI VÀ CHIA NHÓM: BẮT BUỘC tuân thủ theo đúng thứ tự BƯỚC 1 -> BƯỚC 2 -> BƯỚC 3 dưới đây, không được đảo thứ tự.
        - BƯỚC 1 - XÁC ĐỊNH RANH GIỚI NHÓM BẰNG TỪ KHÓA: BẮT BUỘC dùng cụm "Questions X-Y" trong raw text để làm mốc cắt group. Có bao nhiêu cụm "Questions X-Y" thì tạo bấy nhiêu group. TUYỆT ĐỐI không được gộp 18-22 với 23-26.
        - BƯỚC 2 - TÁCH BẠCH INSTRUCTION VÀ ĐỀ BÀI: ngay bên dưới "Questions X-Y" là instruction của group. PHẢI copy nguyên văn instruction này vào field instruction của group. PHẢI dừng lấy instruction ngay khi gặp số thứ tự câu hỏi đầu tiên (ví dụ 31). KHÔNG ĐƯỢC nhét instruction vào question_text của câu đầu tiên.
        - BƯỚC 3 - XỬ LÝ MCQ_CHOOSE_N: nếu group "Questions X-Y" có NHIỀU câu con đánh số và mỗi câu yêu cầu chọn đáp án đúng/các đáp án đúng, PHẢI giữ toàn bộ dải đó trong MỘT GROUP DUY NHẤT có question_type = MultipleChoiceChooseN. KHÔNG ĐƯỢC xé thành nhiều group nhỏ khác loại. Trong group đó, các câu con 18,19,20,21,22 vẫn phải giữ nguyên numbering riêng theo schema hiện tại. Nếu block dùng chung một answer bank A-H/A-F thì mọi câu cùng dùng shared options đó; nếu mỗi câu có option riêng thì phải giữ option riêng cho từng câu.
        - IGNORE GLOBAL HEADER: TUYỆT ĐỐI KHÔNG dùng cụm "Questions X-Y" nếu nó nằm trong câu mồi kiểu "You should spend about 20 minutes..." hoặc "...which are based on Reading Passage..." vì đó không phải instruction block thật.
        - TAG CLUSTER RULE: nếu raw text bị dính kiểu "Questions 27-29Questions 30-34", phải coi toàn bộ dải tag liên tiếp đó là một cụm heading; instruction nằm sau tag cuối cùng của cụm, không nằm giữa passage.
        - STOP POINT RULE: khi cắt instruction, phải dừng NGAY trước số thứ tự câu hỏi đầu tiên kể cả khi bị dính chữ như "27What", "14but", hoặc "1 ".
        - SANITY CHECK: nếu phần instruction vừa bóc dài trên 1000 ký tự thì coi như đã bắt nhầm passage/content và phải bỏ cụm đó để tìm cụm "Questions X-Y" tiếp theo.
        - Giữ nguyên thứ tự câu hỏi gốc, không bỏ sót câu.
        - Giữ nguyên thứ tự lựa chọn A/B/C/... đúng như đề gốc, không được đảo vị trí.
        - Với passage_content: chỉ giữ ngắt đoạn thật bằng "\n\n"; mọi xuống dòng đơn bị đứt giữa câu phải nối lại bằng khoảng trắng để frontend tự word-wrap.
        - Với toàn bộ văn bản trích xuất (passage_content, câu hỏi, instruction, options): dùng Markdown cho định dạng, không chèn HTML.
        - Các phần chữ in đậm/in nghiêng trong tài liệu gốc (như tiêu đề, mốc thời gian **1876**, **1949**, **Today** hay các từ nhấn mạnh) BẮT BUỘC phải giữ nguyên bằng cú pháp Markdown tương ứng (**bold**, *italic*).
        - Với passage có nhãn đoạn A./B./C....: bắt buộc format theo mẫu `**A.**` rồi xuống dòng mới tới nội dung đoạn.
        - passage_content phải DỪNG NGAY khi bắt đầu phần câu hỏi (Questions..., Do the following statements..., Choose the correct answer..., Solution:, Review and Explanations...).
        - Tuyệt đối không để lọt footer/rác như "Access https://...", "page 3" vào passage_content.
        - QUY TẮC CHIA NHÓM CÂU HỎI (GROUP BOUNDARY): mỗi khi thấy tiêu đề "Questions X-Y", BẮT BUỘC đóng group hiện tại và mở một group mới chỉ cho đúng dải X-Y đó.
        - Nếu giữa tiêu đề "Questions X-Y" và câu hỏi thực tế có footer/rác như "Access https://...", "page 7", vẫn phải coi đó là cùng một block mới; bỏ qua hoàn toàn các dòng rác chen giữa.
        - TUYỆT ĐỐI KHÔNG gộp hai dải khác nhau thành một group lớn (ví dụ cấm gộp 18-22 và 23-26 thành group 18-26).
        - Phân tích question_type độc lập cho từng group "Questions X-Y"; question_type của group sau không được ghi đè group trước.
        - Với câu có cụm "Which paragraph contains", question_type bắt buộc là MatchingInfo (không phải MatchingHeadings).
        - Với nhóm instruction kiểu "The text has ... paragraphs (A-G)", ưu tiên phân loại MatchingHeadings.
        - Với câu có cụm "Choose the correct answer or answers", nếu group chỉ có 1 câu thì question_type bắt buộc là MultipleChoiceMultiple; nếu group có nhiều câu con đánh số thì question_type bắt buộc là MultipleChoiceChooseN.
        - Với nhóm instruction kiểu "FIVE of the following statements are true... in any order", question_type bắt buộc là MultipleChoiceChooseN.
        - Ký tự checkbox/ô vuông như "☐", "☑", "☒", "□" chỉ là rác layout PDF; phải bỏ qua hoàn toàn khi xác định question_type và khi trích xuất option text.
        - QUY TẮC CHỐNG LỆCH SỐ CÂU: với dạng Choose N statements cho dải câu (ví dụ 18-22), BẮT BUỘC tách thành từng câu RIÊNG (18, 19, 20, 21, 22), không gộp thành một câu range.
        - Trong cùng block Choose N statements, question_text và danh sách options (A-H) của các câu có thể giống nhau; answer của từng câu phải map tuần tự theo Answer Key (ví dụ 18:A, 19:C, 20:D, 21:E, 22:H).
        - Nếu group 18-22 là MultipleChoiceChooseN thì phải giữ nguyên MultipleChoiceChooseN cho toàn group đó, kể cả khi group 23-26 phía sau là MultipleChoiceMultiple.
        - OPTION TEXT MANDATORY: với MultipleChoiceChooseN, mảng options TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ chứa chữ cái trần "A", "B", "C", "D"...; mỗi option bắt buộc phải có đầy đủ nội dung text.
        - Nếu raw text của block MultipleChoiceChooseN bị dính kiểu "A B C D E F G H" và đây là shared answer bank của group, BẠN BẮT BUỘC phải kéo xuống phần "Review and Explanations" để khôi phục đầy đủ nội dung của từng option.
        - Trả về ["A", "B", "C"] hoặc checkbox không có text bên cạnh là LỖI NGHIÊM TRỌNG; output đúng phải có dạng ["A. ...", "B. ...", "C. ..."] hoặc text đầy đủ tương đương.
        - Không được làm thay đổi/sụp số thứ tự câu hỏi; phải giữ nguyên numbering như văn bản nguồn.
        - Nếu một block là TRUE/FALSE/NOT GIVEN thì toàn block phải cùng loại TrueFalseNotGiven; không tự đổi sang YesNoNotGiven.
        - Không được lặp lại instruction chung vào từng question_text; question_text chỉ chứa nội dung riêng của câu đó.
        - Với dạng chọn letter, options phải là nội dung đầy đủ, không chỉ trả nhãn A/B/C.
        - Nếu options bị thiếu nội dung (chỉ còn nhãn A/B/C hoặc rỗng), bắt buộc dò trong phần Review and Explanations của cùng passage để khôi phục.
        - Cấm tuyệt đối tạo options rỗng cho câu MCQ (MCQ_SINGLE/MCQ_MULTIPLE/MCQ_CHOOSE_N).
        - Với MultipleChoiceChooseN, mỗi question là một câu con riêng trong cùng group; mỗi question có thể có 1 hoặc nhiều đáp án đúng. Nếu block dùng chung một answer bank thì options có thể giống nhau giữa các câu; nếu không thì mỗi câu giữ option riêng.
        - QUY TẮC SỐNG CÒN CHO MCQ: TUYỆT ĐỐI KHÔNG BAO GIỜ được tạo option rỗng (chỉ có A/B/C không có nội dung).
        - Nếu text câu hỏi bị mất nội dung options, BẮT BUỘC kéo xuống "Review and Explanations" để khôi phục text cho TẤT CẢ options trước khi sang câu tiếp theo.
        - LUẬT CHỐNG LỖI DÍNH CỘT PDF: nếu thấy cụm nhãn bị gom kiểu "A B C D E F G H" rồi sau đó là một khối câu dính liền, phải tự tách khối câu thành các mệnh đề riêng (dựa vào dấu chấm câu/chữ hoa đầu câu) và map tuần tự vào A, B, C, D... theo đúng thứ tự.
        - Ví dụ: "A B C D Câu một.Câu hai.Câu ba.Câu bốn." => ["A. Câu một.", "B. Câu hai.", "C. Câu ba.", "D. Câu bốn."].
        - CẢNH BÁO LỖI LẮP SAI OPTIONS: tuyệt đối không lắp text option của câu này sang câu khác.
        - Khi khôi phục options phải bám đúng question_number, đối chiếu đúng phần review/explanations của chính câu đó.
        - Không tự thêm bớt lựa chọn (ví dụ đề chỉ A,B,C thì không được tạo thêm D).
        - Ví dụ dạng "So, the answer ... must be A. mornings" => phải khôi phục option A là "mornings" cho câu tương ứng.
        - Với dạng điền từ/câu hoàn thành, phải giữ dấu chỗ trống bằng "___" đúng vị trí trong câu hỏi.
        - Tuyệt đối không tự giải đề hay tự suy luận đáp án.
        - Answer phải lấy ưu tiên từ "Review and Explanations".
        - Nghiêm cấm dùng chuỗi "Solution:" bị dính chữ (ví dụ 1C2D3F... hoặc 1822A,C,D,E,H) làm nguồn đáp án.
        - Explanation phải trích xuất từ phần Review and Explanations; không tự bịa hoặc tự viết mới.
        - Không paraphrase đáp án điền từ; phải giữ nguyên đúng từ trong nguồn.
        - Tự động sửa lỗi dính chữ do OCR/PDF (missing spaces), ví dụ "tolearn" -> "to learn", nhưng không đổi nghĩa.
        - QUY TẮC PHÂN BIỆT MAP/FLOWCHART/DIAGRAM THỰC TẾ:
          + Chỉ phân loại là FlowchartCompletion khi trong sơ đồ hình vẽ/flowchart có chứa số câu hỏi trực tiếp (ví dụ vẽ các ô trống đánh số 1, 2, 3... hoặc Q1, Q2, Q3... trong các bước của sơ đồ để điền từ).
          + Bắt buộc phân loại là MapLabelling khi trong hình vẽ/sơ đồ/bản đồ KHÔNG có số câu hỏi Q1, Q2... vẽ trực tiếp trên đó (hình vẽ chỉ có các nhãn chữ cái A, B, C... để người dùng dán nhãn, còn danh sách các câu hỏi 1, 2, 3... là các nhãn chữ nằm ở bên dưới hình vẽ, yêu cầu người dùng chọn chữ cái A-G tương ứng cho từng bộ phận).
          + Nếu đề thi chỉ là các câu điền từ/timeline viết tuần tự thông thường kể cả khi được bao quanh bởi một cái khung viền hình chữ nhật (không phải hình vẽ/sơ đồ thật), bạn BẮT BUỘC phải phân loại là FillInBlanks (hoặc SummaryCompletion nếu có word bank).
        - QUY TẮC BẮT BUỘC VỀ QUESTION_TEXT CHO CÁC DẠNG ĐIỀN TỪ (FillInBlanks/SummaryCompletion/TableCompletion/FlowchartCompletion):
          + question_text phải chứa TOÀN BỘ nội dung gốc của câu đó từ PDF: kể cả các phần in đậm (**bold**), in nghiêng (*italic*), xuống dòng (\n), các dấu hiệu như tiêu đề con, nhãn bên trong câu, ký tự xuống hàng thật.
          + Nếu câu trong PDF gồm nhiều dòng (ví dụ có label "Year:", "Event:", rồi xuống dòng tiếp), toàn bộ phải nằm trong question_text với ký tự \n đúng vị trí.
          + Nếu trong câu có từ in đậm hoặc in nghiêng theo đề gốc, PHẢI giữ lại bằng cú pháp Markdown (**bold**, *italic*) tương ứng.
          + KHÔNG ĐƯỢC cắt bớt, lược bỏ, hay chỉ lấy một phần câu; question_text phải là bản sao NGUYÊN VẸN của toàn bộ text câu đó trong PDF.

        Nội dung văn bản thô cần xử lý:
        {{passageText}}
        """;

    private static string BuildGemmaCompatiblePrompt(string passageText) => $$"""
        You extract IELTS Reading data from SOURCE_TEXT.
        Return ONLY valid JSON. No markdown fences. No explanation.
        Do not answer questions yourself. Do not invent missing text/options/answers.
        Copy question text/options/answers only when they appear in SOURCE_TEXT.
        If an answer is not explicitly present in Solution/Answer Key/Review, use "".

        JSON schema:
        {
          "passage_title": "",
          "passage_content": "",
          "questions": [
            {
              "question_number": "1",
              "question_type": "MultipleChoice|MultipleChoiceMultiple|MultipleChoiceChooseN|TrueFalseNotGiven|YesNoNotGiven|FillInBlanks|MatchingInfo|MatchingHeadings|MatchingFeatures|MatchingVisuals|FlowchartCompletion|MapLabelling",
              "question_text": "",
              "options": [],
              "answer": "",
              "explanation": ""
            }
          ]
        }

        Rules:
        - Keep original question numbering.
        - Preserve visual formatting: For all extracted text (passage_content, question_text, options, instructions), if any word, heading, or number is in BOLD in the source text, you MUST enclose it in markdown bold syntax like **bold_text** (e.g. **1876**, **1949**, **Today**). If in ITALICS, use markdown italic syntax like *italic_text*.
        - Use "Questions X-Y" boundaries from SOURCE_TEXT.
        - MCQ options must include real option text, not only A/B/C labels.
        - For Matching/Classification questions with a letter-to-entity map (e.g. "Write: A - for Dr. Aplin, B - for Dr. Roberts..."), you MUST classify them as "MatchingFeatures", and copy the full mapping list into the "options" array of EACH question in that group (e.g. ["A - for Dr. Aplin", "B - for Dr. Roberts", "C - for Dr. Speare"] or ["A. Dr. Aplin", "B. Dr. Roberts", "C. Dr. Speare"]). DO NOT leave "options" empty for these questions.
        - IMPORTANT: Under no circumstances should you generate or add paragraph labels (A, B, C, etc.) if the SOURCE_TEXT paragraphs do not already have them. Only output paragraph labels if they are explicitly present at the beginning of paragraphs in the SOURCE_TEXT. If the SOURCE_TEXT is a normal passage without paragraph labels, keep it strictly as normal paragraphs without adding any labels.
        - In passage_content, check paragraph endings: OCR often glues the next paragraph's label (e.g. "B.", "C.", or "**B.**") to the end of the current paragraph. You MUST strip this trailing next-paragraph label from the end of the current paragraph.
        - For structured paragraphs starting with a label (e.g. A, B, C...), format it strictly as "**A.**" on a new line followed by the paragraph text. Avoid duplicate standalone labels like "A." followed by "**A.**" for the same paragraph.
        - For completion questions (FlowchartCompletion, MapLabelling, FillInBlanks, SummaryCompletion, TableCompletion): Each question object in the JSON MUST contain its own independent "question_text" corresponding to ONLY that specific question number (e.g. Q1 contains "[Q1] Z-axis motor", Q2 contains "[Q2] hot end of extruder", etc.). You MUST NOT concatenate or repeat the entire text block of the group into each question object. Keep them strictly separated.
        - Do not repeat passage_title inside passage_content.
        - Preserve real paragraph breaks in passage_content. If the passage has normal paragraphs without A/B/C labels, keep each paragraph separated by a newline.
        - passage_content must stop before Questions/Solution/Review sections.
        - Preserve blanks as ___.
        - Only classify as FlowchartCompletion if the diagram/flowchart in the PDF contains explicit question numbers/labels inside the drawing itself (e.g. numbered boxes 1, 2, 3... or Q1, Q2, Q3... inside the flowchart/drawing steps for candidates to fill in).
        - Must classify as MapLabelling if the diagram/map drawing does NOT contain question numbers (the drawing only has lettered labels A, B, C... pointing to parts, and the questions 1, 2, 3... are listed below the drawing as text labels like "Z-axis motor", asking candidates to match the correct letter for each part).
        - If questions are simply running sentences (even if wrapped in a rectangular border box or timeline box without real drawings/diagrams), classify them as FillInBlanks/SummaryCompletion.
        - MANDATORY RULE FOR QUESTION_TEXT IN COMPLETION TYPES (FillInBlanks/SummaryCompletion/TableCompletion/FlowchartCompletion/SentenceCompletion):
          + question_text MUST contain the COMPLETE original text of that specific question from the PDF source, including any bold (**bold**), italic (*italic*), real line breaks (\n), sub-labels, or inline headings that appear within the sentence.
          + If a question in the PDF spans multiple lines (e.g. "Year: \n Event: \n ___"), ALL lines must be included in question_text with \n preserving the line structure.
          + Bold or italic formatting found in the original source MUST be kept using Markdown (**bold**, *italic**) syntax.
          + NEVER truncate, omit, or extract only part of the sentence. question_text must be a VERBATIM copy of the entire sentence block for that question number.

        SOURCE_TEXT:
        {{passageText}}
        """;
}
