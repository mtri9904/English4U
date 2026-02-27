using System.Security.Claims;
using System.Text.Json;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using EnglishLearningApp.Domain.Services;
using EnglishLearningApp.Application.Exams.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishLearningApp.API.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize] // Yêu cầu đăng nhập, nhận được UserId và Role
public class AiContentController(
    IAiIntegrationService aiIntegrationService,
    IUnitOfWork unitOfWork,
    IGenericRepository<UserUpload> userUploadRepo,
    IGenericRepository<Exam> examRepo,
    IGenericRepository<Question> questionRepo,
    IGenericRepository<ExamQuestion> examQuestionRepo) : ControllerBase
{
    private readonly IAiIntegrationService _aiIntegrationService = aiIntegrationService;
    private readonly IUnitOfWork _unitOfWork = unitOfWork;
    private readonly IGenericRepository<UserUpload> _userUploadRepo = userUploadRepo;
    private readonly IGenericRepository<Exam> _examRepo = examRepo;
    private readonly IGenericRepository<Question> _questionRepo = questionRepo;
    private readonly IGenericRepository<ExamQuestion> _examQuestionRepo = examQuestionRepo;

    [HttpPost("generate-exam")]
    public async Task<IActionResult> GenerateExamFromFile(
        [FromForm] IFormFile file, 
        [FromForm] int numQuestions = 10, 
        [FromForm] string difficulty = "medium")
    {
        if (file == null || file.Length == 0)
            return BadRequest("Vui lòng tải lên tài liệu hợp lệ.");

        // Lấy thông tin User hiện tại từ Token
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out Guid userId))
            return Unauthorized("Không xác định được người dùng.");

        var userRole = User.FindFirstValue(ClaimTypes.Role) ?? "User"; // Mặc định là User

        // 1. Lưu Record UserUploads với trạng thái Processing
        var userUpload = new UserUpload
        {
            UserId = userId,
            FileName = file.FileName,
            FileType = file.ContentType,
            ProcessStatus = "Processing"
        };
        await _userUploadRepo.AddAsync(userUpload);
        await _unitOfWork.SaveChangesAsync();

        try
        {
            // 2. Giao tiếp với AI qua FastAPI (Timeout 5 phút đã cấu hình bên Service)
            var jsonResponse = await _aiIntegrationService.GenerateExamFromJsonAsync(file, numQuestions, difficulty);

            // 3. Parse JSON thành Response DTO
            var generatedData = JsonSerializer.Deserialize<AiGeneratedExamResponseDto>(
                jsonResponse, 
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );

            if (generatedData == null || generatedData.Questions == null || !generatedData.Questions.Any())
                throw new Exception("AI không trả về danh sách câu hỏi hợp lệ.");

            // 4. Logic phân quyền lưu Exam
            bool isCustom = userRole != "Admin"; // Admin => IsCustom = false (System exam). User => True
            
            var newExam = new Exam
            {
                Title = string.IsNullOrWhiteSpace(generatedData.Title) ? $"Exam from {file.FileName}" : generatedData.Title,
                CreatedBy = userId,
                IsCustom = isCustom,
                IsPublished = !isCustom, // Admin tạo thì Publish luôn, User tạo thì chờ (hoặc tuỳ policy)
                TotalPoints = generatedData.Questions.Sum(q => q.Points),
            };

            await _examRepo.AddAsync(newExam);

            // 5. Lưu Questions & Mối quan hệ ExamQuestions
            var orderIndex = 1;
            foreach (var aiQuestion in generatedData.Questions)
            {
                var question = new Question
                {
                    Content = aiQuestion.Content,
                    Options = aiQuestion.Options,
                    CorrectAnswer = aiQuestion.CorrectAnswer,
                    Explanation = aiQuestion.Explanation,
                    Points = aiQuestion.Points,
                    QuestionType = "MultipleChoice",
                    OrderIndex = orderIndex
                };
                
                await _questionRepo.AddAsync(question);

                var examQuestion = new ExamQuestion
                {
                    Exam = newExam,
                    Question = question,
                    OrderIndex = orderIndex
                };
                
                await _examQuestionRepo.AddAsync(examQuestion);
                orderIndex++;
            }

            // 6. Cập nhật trạng thái thành công
            userUpload.ProcessStatus = "Completed";
            userUpload.FileUrl = "LocalTempUrl"; // Nếu sau này có S3/Cloudinary thì map link vào đây
            await _userUploadRepo.UpdateAsync(userUpload);
            
            await _unitOfWork.SaveChangesAsync();

            return Ok(new
            {
                Message = "Tạo đề thi thành công!",
                ExamId = newExam.Id,
                Title = newExam.Title,
                TotalQuestions = generatedData.Questions.Count
            });
        }
        catch (Exception ex)
        {
            // Cập nhật trạng thái lỗi nếu đứt kết nối / parse hỏng / db lỗi.
            userUpload.ProcessStatus = "Failed";
            await _userUploadRepo.UpdateAsync(userUpload);
            await _unitOfWork.SaveChangesAsync();

            return StatusCode(500, new { Error = "Lỗi trong quá trình xử lý AI", Details = ex.Message });
        }
    }
}
