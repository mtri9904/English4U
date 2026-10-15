using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUserProvider : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "users",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Provider",
                table: "users");
        }
    }
}
