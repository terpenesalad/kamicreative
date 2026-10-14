# Changelog

All notable changes to KamiCreative are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [1.0.0] — 2026-10-14

First public release.

### Patching
- Node-based patch editor with inline, scrubbable values, typed ports, quick-add search (double-click or Tab), drop-a-wire-to-add-and-connect, wire re-routing, marquee selection, copy/paste, duplicate, bypass, rename and sticky-note comments.
- Live per-module video previews and live value readouts.
- Inspector with full editors for every parameter, port-count control for expandable modules and a built-in GLSL code editor.
- Undo/redo for every edit, including scenes, media and stage mapping.

### Engine
- Push-based value flow, event triggers and pull-based per-frame video rendering on WebGL 2.
- Video feedback loops (a module that feeds back into itself receives its previous frame); runaway value loops are stopped and flagged.
- Scenes with cross-fades, start-of-scene triggers, deferred scene jumps and cross-scene broadcast channels.

### Modules (106)
- Video sources: movie, picture, live capture, solid colour, gradient, noise, pattern, shapes, text, GLSL shader, stage grabber.
- 27 GPU effects including colour adjust, levels, colourise, chroma and luma key, blur, glow, feedback trails, freeze frame, video delay, kaleidoscope, mirror, tile, transform, crop, wave distort, RGB split, glitch, halftone, edge detect, displace, vignette and film grain.
- Compositing: mixer with seven transitions, layer blend with twelve blend modes, alpha mask, picture-in-picture, video switcher.
- Generators, maths and logic: waves, pulses, beat clock with tap tempo, envelopes, ramps, random, counters, stopwatch, system time, calculator, expression, map range, smoother, comparator, gates, delays, router, selector, step sequencer, lookup table, text formatter and more.
- Control surfaces: slider, button, switch, XY pad, colour picker, monitor and scope.
- Input/output: keyboard, mouse, gamepad, MIDI note/CC in, MIDI out, OSC receive/send, Art-Net DMX out.
- Audio: sound player with level output, microphone analyser with bands and beat detection.

### Stages and projection mapping
- Multiple stages, each with its own output window that can go full screen on any display.
- Projectors with layer, opacity, five blend modes, fit modes, zoom, position, size and rotation.
- Mapper with unlimited surfaces, perspective corner pin, bicubic mesh warps up to 8×8, input regions, soft-edge blending with gamma and curve, per-surface colour trim, outline-on-output, flip, duplicate and keyboard nudging.
- Calibration test pattern.

### Show control
- Live view with GO / Back, now/next, cue notes, clickable cue list and large operator controls.

### Files and reliability
- `.kamic` project format (JSON) with relative media paths, atomic saves with backup, crash recovery, recent files, examples and `.kamic` file association.
- Graphics self-test (Help menu).
- Windows installer with custom install location, shortcuts and file association.
