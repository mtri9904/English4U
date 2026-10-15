using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RebuildSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "roles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_roles", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "scoring_rubrics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    skillType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    criteriaName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    maxBand = table.Column<double>(type: "float", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scoring_rubrics", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "subscriptions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    price = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    durationDays = table.Column<int>(type: "int", nullable: false),
                    features = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    isActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscriptions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "tags",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tags", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    email = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    passwordHash = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    displayName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
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
                name: "exams",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    durationMinutes = table.Column<int>(type: "int", nullable: true),
                    totalPoints = table.Column<double>(type: "float", nullable: true),
                    examType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    sourcePdfUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    isPublished = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    createdBy = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exams", x => x.id);
                    table.ForeignKey(
                        name: "FK_exams_users_createdBy",
                        column: x => x.createdBy,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    userId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
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
                name: "payments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    userId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    amount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    paymentMethod = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    transactionId = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payments", x => x.id);
                    table.ForeignKey(
                        name: "FK_payments_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_roles",
                columns: table => new
                {
                    userId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    roleId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_roles", x => new { x.userId, x.roleId });
                    table.ForeignKey(
                        name: "FK_user_roles_roles_roleId",
                        column: x => x.roleId,
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_roles_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_subscriptions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    userId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    subscriptionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    startDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    endDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_subscriptions", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_subscriptions_subscriptions_subscriptionId",
                        column: x => x.subscriptionId,
                        principalTable: "subscriptions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_subscriptions_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "document_uploads",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    uploadedBy = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    fileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    fileUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    processStatus = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false, defaultValue: "Pending"),
                    errorMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    generatedExamId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()"),
                    updatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_document_uploads", x => x.id);
                    table.ForeignKey(
                        name: "FK_document_uploads_exams_generatedExamId",
                        column: x => x.generatedExamId,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_document_uploads_users_uploadedBy",
                        column: x => x.uploadedBy,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exam_sections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    examId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    skillType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    orderIndex = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exam_sections", x => x.id);
                    table.ForeignKey(
                        name: "FK_exam_sections_exams_examId",
                        column: x => x.examId,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exam_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    userId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    examId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    startedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()"),
                    endedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    timeRemaining = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exam_sessions", x => x.id);
                    table.ForeignKey(
                        name: "FK_exam_sessions_exams_examId",
                        column: x => x.examId,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exam_sessions_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exam_tags",
                columns: table => new
                {
                    examId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    tagId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exam_tags", x => new { x.examId, x.tagId });
                    table.ForeignKey(
                        name: "FK_exam_tags_exams_examId",
                        column: x => x.examId,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exam_tags_tags_tagId",
                        column: x => x.tagId,
                        principalTable: "tags",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "listening_parts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    sectionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    partNumber = table.Column<int>(type: "int", nullable: true),
                    audioUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    contextDescription = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_listening_parts", x => x.id);
                    table.ForeignKey(
                        name: "FK_listening_parts_exam_sections_sectionId",
                        column: x => x.sectionId,
                        principalTable: "exam_sections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "reading_passages",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    sectionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    passageNumber = table.Column<int>(type: "int", nullable: true),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    paragraphsData = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    assetsData = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reading_passages", x => x.id);
                    table.ForeignKey(
                        name: "FK_reading_passages_exam_sections_sectionId",
                        column: x => x.sectionId,
                        principalTable: "exam_sections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "speaking_parts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    sectionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    partNumber = table.Column<int>(type: "int", nullable: true),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_speaking_parts", x => x.id);
                    table.ForeignKey(
                        name: "FK_speaking_parts_exam_sections_sectionId",
                        column: x => x.sectionId,
                        principalTable: "exam_sections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "writing_tasks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    sectionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    taskNumber = table.Column<int>(type: "int", nullable: true),
                    promptText = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    assetsData = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    minWords = table.Column<int>(type: "int", nullable: false, defaultValue: 150)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_writing_tasks", x => x.id);
                    table.ForeignKey(
                        name: "FK_writing_tasks_exam_sections_sectionId",
                        column: x => x.sectionId,
                        principalTable: "exam_sections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "scoring_results",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    sessionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    totalBandScore = table.Column<double>(type: "float", nullable: true),
                    readingScore = table.Column<double>(type: "float", nullable: true),
                    listeningScore = table.Column<double>(type: "float", nullable: true),
                    writingScore = table.Column<double>(type: "float", nullable: true),
                    speakingScore = table.Column<double>(type: "float", nullable: true),
                    overallFeedback = table.Column<string>(type: "nvarchar(max)", nullable: true),
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
                name: "question_groups",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    passageId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: true),
                    listeningPartId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: true),
                    groupType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    instruction = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    startQuestion = table.Column<int>(type: "int", nullable: true),
                    endQuestion = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_question_groups", x => x.id);
                    table.ForeignKey(
                        name: "FK_question_groups_listening_parts_listeningPartId",
                        column: x => x.listeningPartId,
                        principalTable: "listening_parts",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_question_groups_reading_passages_passageId",
                        column: x => x.passageId,
                        principalTable: "reading_passages",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "speaking_questions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    partId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    content = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    cueCardPoints = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    audioPromptUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    orderIndex = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_speaking_questions", x => x.id);
                    table.ForeignKey(
                        name: "FK_speaking_questions_speaking_parts_partId",
                        column: x => x.partId,
                        principalTable: "speaking_parts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "questions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    groupId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    questionNumber = table.Column<int>(type: "int", nullable: true),
                    content = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    correctAnswer = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    explanation = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    provenance = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    evidenceLocation = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    points = table.Column<double>(type: "float", nullable: false, defaultValue: 1.0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_questions", x => x.id);
                    table.ForeignKey(
                        name: "FK_questions_question_groups_groupId",
                        column: x => x.groupId,
                        principalTable: "question_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "question_options",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    questionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    optionText = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    isCorrect = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    orderIndex = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_question_options", x => x.id);
                    table.ForeignKey(
                        name: "FK_question_options_questions_questionId",
                        column: x => x.questionId,
                        principalTable: "questions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "saved_questions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    userId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    questionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    savedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_questions", x => x.id);
                    table.ForeignKey(
                        name: "FK_saved_questions_questions_questionId",
                        column: x => x.questionId,
                        principalTable: "questions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_saved_questions_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_answers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    sessionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    questionId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: true),
                    writingTaskId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: true),
                    answerText = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    scoreEarned = table.Column<double>(type: "float", nullable: false, defaultValue: 0.0),
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
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_user_answers_writing_tasks_writingTaskId",
                        column: x => x.writingTaskId,
                        principalTable: "writing_tasks",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "ai_feedbacks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    answerId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    rubricId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    bandScore = table.Column<double>(type: "float", nullable: false),
                    aiComment = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    improvements = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_feedbacks", x => x.id);
                    table.ForeignKey(
                        name: "FK_ai_feedbacks_scoring_rubrics_rubricId",
                        column: x => x.rubricId,
                        principalTable: "scoring_rubrics",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ai_feedbacks_user_answers_answerId",
                        column: x => x.answerId,
                        principalTable: "user_answers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_audio_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    answerId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    audioUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    durationSeconds = table.Column<double>(type: "float", nullable: true),
                    fileSizeKB = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_audio_records", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_audio_records_user_answers_answerId",
                        column: x => x.answerId,
                        principalTable: "user_answers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "speech_transcripts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    audioRecordId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    transcriptText = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    confidenceScore = table.Column<double>(type: "float", nullable: true),
                    wordErrorRate = table.Column<double>(type: "float", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_speech_transcripts", x => x.id);
                    table.ForeignKey(
                        name: "FK_speech_transcripts_user_audio_records_audioRecordId",
                        column: x => x.audioRecordId,
                        principalTable: "user_audio_records",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "phoneme_analyses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    transcriptId = table.Column<Guid>(type: "uniqueidentifier", maxLength: 36, nullable: false),
                    word = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    expectedPhoneme = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    actualPhoneme = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    isCorrect = table.Column<bool>(type: "bit", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_phoneme_analyses", x => x.id);
                    table.ForeignKey(
                        name: "FK_phoneme_analyses_speech_transcripts_transcriptId",
                        column: x => x.transcriptId,
                        principalTable: "speech_transcripts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ai_feedbacks_answerId",
                table: "ai_feedbacks",
                column: "answerId");

            migrationBuilder.CreateIndex(
                name: "IX_ai_feedbacks_rubricId",
                table: "ai_feedbacks",
                column: "rubricId");

            migrationBuilder.CreateIndex(
                name: "IX_document_uploads_generatedExamId",
                table: "document_uploads",
                column: "generatedExamId");

            migrationBuilder.CreateIndex(
                name: "IX_document_uploads_uploadedBy",
                table: "document_uploads",
                column: "uploadedBy");

            migrationBuilder.CreateIndex(
                name: "IX_exam_sections_examId",
                table: "exam_sections",
                column: "examId");

            migrationBuilder.CreateIndex(
                name: "IX_exam_sessions_examId",
                table: "exam_sessions",
                column: "examId");

            migrationBuilder.CreateIndex(
                name: "IX_exam_sessions_userId",
                table: "exam_sessions",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_exam_tags_tagId",
                table: "exam_tags",
                column: "tagId");

            migrationBuilder.CreateIndex(
                name: "IX_exams_createdBy",
                table: "exams",
                column: "createdBy");

            migrationBuilder.CreateIndex(
                name: "IX_listening_parts_sectionId",
                table: "listening_parts",
                column: "sectionId");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_userId",
                table: "notifications",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_payments_userId",
                table: "payments",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_phoneme_analyses_transcriptId",
                table: "phoneme_analyses",
                column: "transcriptId");

            migrationBuilder.CreateIndex(
                name: "IX_question_groups_listeningPartId",
                table: "question_groups",
                column: "listeningPartId");

            migrationBuilder.CreateIndex(
                name: "IX_question_groups_passageId",
                table: "question_groups",
                column: "passageId");

            migrationBuilder.CreateIndex(
                name: "IX_question_options_questionId",
                table: "question_options",
                column: "questionId");

            migrationBuilder.CreateIndex(
                name: "IX_questions_groupId",
                table: "questions",
                column: "groupId");

            migrationBuilder.CreateIndex(
                name: "IX_reading_passages_sectionId",
                table: "reading_passages",
                column: "sectionId");

            migrationBuilder.CreateIndex(
                name: "IX_roles_name",
                table: "roles",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_saved_questions_questionId",
                table: "saved_questions",
                column: "questionId");

            migrationBuilder.CreateIndex(
                name: "IX_saved_questions_userId",
                table: "saved_questions",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_scoring_results_sessionId",
                table: "scoring_results",
                column: "sessionId");

            migrationBuilder.CreateIndex(
                name: "IX_speaking_parts_sectionId",
                table: "speaking_parts",
                column: "sectionId");

            migrationBuilder.CreateIndex(
                name: "IX_speaking_questions_partId",
                table: "speaking_questions",
                column: "partId");

            migrationBuilder.CreateIndex(
                name: "IX_speech_transcripts_audioRecordId",
                table: "speech_transcripts",
                column: "audioRecordId");

            migrationBuilder.CreateIndex(
                name: "IX_tags_name",
                table: "tags",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_answers_questionId",
                table: "user_answers",
                column: "questionId");

            migrationBuilder.CreateIndex(
                name: "IX_user_answers_sessionId",
                table: "user_answers",
                column: "sessionId");

            migrationBuilder.CreateIndex(
                name: "IX_user_answers_writingTaskId",
                table: "user_answers",
                column: "writingTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_user_audio_records_answerId",
                table: "user_audio_records",
                column: "answerId");

            migrationBuilder.CreateIndex(
                name: "IX_user_roles_roleId",
                table: "user_roles",
                column: "roleId");

            migrationBuilder.CreateIndex(
                name: "IX_user_subscriptions_subscriptionId",
                table: "user_subscriptions",
                column: "subscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_user_subscriptions_userId",
                table: "user_subscriptions",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_writing_tasks_sectionId",
                table: "writing_tasks",
                column: "sectionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_feedbacks");

            migrationBuilder.DropTable(
                name: "document_uploads");

            migrationBuilder.DropTable(
                name: "exam_tags");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "payments");

            migrationBuilder.DropTable(
                name: "phoneme_analyses");

            migrationBuilder.DropTable(
                name: "question_options");

            migrationBuilder.DropTable(
                name: "saved_questions");

            migrationBuilder.DropTable(
                name: "scoring_results");

            migrationBuilder.DropTable(
                name: "speaking_questions");

            migrationBuilder.DropTable(
                name: "user_roles");

            migrationBuilder.DropTable(
                name: "user_subscriptions");

            migrationBuilder.DropTable(
                name: "scoring_rubrics");

            migrationBuilder.DropTable(
                name: "tags");

            migrationBuilder.DropTable(
                name: "speech_transcripts");

            migrationBuilder.DropTable(
                name: "speaking_parts");

            migrationBuilder.DropTable(
                name: "roles");

            migrationBuilder.DropTable(
                name: "subscriptions");

            migrationBuilder.DropTable(
                name: "user_audio_records");

            migrationBuilder.DropTable(
                name: "user_answers");

            migrationBuilder.DropTable(
                name: "exam_sessions");

            migrationBuilder.DropTable(
                name: "questions");

            migrationBuilder.DropTable(
                name: "writing_tasks");

            migrationBuilder.DropTable(
                name: "question_groups");

            migrationBuilder.DropTable(
                name: "listening_parts");

            migrationBuilder.DropTable(
                name: "reading_passages");

            migrationBuilder.DropTable(
                name: "exam_sections");

            migrationBuilder.DropTable(
                name: "exams");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
