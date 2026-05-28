import os
import hashlib
import json

def generate_manifest(dir_path):
    manifest_files = []
    
    for root, dirs, files in os.walk(dir_path):
        # Exclude .git directory
        if '.git' in dirs:
            dirs.remove('.git')
            
        for file in files:
            if file in ['manifest.json', 'generate_manifest.sh', 'generate_manifest.py', 'firebase-admin.json', 'GenerateManifest.cs'] or file.endswith('.DS_Store'):
                continue
                
            file_path = os.path.join(root, file)
            clean_path = os.path.relpath(file_path, dir_path)
            
            # calculate SHA256
            sha256 = hashlib.sha256()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256.update(chunk)
                    
            size = os.path.getsize(file_path)
            
            manifest_files.append({
                "path": clean_path,
                "hash": sha256.hexdigest(),
                "size": size
            })
            
    manifest = {
        "version": "1.0.0",
        "files": manifest_files
    }
    
    with open('manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)

if __name__ == '__main__':
    generate_manifest('.')
    print("Done! manifest.json created.")
