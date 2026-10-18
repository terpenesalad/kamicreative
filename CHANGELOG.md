# Changelog

All notable changes to KamiCreative are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [1.2.0] — 2026-10-18

Visuals that react to sound.

### Added
- Shared sound engine with three sources: microphone (choose the device), computer audio (everything the PC plays, via Windows loopback) and Sound Players. Bass, mids, treble and loudness on a 0-100 scale, beat detection, tempo (BPM), a log-spaced spectrum and waveform.
- Auto-level that adapts to quiet and loud rooms, a silence gate, and a moving floor so kicks stand out over sustained basslines.
- **React to sound** on any number, on/off or trigger input: right-click it (or use the ♪ button in the Inspector) and choose Bass, Mids, Treble, Loudness or Beat; fine-tune the quiet/loud range, smoothness, fall-off and reverse. Triggers can fire every 1, 2, 4, 8 or 16 beats. Saved with the project and undoable.
- Sound button in the toolbar with live bass/mid/treble meters and a beat light, and a Sound panel with source, device, meters, spectrum, tempo, sensitivity, boost, smoothness and auto-level.
- Change scene automatically every 4-64 beats ("auto VJ").
- New modules: Sound Visualizer (bars, mirror bars, circle, waveform, ring wave, tunnel, stars, blob), Colour Organ (photism-style colour per frequency band: columns, rings, lights, wash), Sound Pulse (zoom, flash, shake, colour split and hue jumps for any video), Sound Input.
- Recipes: Music visualizer, Colour organ (photism), Make a video dance. Generative visuals and Pulsing ring now react to sound.
- Example: Music Visuals (four scenes that change every 16 beats). The Audio Reactive example was rebuilt with React to sound.
- Welcome screen card "Make visuals that react to music"; two new tutorial steps on sound; Help → Sound Settings.

### Changed
- Sound Player can feed the visuals (Visuals React, on by default). Sound Analyser now uses the shared sound engine, so it follows the source chosen in the Sound panel.
- New Sound category at the top of the module library; Logic and Math start collapsed.

## [1.1.0] — 2026-10-14

Making KamiCreative easy to learn.

### Added
- Interactive tutorial (Help → Interactive tutorial): a spotlight and instruction card that walks through modules, wires, values, the Inspector, inserting effects, scenes, the Live view and stage outputs, and moves on by itself when each step is done.
- Welcome screen at startup with the tutorial, recipes, examples, recent projects and help links (can be turned off).
- Eight one-click recipes: Play a video, Show a picture, Generative visuals, Webcam with effects, Text title, Music-reactive shape, Fade between two looks, Button that flashes.
- Hover help: the status bar explains whatever is under the pointer.
- Smart adding: a new video module is placed after the selected one and wired in, re-routing the chain, as one undo step.
- Stage hints with one-click fixes when a picture is not reaching the stage (no Projector, or a Projector with nothing plugged in).
- Help button in the toolbar; Help menu entries for the tutorial and the Welcome screen.
- An empty scene now offers buttons to start the tutorial, use a recipe or add a module.

### Changed
- Newly added modules are scrolled into view.
- First launch shows the Welcome screen instead of opening an example.

### Fixed
- The Inspector no longer shows "0 modules selected" for stale selections.

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
