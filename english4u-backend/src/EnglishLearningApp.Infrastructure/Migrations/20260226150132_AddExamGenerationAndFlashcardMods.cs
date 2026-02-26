using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishLearningApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddExamGenerationAndFlashcardMods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "explanation",
                table: "questions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "userId",
                table: "flashcard_decks",
                type: "NVARCHAR(36)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "createdBy",
                table: "exams",
                type: "NVARCHAR(36)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "isCustom",
                table: "exams",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "user_uploads",
                columns: table => new
                {
                    id = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    userId = table.Column<string>(type: "NVARCHAR(36)", nullable: false),
                    fileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    fileUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    fileType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    processStatus = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    createdAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_uploads", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_uploads_users_userId",
                        column: x => x.userId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_flashcard_decks_userId",
                table: "flashcard_decks",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_exams_createdBy",
                table: "exams",
                column: "createdBy");

            migrationBuilder.CreateIndex(
                name: "IX_user_uploads_userId",
                table: "user_uploads",
                column: "userId");

            migrationBuilder.AddForeignKey(
                name: "FK_exams_users_createdBy",
                table: "exams",
                column: "createdBy",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_flashcard_decks_users_userId",
                table: "flashcard_decks",
                column: "userId",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_exams_users_createdBy",
                table: "exams");

            migrationBuilder.DropForeignKey(
                name: "FK_flashcard_decks_users_userId",
                table: "flashcard_decks");

            migrationBuilder.DropTable(
                name: "user_uploads");

            migrationBuilder.DropIndex(
                name: "IX_flashcard_decks_userId",
                table: "flashcard_decks");

            migrationBuilder.DropIndex(
                name: "IX_exams_createdBy",
                table: "exams");

            migrationBuilder.DropColumn(
                name: "explanation",
                table: "questions");

            migrationBuilder.DropColumn(
                name: "userId",
                table: "flashcard_decks");

            migrationBuilder.DropColumn(
                name: "createdBy",
                table: "exams");

            migrationBuilder.DropColumn(
                name: "isCustom",
                table: "exams");
        }
    }
}
