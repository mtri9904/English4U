using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public class EmailService(
    IConfiguration configuration,
    ILogger<EmailService> logger) : IEmailService
{
    private static readonly HttpClient HttpClient = new();

    public async Task SendEmailAsync(string toEmail, string subject, string body)
    {
        var clientId = configuration["Email:ClientId"];
        var clientSecret = configuration["Email:ClientSecret"];
        var refreshToken = configuration["Email:RefreshToken"];
        var fromEmail = configuration["Email:FromEmail"];

        if (string.IsNullOrWhiteSpace(clientId) ||
            string.IsNullOrWhiteSpace(clientSecret) ||
            string.IsNullOrWhiteSpace(refreshToken) ||
            string.IsNullOrWhiteSpace(fromEmail))
        {
            logger.LogWarning("Gmail API credentials are not fully configured. Email sending skipped.");
            return;
        }

        await SendViaGmailApiAsync(clientId, clientSecret, refreshToken, fromEmail, toEmail, subject, body);
    }

    private async Task SendViaGmailApiAsync(string clientId, string clientSecret, string refreshToken, string fromEmail, string toEmail, string subject, string body)
    {
        logger.LogInformation("Sending email via Gmail API to {ToEmail}.", toEmail.Trim());

        using var tokenRequest = new HttpRequestMessage(HttpMethod.Post, "https://oauth2.googleapis.com/token");
        var tokenParams = new Dictionary<string, string>
        {
            { "client_id", clientId },
            { "client_secret", clientSecret },
            { "refresh_token", refreshToken },
            { "grant_type", "refresh_token" }
        };
        tokenRequest.Content = new FormUrlEncodedContent(tokenParams);

        using var tokenResponse = await HttpClient.SendAsync(tokenRequest);
        if (!tokenResponse.IsSuccessStatusCode)
        {
            var errorContent = await tokenResponse.Content.ReadAsStringAsync();
            logger.LogError("Failed to refresh Gmail access token. Status: {StatusCode}, Error: {Error}", tokenResponse.StatusCode, errorContent);
            throw new Exception($"Failed to refresh Gmail access token: {tokenResponse.StatusCode}");
        }

        var tokenJson = await tokenResponse.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(tokenJson);
        var accessToken = jsonDoc.RootElement.GetProperty("access_token").GetString();

        if (string.IsNullOrEmpty(accessToken))
        {
            logger.LogError("Access token received from Google was null or empty.");
            throw new Exception("Access token was empty.");
        }

        var subjectBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(subject));
        var mimeMessage = new StringBuilder();
        mimeMessage.AppendLine($"From: English4U <{fromEmail}>");
        mimeMessage.AppendLine($"To: {toEmail.Trim()}");
        mimeMessage.AppendLine($"Subject: =?utf-8?B?{subjectBase64}?=");
        mimeMessage.AppendLine("MIME-Version: 1.0");
        mimeMessage.AppendLine("Content-Type: text/html; charset=utf-8");
        mimeMessage.AppendLine();
        mimeMessage.AppendLine(body);

        var rawBytes = Encoding.UTF8.GetBytes(mimeMessage.ToString());
        var rawBase64Url = Convert.ToBase64String(rawBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        using var sendRequest = new HttpRequestMessage(HttpMethod.Post, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        sendRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var sendPayload = new { raw = rawBase64Url };
        var sendJson = JsonSerializer.Serialize(sendPayload);
        sendRequest.Content = new StringContent(sendJson, Encoding.UTF8, "application/json");

        using var sendResponse = await HttpClient.SendAsync(sendRequest);
        if (!sendResponse.IsSuccessStatusCode)
        {
            var errorContent = await sendResponse.Content.ReadAsStringAsync();
            logger.LogError("Gmail API failed with status {StatusCode}. Response: {Response}", sendResponse.StatusCode, errorContent);
            throw new Exception($"Failed to send email via Gmail API. Status: {sendResponse.StatusCode}");
        }

        logger.LogInformation("Email sent successfully via Gmail API to {ToEmail}.", toEmail.Trim());
    }
}
 