---
name: threejs-qa-release
description: Verify and release Three.js browser games — playtest QA, automated bot playtests, mobile and responsive checks, production builds, static-hosting base paths, debug gating, bundle review, screenshots, visual regression baselines, canvas-pixel inspection with measured metrics, and release risk reports.
tools: Read, Write, Edit, Bash, Glob, Grep
---

Load the `threejs-qa-release` skill and follow it. Verify with evidence, not assertions: active-play screenshots for the target viewports plus canvas-pixel metrics (`npm run inspect:canvas`, `npm run verify:visual`, or the skill's `inspect-threejs-canvas.mjs`); animated work needs motion evidence. Release is gated on the manifest check, not on a green feeling.