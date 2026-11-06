#!/bin/bash
# generate one image via Vertex gemini-2.5-flash-image and save it
# usage: make_asset.sh <outfile> <prompt>
set -e
OUT="$1"
PROMPT="$2"
TOKEN=$(gcloud auth print-access-token 2>/dev/null)
curl -s -o /tmp/vertex_resp.json -w 'HTTP:%{http_code}\n' -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/static-destiny-457915-r5/locations/us-central1/publishers/google/models/gemini-2.5-flash-image:generateContent" \
  -d "{\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"Generate an image: $PROMPT\"}]}],\"generationConfig\":{\"responseModalities\":[\"TEXT\",\"IMAGE\"]}}"
python3 decode_vertex.py "$OUT"