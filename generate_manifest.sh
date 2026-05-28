#!/bin/bash
cd /Users/omarmohamed/Desktop/pro_erp_updates

echo "Generating manifest.json..."
echo "{" > manifest.json
echo '  "version": "1.0.0",' >> manifest.json
echo '  "files": [' >> manifest.json

first=true
find . -type f ! -name 'manifest.json' ! -name '.DS_Store' ! -name 'generate_manifest.sh' | while read file; do
  clean_path=${file#./}
  
  if [ "$first" = true ]; then
    first=false
  else
    echo "    ," >> manifest.json
  fi
  
  hash=$(shasum -a 256 "$file" | awk '{print $1}')
  
  if [[ "$OSTYPE" == "darwin"* ]]; then
    size=$(stat -f%z "$file")
  else
    size=$(stat -c%s "$file")
  fi
  
  echo "    {" >> manifest.json
  echo "      \"path\": \"$clean_path\"," >> manifest.json
  echo "      \"hash\": \"$hash\"," >> manifest.json
  echo "      \"size\": $size" >> manifest.json
  echo "    }" >> manifest.json
done >> manifest.json

echo '  ]' >> manifest.json
echo "}" >> manifest.json

echo "Done! Ready to push."
