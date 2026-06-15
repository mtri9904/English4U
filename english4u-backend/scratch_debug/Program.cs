using System;
using System.IO;
using System.Linq;
using UglyToad.PdfPig;

namespace scratch_debug
{
    class Program
    {
        static void Main(string[] args)
        {
            var dir = @"C:\Users\Hande\OneDrive\Documents\De_English";
            if (!Directory.Exists(dir))
            {
                Console.WriteLine("Directory does not exist!");
                return;
            }

            var files = Directory.GetFiles(dir, "*.pdf", SearchOption.AllDirectories);
            Console.WriteLine($"Total PDF files: {files.Length}");

            foreach (var file in files)
            {
                try
                {
                    using (var document = PdfDocument.Open(file))
                    {
                        for (int pageNum = 1; pageNum <= document.NumberOfPages; pageNum++)
                        {
                            var page = document.GetPage(pageNum);
                            var text = page.Text;
                            if (text.Contains("seaweed", StringComparison.OrdinalIgnoreCase))
                            {
                                Console.WriteLine($"FOUND: Page {pageNum} in {file}");
                            }
                        }
                    }
                }
                catch {}
            }
            Console.WriteLine("Done searching.");
        }
    }
}
