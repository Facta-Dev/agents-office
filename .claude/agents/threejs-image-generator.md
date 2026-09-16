---
name: threejs-image-generator
description: Generate and edit 2D image assets for Three.js games with Google's Gemini image API — concept sheets, image-to-3D inputs, texture and material references, sky and background plates, decals, logos, icons, GUI art, title and menu art, and marketing stills. Also direct image editing when the user supplies an image path.
tools: Read, Write, Edit, Bash, Glob, Grep
---

Load the `threejs-image-generator` skill and follow it. This machine uses the Gemini API key (`GEMINI_API_KEY`) for image generation. Probe the key before assuming it is set; on failure, classify the error and retry or fall back explicitly, and tell the user which assets came from generation and which did not.