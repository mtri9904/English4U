using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishLearningApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCommercialAndGamificationFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "achievements",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    iconUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    pointsReward = table.Column<int>(type: "int", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_achievements", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "course_reviews",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    courseId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    rating = table.Column<int>(type: "int", nullable: false),
                    comment = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_course_reviews", x => x.id);
                    table.ForeignKey(
                        name: "FK_course_reviews_courses_courseId",
                        column: x => x.courseId,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_course_reviews_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "daily_streaks",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    currentStreak = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    longestStreak = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    lastActivityDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_daily_streaks", x => x.id);
                    table.ForeignKey(
                        name: "FK_daily_streaks_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "flashcard_decks",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    courseId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    title = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flashcard_decks", x => x.id);
                    table.ForeignKey(
                        name: "FK_flashcard_decks_courses_courseId",
                        column: x => x.courseId,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "lesson_comments",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    lessonId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    parentId = table.Column<string>(type: "NVARCHAR(36)", nullable: true),
                    content = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lesson_comments", x => x.id);
                    table.ForeignKey(
                        name: "FK_lesson_comments_lesson_comments_parentId",
                        column: x => x.parentId,
                        principalTable: "lesson_comments",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_lesson_comments_lessons_lessonId",
                        column: x => x.lessonId,
                        principalTable: "lessons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_lesson_comments_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    amount = table.Column<decimal>(type: "DECIMAL(18,2)", nullable: false),
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
                name: "subscriptions",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    price = table.Column<decimal>(type: "DECIMAL(18,2)", nullable: false),
                    durationDays = table.Column<int>(type: "int", nullable: false),
                    features = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    isActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscriptions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "tags",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tags", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "user_achievements",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    achievementId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    unlockedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_achievements", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_achievements_achievements_achievementId",
                        column: x => x.achievementId,
                        principalTable: "achievements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_achievements_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "flashcards",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    deckId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    frontText = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    backText = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    audioUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    exampleSentence = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flashcards", x => x.id);
                    table.ForeignKey(
                        name: "FK_flashcards_flashcard_decks_deckId",
                        column: x => x.deckId,
                        principalTable: "flashcard_decks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_subscriptions",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    subscriptionId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
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
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_subscriptions_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "course_tags",
                columns: table => new
                {
                    courseId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    tagId = table.Column<string>(type: "NVARCHAR(36)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_course_tags", x => new { x.courseId, x.tagId });
                    table.ForeignKey(
                        name: "FK_course_tags_courses_courseId",
                        column: x => x.courseId,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_course_tags_tags_tagId",
                        column: x => x.tagId,
                        principalTable: "tags",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_flashcard_progress",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    flashcardId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    boxLevel = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    nextReviewDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    easeFactor = table.Column<double>(type: "float", nullable: false, defaultValue: 2.5)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_flashcard_progress", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_flashcard_progress_flashcards_flashcardId",
                        column: x => x.flashcardId,
                        principalTable: "flashcards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_flashcard_progress_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_course_reviews_courseId",
                table: "course_reviews",
                column: "courseId");

            migrationBuilder.CreateIndex(
                name: "IX_course_reviews_userId",
                table: "course_reviews",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_course_tags_tagId",
                table: "course_tags",
                column: "tagId");

            migrationBuilder.CreateIndex(
                name: "IX_daily_streaks_userId",
                table: "daily_streaks",
                column: "userId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_flashcard_decks_courseId",
                table: "flashcard_decks",
                column: "courseId");

            migrationBuilder.CreateIndex(
                name: "IX_flashcards_deckId",
                table: "flashcards",
                column: "deckId");

            migrationBuilder.CreateIndex(
                name: "IX_lesson_comments_lessonId",
                table: "lesson_comments",
                column: "lessonId");

            migrationBuilder.CreateIndex(
                name: "IX_lesson_comments_parentId",
                table: "lesson_comments",
                column: "parentId");

            migrationBuilder.CreateIndex(
                name: "IX_lesson_comments_userId",
                table: "lesson_comments",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_payments_userId",
                table: "payments",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_tags_name",
                table: "tags",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_achievements_achievementId",
                table: "user_achievements",
                column: "achievementId");

            migrationBuilder.CreateIndex(
                name: "IX_user_achievements_userId",
                table: "user_achievements",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_user_flashcard_progress_flashcardId",
                table: "user_flashcard_progress",
                column: "flashcardId");

            migrationBuilder.CreateIndex(
                name: "IX_user_flashcard_progress_userId",
                table: "user_flashcard_progress",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_user_subscriptions_subscriptionId",
                table: "user_subscriptions",
                column: "subscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_user_subscriptions_userId",
                table: "user_subscriptions",
                column: "userId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "course_reviews");

            migrationBuilder.DropTable(
                name: "course_tags");

            migrationBuilder.DropTable(
                name: "daily_streaks");

            migrationBuilder.DropTable(
                name: "lesson_comments");

            migrationBuilder.DropTable(
                name: "payments");

            migrationBuilder.DropTable(
                name: "user_achievements");

            migrationBuilder.DropTable(
                name: "user_flashcard_progress");

            migrationBuilder.DropTable(
                name: "user_subscriptions");

            migrationBuilder.DropTable(
                name: "tags");

            migrationBuilder.DropTable(
                name: "achievements");

            migrationBuilder.DropTable(
                name: "flashcards");

            migrationBuilder.DropTable(
                name: "subscriptions");

            migrationBuilder.DropTable(
                name: "flashcard_decks");
        }
    }
}
