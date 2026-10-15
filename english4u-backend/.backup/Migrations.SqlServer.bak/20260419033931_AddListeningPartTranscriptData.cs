using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddListeningPartTranscriptData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "transcriptData",
                table: "listening_parts",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "transcriptData",
                table: "listening_parts");
        }
    }
}
