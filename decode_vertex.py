import json
import base64
import sys

with open('/tmp/vertex_resp.json') as f:
    d = json.load(f)

img = None
for part in d.get('candidates', [{}])[0].get('content', {}).get('parts', []):
    if 'inlineData' in part:
        img = part['inlineData']
        break

if not img:
    fr = d.get('candidates', [{}])[0].get('finishReason')
    print('no image in response (finishReason ' + str(fr) + ')')
    raise SystemExit(1)

out = sys.argv[1]
with open(out, 'wb') as f:
    f.write(base64.b64decode(img['data']))
print('saved ' + out + ' mime ' + img['mimeType'])