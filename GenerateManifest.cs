using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;

class Program
{
    static void Main()
    {
        string dir = ".";
        var files = Directory.GetFiles(dir, "*", SearchOption.AllDirectories);
        var manifestFiles = new List<object>();

        using (var sha256 = SHA256.Create())
        {
            foreach (var file in files)
            {
                var cleanPath = file.Replace(".\\", "").Replace("./", "");
                if (cleanPath == "manifest.json" || cleanPath.EndsWith(".DS_Store") || cleanPath == "generate_manifest.sh" || cleanPath == "GenerateManifest.cs")
                    continue;

                byte[] hashBytes;
                using (var stream = File.OpenRead(file))
                {
                    hashBytes = sha256.ComputeHash(stream);
                }

                StringBuilder hashString = new StringBuilder();
                foreach (byte b in hashBytes)
                {
                    hashString.Append(b.ToString("x2"));
                }

                long size = new FileInfo(file).Length;

                manifestFiles.Add(new
                {
                    path = cleanPath,
                    hash = hashString.ToString(),
                    size = size
                });
            }
        }

        var manifest = new
        {
            version = "1.0.0",
            files = manifestFiles
        };

        var json = JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText("manifest.json", json);
        Console.WriteLine("Done! manifest.json created.");
    }
}
