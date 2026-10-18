# KamiCreative user guide

This guide walks through how KamiCreative is organised and how to build and run a show with it. For the details of every module, see the [module reference](MODULES.md).

- [Learning KamiCreative](#learning-kamicreative)
- [The window](#the-window)
- [Patching](#patching)
- [Values, triggers and video](#values-triggers-and-video)
- [Scenes](#scenes)
- [Stages and outputs](#stages-and-outputs)
- [Projection mapping](#projection-mapping)
- [Running a show](#running-a-show)
- [Media](#media)
- [Sound and music](#sound-and-music)
- [MIDI, OSC, Art-Net and other input](#midi-osc-art-net-and-other-input)
- [Writing shaders](#writing-shaders)
- [Projects and safety](#projects-and-safety)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

## Learning KamiCreative

New to KamiCreative? These are built in:

- **Interactive tutorial** (Help → Interactive tutorial, or the Welcome screen). It highlights where to click, explains each part in plain words, and waits while you try each step: adding modules, wiring them, changing values, scenes, the Live view and stage outputs. About five minutes. Skip any step, or leave with Esc.
- **Welcome screen** at startup with the tutorial, recipes, examples and recent projects. Turn it off with the checkbox at the bottom, and reopen it from Help → Welcome screen.
- **Recipes**: ready-made, already-connected setups such as *Play a video*, *Webcam with effects*, *Generative visuals*, *Text title*, *Music-reactive shape*, *Fade between two looks* and *Button that flashes*. Add one from the Help button in the toolbar, the Welcome screen, or the "Use a recipe" button in an empty scene. Ctrl+Z removes it again.
- **Hover help**: point at anything — a port, a value, a module, a scene — and the bar at the bottom of the window says what it is and how to use it.
- **Smart adding**: with one video module selected, adding a video effect (Tab, or double-clicking it in the Modules list) places it right after the selection and wires it in, re-routing whatever came next. Ctrl+Z undoes it in one step.
- **Stage hints**: if your scene makes a picture that is not reaching the stage, a note appears next to the stage monitor explaining why, with a button that fixes it.

## The window

| Area | Purpose |
|---|---|
| Scenes (top left) | The list of scenes in the show. Click to switch, double-click to rename, drag to reorder, right-click for more. |
| Modules (bottom left) | The module library. Search it, then drag a module into the patch or double-click it. Click one to read about it in the Inspector. |
| Patch (centre) | Where you build the current scene. |
| Stage strip (bottom) | A live monitor for every stage, with buttons to open the output window, the mapper, the test pattern and stage settings. |
| Inspector (top right) | Every parameter of the selected module, or the scene's settings when nothing is selected. |
| Media (bottom right) | Video, image and sound files used by the project. |
| Status bar | Frame rate, GPU draw calls, MIDI devices, OSC port and Art-Net activity. |

Switch between **Patch** and **Live** at the top of the window (Ctrl+L).

## Patching

- **Add a module:** double-click empty space or press Tab, type a few letters, press Enter. You can also drag from the Modules panel. If one video module is selected, a new video module is added after it and connected automatically.
- **Connect:** drag from an output port (right edge of a module) to an input port (left edge). Ports that can accept the connection light up as you drag.
- **Connect to something new:** drop a wire on empty space and the quick-add list opens, filtered to modules that accept it. The new module is connected automatically.
- **Re-route:** drag from a connected input to pick the wire up again.
- **Delete:** select modules or wires and press Delete. Right-click a wire to delete just that wire.
- **Select:** click, Shift+click to add, or drag a rectangle on empty space.
- **Move the view:** Space+drag, middle-drag, or scroll with two fingers. Zoom with the mouse wheel, a pinch, or Ctrl + / −. Press F to frame everything (or just the selection).
- **Rename:** double-click a module's title.
- **Bypass:** press B. A bypassed effect passes its input straight through.
- **Previews:** video modules show a live thumbnail. Turn it off per module from the right-click menu, or everywhere in Preferences.
- **Notes:** add a Comment module to document the patch. Double-click it to edit.

### Editing values on a module

Every input that is not connected shows its value on the module.

| Type | How to edit |
|---|---|
| Number | Drag left or right to scrub (Shift for fine, Ctrl for coarse). Click without dragging to type; Tab moves to the next value. |
| On/Off | Click to toggle. |
| Choice | Click for a menu. |
| Colour | Click for a colour picker. Alpha is set in the Inspector. |
| Text | Click to type. Long text is easier to edit in the Inspector. |
| Media | Click to choose a file from the Media bin. |
| Trigger | Click the lightning bolt to fire it by hand. |

Connected inputs show the value arriving through the wire in grey.

## Values, triggers and video

- **Values** (numbers, on/off, choices, text, colours) are sent the moment they change. A connected input takes whatever arrives and converts it if needed: a number into a text input becomes text, "on" into a number becomes 1, a number into a choice picks that option.
- **Triggers** are momentary events, like a button press or a beat. A trigger arriving at a value input re-sends that input's current value. A value arriving at a trigger input fires it.
- **Video** flows only between video ports. Each frame, every Projector pulls video through the modules feeding it, so modules whose output is not being shown or previewed cost nothing.
- **Feedback loops** are allowed for video (a module that feeds back into itself sees its previous frame). For values, a loop that keeps re-triggering itself is stopped and flagged on the module.

## Scenes

A scene is a complete patch. Only the active scene runs; when you leave a scene its movies stop and its cameras close.

- **Cross-fades:** set *Cross-fade in* in the scene's Inspector. When you move to that scene, the outgoing and incoming scenes both run while their pictures cross-fade.
- **Start-of-scene actions:** a Scene Start module fires when the scene begins (optionally after a delay). Use it to start an envelope, reset a counter or set values.
- **Automatic cues:** Scene Start → Jump to Scene makes an auto-follow.
- **Sharing values between scenes:** a Broadcaster sends on a numbered channel and every Listener on that channel receives it, in whichever scenes are active.
- **Notes:** each scene has operator notes, shown in the Live view.

## Stages and outputs

A stage is a video output. Projectors choose a stage by number and a layer (higher layers are drawn on top), and set opacity, blend mode, fit, zoom, position, size and rotation.

- **Add a stage** with the + card on the stage strip.
- **Settings** (gear icon): name, resolution, output display, full screen, background colour. Choosing a display fills in its native resolution; for projection mapping, use the projector's native resolution.
- **Show the output:** the eye icon opens the stage window, or Ctrl+Shift+F opens all of them. Double-click a stage window to toggle full screen; Shift+Esc closes it. The mouse pointer is hidden over stage windows.
- **Test pattern:** shows a calibration grid, circles, colour bars and a moving sweep through the mapping, so you can line up projectors without running the show.

## Projection mapping

Open the mapper with the map icon on a stage card, or double-click the stage monitor.

Each **surface** takes a rectangle of the stage picture (its *input region*) and draws it into a warped shape on the output (its *output warp*). Stages start with one full-frame surface; add as many as you need.

- **Output warp tab:** drag the corner points. Drag inside a surface to move it. Arrow keys nudge the selected point by one output pixel (Shift for ten). Tab steps through the points. With no point selected, the arrows move the whole surface.
- **Warp types:** *Corner pin* is a true perspective transform, ideal for flat rectangles seen at an angle. *Mesh* grids (3×3 up to 8×8) bend the picture smoothly through every point, for curved screens, columns and organic shapes. Changing the grid keeps the current shape.
- **Input region tab:** drag the rectangle or its corners to choose which part of the stage picture this surface shows. With several surfaces each showing a different region, one stage can feed every face of an object.
- **Edge blend:** for overlapping projectors, set the width of the soft edge on each side, then tune gamma and curve until the overlap matches the rest of the image.
- **Colour trim:** per-surface opacity, brightness, contrast and gamma, to match projectors.
- **Outline on output:** draws the selected surface's outline on the real output, so you can see exactly where it lands.
- **Flip H / Flip V** mirror the warp (for rear projection), **Reset** returns it to the input rectangle, **Duplicate** copies a surface with its settings.

The Projection Mapping example maps three surfaces onto the faces of a cube.

## Running a show

The **Live** view is an operator screen:

- **GO** (or Space while in the Live view, or Page Down anywhere) moves to the next scene. **Back** (Page Up) goes to the previous one.
- **Now / Next** show where you are, with the current scene's notes underneath.
- **Cue list:** click any cue to jump to it.
- **Scene controls:** every Slider, Button, Switch, XY Pad, Colour Picker and Monitor in the current scene appears here as a large control, labelled with its Label setting or module name.

Tip: open the stage windows on the projectors first, then switch the editor to Live.

## Media

Import files with the + button on the Media panel (Ctrl+I) or by dragging them onto it. Drag a file into the patch to create the right player, already set up.

| Kind | Formats | Played by |
|---|---|---|
| Video | MP4 (H.264), WebM (VP8/VP9/AV1), MOV with H.264, MKV | Movie Player |
| Image | PNG (with transparency), JPEG, GIF, WebP, BMP, SVG, AVIF | Picture Player |
| Sound | WAV, MP3, OGG, FLAC, AAC/M4A, Opus | Sound Player |

H.264 MP4 at the stage resolution is the safest choice for smooth playback. ProRes and HAP files are not supported; convert them first.

Projects store both the absolute path and the path relative to the project file. Moving a project folder with its media keeps everything linked. Missing files are marked in the Media panel; right-click → Relink to point to the new location.

## Sound and music

KamiCreative can turn sound into pictures, like *photism* (seeing colours when you hear music): any setting can follow the music, and there are visual modules made just for it.

### Choosing what to listen to

Click the **Sound** button in the toolbar. Its three little bars show bass, mids and treble, and the dot flashes on each beat.

| Source | Use it for |
|---|---|
| Microphone | A mic or the line input of an audio interface. Pick the device from the list. |
| Computer | Everything the computer is playing: Spotify, YouTube, a DJ app. Works on Windows; other systems can use a virtual audio cable as a microphone. |
| Off | Only songs played by Sound Player modules are heard. |

A **Sound Player** with *Visuals React* on is always heard as well, so a song played inside KamiCreative drives the visuals without changing anything.

The panel also has:

- **Sensitivity**: how easily beats are detected and how quiet a sound still counts.
- **Boost**: extra gain for quiet inputs.
- **Smoothness**: calm, flowing movement versus fast, twitchy movement.
- **Auto-level** (on by default): adapts to the room, so quiet speech and a loud club both use the full range. In silence everything stays still.
- **Change scene every N beats**: an "auto VJ" mode that moves to the next scene by itself (looping back to the first) after a number of beats.

### Making anything react to sound

Right-click any number on a module (or click the ♪ button next to it in the Inspector) and choose what it should follow:

| Choice | Follows |
|---|---|
| Bass | Kick drums and low notes |
| Mids | Vocals, guitars and keys |
| Treble | Hi-hats, cymbals and sparkle |
| Loudness | Overall volume |
| Beat | Jumps up on every beat, then falls back |

The value turns purple with a ♪ and moves on its own. Click it to fine-tune: the value **when quiet** and **when loud**, smoothness (or fall-off for Beat), and *Reverse* to make loud sounds shrink it instead. Trigger inputs such as *Reset*, *Next* or *Trigger* can fire on every beat, or every 2, 4, 8 or 16 beats. Choose **Stop reacting to sound** from the same menu to switch it off. Reactions are saved with the project and can be undone.

### Sound modules

| Module | What it does |
|---|---|
| Sound Visualizer | Instant music visuals in eight styles: bars, mirror bars, circle, waveform, ring wave, tunnel, stars and blob. Colours can follow pitch (rainbow), two colours or one. |
| Colour Organ | The photism idea: the music is split into bands, and each band glows its own colour (low notes red, high notes violet). Layouts: columns, rings, drifting lights, or a full-screen colour wash. |
| Sound Pulse | Makes any video move with the music: zoom on the bass, flash and shake on beats, colour split and hue jumps. |
| Sound Input | Outputs loudness, bass, mids, treble, a beat trigger, beat count, tempo (BPM), beat phase and a custom frequency band, for wiring into anything. |
| Sound Player | Plays a song from the Media bin; with *Visuals React* on, everything that reacts to sound follows it. |

The recipes **Music visualizer**, **Colour organ (photism)** and **Make a video dance**, and the **Music Visuals** example (File → Open Example), are quick ways to start.

## MIDI, OSC, Art-Net and other input

- **MIDI:** connected devices are detected automatically (see the status bar or Preferences). MIDI Note In and MIDI Control In listen on any channel or a chosen one. MIDI Out sends notes, controllers or program changes to an output device by number.
- **OSC:** KamiCreative listens for OSC on UDP port 8000 by default (change it in Preferences). OSC Receive matches an address pattern with `*` and `?` wildcards and outputs up to four arguments. OSC Send transmits to any host and port, on a trigger or whenever its value changes.
- **Art-Net:** DMX Out (Art-Net) writes channel values (0–255) into a universe; output is sent when values change (up to 44 times a second) with a keep-alive every second. Set the destination IP per module or in Preferences (255.255.255.255 broadcasts).
- **Keyboard Watcher** reacts to a key (`a`, `space`, `enter`, `up`, … or `any`), in the editor or a stage window.
- **Mouse Watcher** reports the pointer position over a stage window, for interactive installations.
- **Gamepad** reads the sticks and face buttons of a game controller.
- **Sound** input is covered in [Sound and music](#sound-and-music).
- **Live Capture** brings in webcams and capture cards by device number.

## Writing shaders

Add a **GLSL Shader** module and edit its code in the Inspector; press Ctrl+Enter or Compile. Write a function `vec4 effect(vec2 uv)` that returns the colour of each pixel. Available inputs:

| Name | Meaning |
|---|---|
| `uTex0`, `uTex1` | The two video inputs (sample with `texture(uTex0, uv)`) |
| `uTime` | Seconds, scaled by the module's Time Speed |
| `uRes` | Output size in pixels |
| `uP1` … `uP4` | The four parameter inputs (0–100) |

Helper functions `luma()`, `rgb2hsv()`, `hsv2rgb()`, `rot()`, `vnoise()` and `hash21()` are included. Compile errors appear on the module with line numbers that match your code.

## Projects and safety

- Projects are saved as `.kamic` files (readable JSON). Each save is written to a temporary file first and then swapped in, and the previous version is kept as `.kamic.bak`.
- Unsaved work is backed up every 30 seconds. If KamiCreative closes unexpectedly, it offers to restore that work the next time it starts.
- Undo and redo cover module, wire, scene, media and stage changes (Ctrl+Z / Ctrl+Shift+Z).

## Keyboard shortcuts

| Action | Keys |
|---|---|
| Add module | Double-click or Tab |
| Frame all / selection | F |
| Bypass | B |
| Delete | Delete or Backspace |
| Duplicate | Ctrl+D |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z |
| Next / previous scene | Page Down / Page Up |
| GO (Live view) | Space |
| New scene | Ctrl+Shift+N |
| Patch / Live | Ctrl+L |
| Show all stages | Ctrl+Shift+F |
| Toggle stage 1–9 | Ctrl+1 … Ctrl+9 |
| Import media | Ctrl+I |
| Save / save as | Ctrl+S / Ctrl+Shift+S |
| Shortcuts | F1 |

## Troubleshooting

**Black output.** Check that the Projector is Active, its Stage # matches, and Intensity is above 0. Look for a red warning on modules in the chain.

**A movie will not play.** The module shows the reason. Convert the file to H.264 MP4 if the codec is unsupported.

**Low frame rate.** Lower the resolution of generators (their Resolution input), turn off previews in Preferences, reduce Blur and Glow radii, or lower the stage resolution. Run Help → Graphics Self-Test to see which GPU is in use; on laptops, set KamiCreative to use the high-performance GPU in Windows graphics settings.

**OSC does not arrive.** The status bar shows the OSC port in red if it could not be opened (usually another app is using it). Choose another port in Preferences and allow KamiCreative through the Windows firewall.

**No MIDI devices.** Connect the device before or while KamiCreative is running; it is picked up automatically. Some devices need their manufacturer's driver.
