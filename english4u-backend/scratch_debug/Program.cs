using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using Google.Apis.Auth.OAuth2;

namespace scratch_debug;

class Program
{
    static bool TryGetModelQuota(
        Dictionary<(string ModelId, string Metric), long> quotaMap,
        string modelId,
        string metric,
        out long value)
    {
        // 1. Exact match (if Google explicitly returns this model, take that exact value including 0)
        if (quotaMap.TryGetValue((modelId, metric), out value))
        {
            return true;
        }

        // 2. Only when Google has no exact match dimension, search by base model prefix
        // (e.g. modelId is gemma-4-31b-it but Google quota is defined under base model gemma-4-31b)
        foreach (var key in quotaMap.Keys)
        {
            if (string.Equals(key.Metric, metric, StringComparison.OrdinalIgnoreCase))
            {
                // Only match when modelId starts with key.ModelId (e.g. gemma-4-31b-it starts with gemma-4-31b)
                // NEVER match in reverse to avoid picking up 1p-freebie internal quotas
                if (modelId.StartsWith(key.ModelId, StringComparison.OrdinalIgnoreCase))
                {
                    value = quotaMap[key];
                    return true;
                }
            }
        }

        value = 0;
        return false;
    }

    static async Task Main()
    {
        string saPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "EnglishExamApp.API", "google-service-account.json");
        if (!File.Exists(saPath))
        {
            saPath = Path.Combine("english4u-backend", "EnglishExamApp.API", "google-service-account.json");
        }
        var saContent = await File.ReadAllTextAsync(saPath);
        using var saDoc = JsonDocument.Parse(saContent);
        string projectId = saDoc.RootElement.GetProperty("project_id").GetString() ?? "";

        #pragma warning disable CS0618
        var cred = GoogleCredential.FromJson(saContent).CreateScoped("https://www.googleapis.com/auth/cloud-platform");
        #pragma warning restore CS0618
        var token = await cred.UnderlyingCredential.GetAccessTokenForRequestAsync();

        using var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        string quotasUrl = $"https://cloudquotas.googleapis.com/v1/projects/{projectId}/locations/global/services/generativelanguage.googleapis.com/quotaInfos?pageSize=1000";
        var qRes = await http.GetAsync(quotasUrl);
        var qBody = await qRes.Content.ReadAsStringAsync();
        using var qDoc = JsonDocument.Parse(qBody);

        var quotaMap = new Dictionary<(string, string), long>();

        if (qDoc.RootElement.TryGetProperty("quotaInfos", out var list))
        {
            foreach (var item in list.EnumerateArray())
            {
                var qId = item.GetProperty("quotaId").GetString() ?? "";
                if (!qId.Contains("FreeTier", StringComparison.OrdinalIgnoreCase)) continue;

                string metric = null;
                if (qId.Contains("Tokens", StringComparison.OrdinalIgnoreCase) && qId.Contains("Minute", StringComparison.OrdinalIgnoreCase)) metric = "TPM";
                else if (qId.Contains("Minute", StringComparison.OrdinalIgnoreCase) && (qId.Contains("Request", StringComparison.OrdinalIgnoreCase) || qId.Contains("Session", StringComparison.OrdinalIgnoreCase))) metric = "RPM";
                else if (qId.Contains("Day", StringComparison.OrdinalIgnoreCase) && (qId.Contains("Request", StringComparison.OrdinalIgnoreCase) || qId.Contains("PerDay", StringComparison.OrdinalIgnoreCase))) metric = "RPD";

                if (metric == null) continue;

                if (item.TryGetProperty("dimensionsInfos", out var dims))
                {
                    foreach (var d in dims.EnumerateArray())
                    {
                        var model = "";
                        if (d.TryGetProperty("dimensions", out var dimObj) && dimObj.TryGetProperty("model", out var mProp))
                        {
                            model = mProp.GetString() ?? "";
                        }
                        if (string.IsNullOrWhiteSpace(model)) continue;

                        long limitValue = 0; // Default to 0 if details is {}
                        if (d.TryGetProperty("details", out var det))
                        {
                            if (det.TryGetProperty("isUnlimited", out var unlim) && unlim.ValueKind == JsonValueKind.True)
                            {
                                limitValue = -1;
                            }
                            else if (det.TryGetProperty("value", out var vProp))
                            {
                                string strVal = vProp.GetString() ?? "0";
                                if (long.TryParse(strVal, out var num))
                                {
                                    limitValue = num;
                                }
                            }
                        }

                        quotaMap[(model, metric)] = limitValue;
                    }
                }
            }
        }

        Console.WriteLine("=== KIEM TRA QUOTA SAU KHI LUU DUNG CHUAN GOOGLE ===");
        string[] testModels = new[] {
            "gemini-2.5-pro",
            "gemini-2.5-pro-preview-tts",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemma-4-31b-it",
            "gemma-4-26b-a4b-it",
            "gemini-4-argon",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.8-live"
        };

        foreach (var m in testModels)
        {
            TryGetModelQuota(quotaMap, m, "RPM", out var rpm);
            TryGetModelQuota(quotaMap, m, "TPM", out var tpm);
            TryGetModelQuota(quotaMap, m, "RPD", out var rpd);

            bool hasUsable = (rpm > 0 || rpm == -1) || (tpm > 0 || tpm == -1) || (rpd > 0 || rpd == -1);
            bool hasZero = rpm == 0 || tpm == 0 || rpd == 0;
            bool keep = hasUsable && !hasZero;

            Console.WriteLine($"Model: {m,-30} | RPM: {rpm,5} | TPM: {tpm,8} | RPD: {rpd,6} | GIU: {keep}");
        }
    }
}
