using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSpeakingQuestionAnswerLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "speakingQuestionId",
                table: "user_answers",
                type: "uniqueidentifier",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_user_answers_speakingQuestionId",
                table: "user_answers",
                column: "speakingQuestionId");

            migrationBuilder.AddForeignKey(
                name: "FK_user_answers_speaking_questions_speakingQuestionId",
                table: "user_answers",
                column: "speakingQuestionId",
                principalTable: "speaking_questions",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_user_answers_speaking_questions_speakingQuestionId",
                table: "user_answers");

            migrationBuilder.DropIndex(
                name: "IX_user_answers_speakingQuestionId",
                table: "user_answers");

            migrationBuilder.DropColumn(
                name: "speakingQuestionId",
                table: "user_answers");
        }
    }
}
