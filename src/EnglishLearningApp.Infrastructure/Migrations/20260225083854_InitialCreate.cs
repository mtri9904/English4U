using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishLearningApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    email = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    passwordHash = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    displayName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    role = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    avatarUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    isActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()"),
                    updatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "courses",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    thumbnailUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    skillType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    difficultyLevel = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    isPublished = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    createdBy = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()"),
                    updatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_courses", x => x.id);
                    table.ForeignKey(
                        name: "FK_courses_users_createdBy",
                        column: x => x.createdBy,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    message = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    isRead = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.id);
                    table.ForeignKey(
                        name: "FK_notifications_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exams",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    courseId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    duration = table.Column<int>(type: "int", nullable: true),
                    totalPoints = table.Column<int>(type: "int", nullable: true),
                    passingScore = table.Column<double>(type: "float", nullable: true),
                    isPublished = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exams", x => x.id);
                    table.ForeignKey(
                        name: "FK_exams_courses_courseId",
                        column: x => x.courseId,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "learning_progress",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    courseId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    completedLessons = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    lastAccessedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_learning_progress", x => x.id);
                    table.ForeignKey(
                        name: "FK_learning_progress_courses_courseId",
                        column: x => x.courseId,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_learning_progress_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "lessons",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    courseId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    thumbnailUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    content = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    orderIndex = table.Column<int>(type: "int", nullable: true),
                    duration = table.Column<int>(type: "int", nullable: true),
                    isPublished = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lessons", x => x.id);
                    table.ForeignKey(
                        name: "FK_lessons_courses_courseId",
                        column: x => x.courseId,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exam_sessions",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    examId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    startedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()"),
                    endedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    timeRemaining = table.Column<int>(type: "int", nullable: true),
                    draftData = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exam_sessions", x => x.id);
                    table.ForeignKey(
                        name: "FK_exam_sessions_exams_examId",
                        column: x => x.examId,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_exam_sessions_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "questions",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    lessonId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    skillType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    questionType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    content = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    audioUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    imageUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    correctAnswer = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    options = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    points = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    orderIndex = table.Column<int>(type: "int", nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_questions", x => x.id);
                    table.ForeignKey(
                        name: "FK_questions_lessons_lessonId",
                        column: x => x.lessonId,
                        principalTable: "lessons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "scoring_results",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    sessionId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    totalScore = table.Column<double>(type: "float", nullable: true),
                    bandScore = table.Column<double>(type: "float", nullable: true),
                    transcript = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    feedback = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    pronunciationScore = table.Column<double>(type: "float", nullable: true),
                    fluencyScore = table.Column<double>(type: "float", nullable: true),
                    grammarScore = table.Column<double>(type: "float", nullable: true),
                    coherenceScore = table.Column<double>(type: "float", nullable: true),
                    scoredAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scoring_results", x => x.id);
                    table.ForeignKey(
                        name: "FK_scoring_results_exam_sessions_sessionId",
                        column: x => x.sessionId,
                        principalTable: "exam_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exam_questions",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    examId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    questionId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    orderIndex = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exam_questions", x => x.id);
                    table.ForeignKey(
                        name: "FK_exam_questions_exams_examId",
                        column: x => x.examId,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exam_questions_questions_questionId",
                        column: x => x.questionId,
                        principalTable: "questions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_answers",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    sessionId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    questionId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    answerText = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    audioUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    isAutoSaved = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    submittedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_answers", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_answers_exam_sessions_sessionId",
                        column: x => x.sessionId,
                        principalTable: "exam_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_answers_questions_questionId",
                        column: x => x.questionId,
                        principalTable: "questions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_courses_createdBy",
                table: "courses",
                column: "createdBy");

            migrationBuilder.CreateIndex(
                name: "IX_exam_questions_examId",
                table: "exam_questions",
                column: "examId");

            migrationBuilder.CreateIndex(
                name: "IX_exam_questions_questionId",
                table: "exam_questions",
                column: "questionId");

            migrationBuilder.CreateIndex(
                name: "IX_exam_sessions_examId",
                table: "exam_sessions",
                column: "examId");

            migrationBuilder.CreateIndex(
                name: "IX_exam_sessions_userId",
                table: "exam_sessions",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_exams_courseId",
                table: "exams",
                column: "courseId");

            migrationBuilder.CreateIndex(
                name: "IX_learning_progress_courseId",
                table: "learning_progress",
                column: "courseId");

            migrationBuilder.CreateIndex(
                name: "IX_learning_progress_userId",
                table: "learning_progress",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_lessons_courseId",
                table: "lessons",
                column: "courseId");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_userId",
                table: "notifications",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_questions_lessonId",
                table: "questions",
                column: "lessonId");

            migrationBuilder.CreateIndex(
                name: "IX_scoring_results_sessionId",
                table: "scoring_results",
                column: "sessionId",
                unique: true,
                filter: "[sessionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_user_answers_questionId",
                table: "user_answers",
                column: "questionId");

            migrationBuilder.CreateIndex(
                name: "IX_user_answers_sessionId",
                table: "user_answers",
                column: "sessionId");

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "exam_questions");

            migrationBuilder.DropTable(
                name: "learning_progress");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "scoring_results");

            migrationBuilder.DropTable(
                name: "user_answers");

            migrationBuilder.DropTable(
                name: "exam_sessions");

            migrationBuilder.DropTable(
                name: "questions");

            migrationBuilder.DropTable(
                name: "exams");

            migrationBuilder.DropTable(
                name: "lessons");

            migrationBuilder.DropTable(
                name: "courses");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
