# Module reference

KamiCreative ships with 106 modules. This page is generated from the source (`npm run docs`), so it always matches the app.

Port types: **Number**, **On/Off**, **Choice**, **Text**, **Colour**, **Trigger**, **Video**, **Media**, **Any**.

- [Video Sources](#video-sources) (11)
- [Video FX](#video-fx) (27)
- [Compositing](#compositing) (5)
- [Output](#output) (2)
- [Generators](#generators) (9)
- [Math](#math) (10)
- [Logic](#logic) (14)
- [Control](#control) (8)
- [Input / Output](#input-output) (9)
- [Audio](#audio) (2)
- [Scene](#scene) (5)
- [Utility](#utility) (4)

## Video Sources

### GLSL Shader

Write your own fragment shader. Edit the code in the Inspector; errors appear on the module.

| Input | Type | Range / default |
|---|---|---|
| Video 1 | Video |  |
| Video 2 | Video |  |
| Param 1 | Number | 0 to 100; default 50 |
| Param 2 | Number | 0 to 100; default 50 |
| Param 3 | Number | 0 to 100; default 0 |
| Param 4 | Number | 0 to 100; default 0 |
| Time Speed | Number | default 1 |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

### Gradient

Linear, radial or angular colour gradient that can rotate and animate.

| Input | Type | Range / default |
|---|---|---|
| Type | Choice | linear / radial / angular / diamond; default linear |
| Colour A | Colour | default #0b1b3a |
| Colour B | Colour | default #ff4f8b |
| Angle | Number | -360 to 360; default 90 |
| Centre X | Number | default 50 |
| Centre Y | Number | default 50 |
| Scale % | Number | 1 to ∞; default 100 |
| Cycle Speed | Number | default 0 |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

### Live Capture

Live video from a webcam or capture card.

| Input | Type | Range / default |
|---|---|---|
| Capture | On/Off | default on |
| Device # | Number | 1 to ∞; default 1 |
| Resolution | Choice | 1280x720 / 1920x1080 / 640x480 / 3840x2160; default 1280x720 |
| Frame Rate | Number | 1 to 120; default 30 |

| Output | Type |
|---|---|
| Video Out | Video |
| Live | On/Off |

### Movie Player

Plays a video file from the Media Bin. Supports speed, looping, loop regions and seeking.

| Input | Type | Range / default |
|---|---|---|
| Movie | Media |  |
| Play | On/Off | default on |
| Loop | On/Off | default on |
| Speed | Number | 0.0625 to 16; default 1 |
| Volume % | Number | 0 to 100; default 100 |
| Loop Start % | Number | 0 to 100; default 0 |
| Loop End % | Number | 0 to 100; default 100 |
| Position % | Number | 0 to 100; default 0 |
| Seek | Trigger |  |
| Restart | Trigger |  |

| Output | Type |
|---|---|
| Video Out | Video |
| Position % | Number |
| Reached End | Trigger |
| Duration (s) | Number |
| Width | Number |
| Height | Number |

### Noise

Animated fractal noise — clouds, smoke, organic textures and displacement maps.

| Input | Type | Range / default |
|---|---|---|
| Scale | Number | 0.1 to ∞; default 4 |
| Speed | Number | default 0.2 |
| Detail | Number | 1 to 8; default 5 |
| Contrast | Number | 0 to 5; default 1 |
| Domain Warp | Number | 0 to 4; default 0.5 |
| Colour A | Colour | default #000000 |
| Colour B | Colour | default #ffffff |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

### Pattern

Geometric patterns: stripes, checkerboard, dots, grid, rings and spiral.

| Input | Type | Range / default |
|---|---|---|
| Pattern | Choice | stripes / checker / dots / grid / rings / spiral; default stripes |
| Repeats | Number | 1 to ∞; default 10 |
| Thickness % | Number | 0 to 100; default 50 |
| Angle | Number | default 0 |
| Speed | Number | default 0.1 |
| Softness | Number | 0 to 100; default 2 |
| Colour A | Colour | default #000000 |
| Colour B | Colour | default #ffffff |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

### Picture Player

Shows a still image from the Media Bin (PNG transparency supported).

| Input | Type | Range / default |
|---|---|---|
| Picture | Media |  |

| Output | Type |
|---|---|
| Video Out | Video |
| Width | Number |
| Height | Number |

### Shapes

Draws a rectangle, ellipse, triangle, polygon, star, ring or line with soft edges.

| Input | Type | Range / default |
|---|---|---|
| Shape | Choice | rectangle / ellipse / triangle / polygon / star / ring / line; default ellipse |
| Width % | Number | 0 to ∞; default 40 |
| Height % | Number | 0 to ∞; default 40 |
| Horz Pos | Number | default 0 |
| Vert Pos | Number | default 0 |
| Rotation | Number | default 0 |
| Fill Colour | Colour | default #ffffff |
| Outline Only % | Number | 0 to 50; default 0 |
| Softness % | Number | 0 to 50; default 0.5 |
| Sides / Points | Number | 3 to 64; default 5 |
| Star Inner % | Number | 1 to 100; default 45 |
| Background | Colour | default #00000000 |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

### Solid Colour

A flat colour field.

| Input | Type | Range / default |
|---|---|---|
| Colour | Colour | default #ffffff |
| Opacity % | Number | 0 to 100; default 100 |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

### Stage Grabber

Feeds a stage's previous composite back into the patch — for feedback, echoes and stage-to-stage routing.

| Input | Type | Range / default |
|---|---|---|
| Stage # | Number | 1 to ∞; default 1 |

| Output | Type |
|---|---|
| Video Out | Video |

### Text Draw

Renders text with any installed font — titles, surtitles, live data readouts.

| Input | Type | Range / default |
|---|---|---|
| Text | Text | default KamiCreative |
| Font | Text | default Segoe UI, Helvetica, Arial, sans-serif |
| Size % | Number | 0.5 to 100; default 12 |
| Weight | Choice | 300 / 400 / 600 / 700 / 900; default 700 |
| Italic | On/Off | default off |
| Colour | Colour | default #ffffff |
| Align | Choice | center / left / right; default center |
| Horz Pos | Number | default 0 |
| Vert Pos | Number | default 0 |
| Line Spacing % | Number | 50 to 400; default 120 |
| Tracking | Number | -50 to 200; default 0 |
| Shadow | Number | 0 to 100; default 0 |
| Background | Colour | default #00000000 |
| Resolution | Choice | stage / 3840x2160 / 1920x1080 / 1280x720 / 1024x768 / 1080x1920 / 1024x1024 / 512x512; default stage |

| Output | Type |
|---|---|
| Video Out | Video |

## Video FX

### Blur

High-quality Gaussian blur. Large radii are computed at reduced resolution for speed.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Radius (px) | Number | 0 to 200; default 8 |

| Output | Type |
|---|---|
| Video Out | Video |

### Chroma Key

Removes a background colour (green / blue screen) leaving transparency.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Key Colour | Colour | default #00ff00 |
| Tolerance % | Number | 0 to 100; default 30 |
| Softness % | Number | 0 to 100; default 10 |
| Spill Suppress % | Number | 0 to 100; default 50 |

| Output | Type |
|---|---|
| Video Out | Video |

### Colour Adjust

Brightness, contrast, saturation, hue and gamma in one module.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Brightness | Number | -100 to 100; default 0 |
| Contrast | Number | -100 to 100; default 0 |
| Saturation % | Number | 0 to 400; default 100 |
| Hue Shift | Number | -180 to 180; default 0 |
| Gamma | Number | 0.1 to 5; default 1 |
| Opacity % | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Video Out | Video |

### Colourise

Tints the image towards a colour, or maps its brightness onto a two-colour duotone.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Mode | Choice | tint / duotone; default tint |
| Colour | Colour | default #ff4f8b |
| Shadow (duotone) | Colour | default #101030 |
| Amount % | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Video Out | Video |

### Crop

Crops the edges of the image (cropped area becomes transparent).

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Left % | Number | 0 to 100; default 0 |
| Right % | Number | 0 to 100; default 0 |
| Top % | Number | 0 to 100; default 0 |
| Bottom % | Number | 0 to 100; default 0 |
| Feather % | Number | 0 to 50; default 0 |

| Output | Type |
|---|---|
| Video Out | Video |

### Displace

Pushes pixels around using a second video as a displacement map.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Displace Map | Video |  |
| Horizontal % | Number | -100 to 100; default 5 |
| Vertical % | Number | -100 to 100; default 5 |

| Output | Type |
|---|---|
| Video Out | Video |

### Edge Detect

Sobel edge detection — outlines and line-art looks.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Strength | Number | 0 to 20; default 2 |
| Mix Original % | Number | 0 to 100; default 0 |
| Invert | On/Off | default off |

| Output | Type |
|---|---|
| Video Out | Video |

### Feedback Trails

Video feedback: each frame is layered over a zoomed, rotated, fading copy of the last — trails, tunnels and echoes.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Persistence % | Number | 0 to 100; default 90 |
| Zoom % | Number | 50 to 200; default 101 |
| Rotate | Number | -45 to 45; default 0.5 |
| Drift X | Number | -10 to 10; default 0 |
| Drift Y | Number | -10 to 10; default 0 |
| Hue Drift | Number | -20 to 20; default 0 |
| Mode | Choice | lighten / over / mix; default lighten |
| Clear | Trigger |  |

| Output | Type |
|---|---|
| Video Out | Video |

### Film Grain

Animated film grain and optional scanlines.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Grain % | Number | 0 to 100; default 15 |
| Scanlines % | Number | 0 to 100; default 0 |
| Line Count | Number | 10 to ∞; default 360 |

| Output | Type |
|---|---|
| Video Out | Video |

### Freeze Frame

Grabs a still from the incoming video on trigger and holds it while Freeze is on.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Freeze | On/Off | default off |
| Grab | Trigger |  |

| Output | Type |
|---|---|
| Video Out | Video |

### Glitch

Digital glitch: block displacement, scan tearing and colour channel jumps.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Intensity % | Number | 0 to 100; default 30 |
| Block Size | Number | 2 to 200; default 24 |
| Change Rate | Number | 0 to 60; default 12 |

| Output | Type |
|---|---|
| Video Out | Video |

### Glow

Bloom: bright areas bleed light into their surroundings.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Threshold % | Number | 0 to 100; default 60 |
| Radius (px) | Number | 1 to 200; default 24 |
| Intensity % | Number | 0 to 500; default 120 |

| Output | Type |
|---|---|
| Video Out | Video |

### Halftone

Print-style halftone dots driven by brightness.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Dot Spacing | Number | 2 to 200; default 12 |
| Angle | Number | default 45 |
| Ink | Colour | default #000000 |
| Paper | Colour | default #f4efe4 |
| Keep Colour | On/Off | default off |

| Output | Type |
|---|---|
| Video Out | Video |

### Invert

Inverts colours (negative).

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Amount % | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Video Out | Video |

### Kaleidoscope

Mirrors wedges of the image around a centre point.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Segments | Number | 1 to 64; default 6 |
| Rotation | Number | default 0 |
| Spin Speed | Number | default 0.05 |
| Zoom % | Number | 1 to ∞; default 100 |
| Source X | Number | default 50 |
| Source Y | Number | default 50 |

| Output | Type |
|---|---|
| Video Out | Video |

### Levels

Input black / white points, gamma and output range — classic levels control.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| In Black | Number | 0 to 100; default 0 |
| In White | Number | 0 to 100; default 100 |
| Gamma | Number | 0.1 to 5; default 1 |
| Out Black | Number | 0 to 100; default 0 |
| Out White | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Video Out | Video |

### Luma Key

Makes dark (or bright) areas transparent.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Threshold % | Number | 0 to 100; default 10 |
| Softness % | Number | 0 to 100; default 10 |
| Key Out Bright | On/Off | default off |

| Output | Type |
|---|---|
| Video Out | Video |

### Mirror

Reflects one half (or quarter) of the image onto the other.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Mode | Choice | left → right / right → left / top → bottom / bottom → top / quad / flip horizontal / flip vertical; default left → right |

| Output | Type |
|---|---|
| Video Out | Video |

### Pixelate

Mosaic / blocky pixel effect.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Block Size | Number | 1 to 512; default 16 |

| Output | Type |
|---|---|
| Video Out | Video |

### Posterise

Reduces the number of colour levels for a graphic look.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Levels | Number | 2 to 64; default 5 |

| Output | Type |
|---|---|
| Video Out | Video |

### RGB Split

Chromatic aberration — offsets the red, green and blue channels.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Amount | Number | 0 to 20; default 1 |
| Angle | Number | default 0 |
| Radial | On/Off | default off |

| Output | Type |
|---|---|
| Video Out | Video |

### Threshold

Turns the image into two colours split at a brightness level.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Level % | Number | 0 to 100; default 50 |
| Softness % | Number | 0 to 50; default 2 |
| Dark Colour | Colour | default #000000 |
| Light Colour | Colour | default #ffffff |

| Output | Type |
|---|---|
| Video Out | Video |

### Tile

Repeats the image in a grid, optionally mirroring alternate tiles.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Columns | Number | 1 to 64; default 3 |
| Rows | Number | 1 to 64; default 3 |
| Mirror Alternate | On/Off | default off |
| Gap % | Number | 0 to 45; default 0 |

| Output | Type |
|---|---|
| Video Out | Video |

### Transform

Zoom, move and rotate the image inside its frame, with wrap modes for tiling.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Zoom % | Number | 1 to ∞; default 100 |
| Horz Pos | Number | default 0 |
| Vert Pos | Number | default 0 |
| Rotation | Number | default 0 |
| Edges | Choice | transparent / clamp / repeat / mirror; default transparent |

| Output | Type |
|---|---|
| Video Out | Video |

### Video Delay

Delays video by a number of frames (up to 90). Memory use grows with resolution × frames.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Delay (frames) | Number | 1 to 90; default 15 |
| Buffer Scale % | Number | 10 to 100; default 50 |

| Output | Type |
|---|---|
| Video Out | Video |

### Vignette

Darkens (or colours) the edges of the frame.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Amount % | Number | 0 to 100; default 60 |
| Size % | Number | 0 to 150; default 60 |
| Softness % | Number | 1 to 100; default 50 |
| Colour | Colour | default #000000 |

| Output | Type |
|---|---|
| Video Out | Video |

### Wave Distort

Ripples the image with animated sine waves.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Amplitude | Number | 0 to 50; default 2 |
| Frequency | Number | 0 to 200; default 10 |
| Speed | Number | default 1 |
| Direction | Choice | horizontal / vertical / both / radial; default both |

| Output | Type |
|---|---|
| Video Out | Video |

## Compositing

### Alpha Mask

Uses a second video (its brightness or alpha) to cut out the first.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Mask | Video |  |
| Mask From | Choice | luminance / alpha; default luminance |
| Invert | On/Off | default off |

| Output | Type |
|---|---|
| Video Out | Video |

### Layer Blend

Blends a layer over a base using Photoshop-style blend modes.

| Input | Type | Range / default |
|---|---|---|
| Base | Video |  |
| Layer | Video |  |
| Blend Mode | Choice | normal / add / screen / multiply / overlay / soft light / difference / lighten / darken / subtract / colour dodge / exclusion; default screen |
| Opacity % | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Video Out | Video |

### Picture in Picture

Places a scaled, positioned, rotated video over a background video.

| Input | Type | Range / default |
|---|---|---|
| Background | Video |  |
| Foreground | Video |  |
| Horz Pos | Number | default 50 |
| Vert Pos | Number | default -50 |
| Size % | Number | 0 to ∞; default 35 |
| Rotation | Number | default 0 |
| Opacity % | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Video Out | Video |

### Video Mixer

Transitions between two videos: crossfade, additive, wipes, iris and luma/noise dissolves.

| Input | Type | Range / default |
|---|---|---|
| Video A | Video |  |
| Video B | Video |  |
| Mix % | Number | 0 to 100; default 50 |
| Transition | Choice | crossfade / additive / wipe left / wipe up / iris / luma wipe / dissolve noise; default crossfade |
| Edge Softness % | Number | 0 to 50; default 10 |

| Output | Type |
|---|---|
| Video Out | Video |

### Video Switcher

Selects one of several video inputs — a live vision switcher.

_The number of ports can be changed from the module's context menu or the Inspector._

| Input | Type | Range / default |
|---|---|---|
| Input # | Number | 1 to 4; default 1 |
| Video 1 | Video |  |
| Video 2 | Video |  |
| Video 3 | Video |  |
| Video 4 | Video |  |

| Output | Type |
|---|---|
| Video Out | Video |

## Output

### Projector

Sends video to a stage. Layer order, opacity, blend, zoom, position and rotation are per projector.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |
| Active | On/Off | default on |
| Stage # | Number | 1 to ∞; default 1 |
| Layer | Number | -100 to 100; default 0 |
| Intensity % | Number | 0 to 100; default 100 |
| Blend | Choice | alpha / add / screen / multiply / subtract; default alpha |
| Fit | Choice | fit / fill / stretch / native; default fit |
| Zoom % | Number | 0 to ∞; default 100 |
| Horz Pos | Number | default 0 |
| Vert Pos | Number | default 0 |
| Width % | Number | 0 to ∞; default 100 |
| Height % | Number | 0 to ∞; default 100 |
| Rotation | Number | default 0 |

### Video Monitor

A large preview of a video signal inside the patch. Does not output anywhere.

| Input | Type | Range / default |
|---|---|---|
| Video In | Video |  |

| Output | Type |
|---|---|
| Resolution | Text |

## Generators

### Beat Clock

Musical clock: beat and bar triggers, beat count and phase for tempo-synced visuals.

| Input | Type | Range / default |
|---|---|---|
| Run | On/Off | default on |
| BPM | Number | 1 to 999; default 120 |
| Beats / Bar | Number | 1 to 32; default 4 |
| Tap Tempo | Trigger |  |
| Reset | Trigger |  |

| Output | Type |
|---|---|
| Beat | Trigger |
| Bar | Trigger |
| Beat # | Number |
| Beat Phase | Number |
| BPM | Number |

### Counter

Counts up or down on triggers within a range, with wrap, clamp or ping-pong behaviour.

| Input | Type | Range / default |
|---|---|---|
| Add | Trigger |  |
| Subtract | Trigger |  |
| Reset | Trigger |  |
| Step | Number | default 1 |
| Min | Number | default 0 |
| Max | Number | default 10 |
| At Limit | Choice | wrap / clamp / ping-pong; default wrap |

| Output | Type |
|---|---|
| Count | Number |
| Hit Limit | Trigger |

### Envelope Generator

Attack / hold / release envelope started by a trigger. Great for flashes, fades and swells.

| Input | Type | Range / default |
|---|---|---|
| Trigger | Trigger |  |
| Attack (s) | Number | 0 to ∞; default 0.5 |
| Hold (s) | Number | 0 to ∞; default 0 |
| Release (s) | Number | 0 to ∞; default 1 |
| Low | Number | default 0 |
| High | Number | default 100 |
| Curve | Choice | linear / ease in / ease out / ease in-out / exponential; default ease in-out |
| Stop | Trigger |  |

| Output | Type |
|---|---|
| Output | Number |
| Done | Trigger |
| Active | On/Off |

### Pulse Generator

Fires a trigger at a steady rate, set in Hz or BPM.

| Input | Type | Range / default |
|---|---|---|
| Run | On/Off | default on |
| Rate Mode | Choice | Hz / BPM / Interval (s); default Hz |
| Rate | Number | 0 to ∞; default 1 |

| Output | Type |
|---|---|
| Pulse | Trigger |
| Count | Number |

### Ramp

Glides from the current value to a target over a duration whenever Go is triggered (or the target changes, if Auto is on).

| Input | Type | Range / default |
|---|---|---|
| Target | Number | default 100 |
| Duration (s) | Number | 0 to ∞; default 2 |
| Curve | Choice | linear / ease in / ease out / ease in-out / exponential; default ease in-out |
| Auto Go | On/Off | default on |
| Go | Trigger |  |
| Jump | Trigger |  |

| Output | Type |
|---|---|
| Output | Number |
| Done | Trigger |

### Random

Outputs a new random number each time it is triggered.

| Input | Type | Range / default |
|---|---|---|
| Trigger | Trigger |  |
| Min | Number | default 0 |
| Max | Number | default 100 |
| Whole Numbers | On/Off | default off |
| No Repeats | On/Off | default off |

| Output | Type |
|---|---|
| Output | Number |

### Stopwatch

Measures elapsed time while running. Outputs seconds and a formatted clock string.

| Input | Type | Range / default |
|---|---|---|
| Run | On/Off | default on |
| Reset | Trigger |  |
| Alarm At (s) | Number | 0 to ∞; default 0 |

| Output | Type |
|---|---|
| Seconds | Number |
| Clock | Text |
| Alarm | Trigger |

### System Time

Current wall-clock time and date, for scheduled installations.

| Output | Type |
|---|---|
| Hour | Number |
| Minute | Number |
| Second | Number |
| Weekday (0=Sun) | Number |
| Time Text | Text |
| Date Text | Text |
| Each Minute | Trigger |

### Wave Generator

Continuously outputs a periodic waveform scaled between Min and Max.

| Input | Type | Range / default |
|---|---|---|
| Run | On/Off | default on |
| Waveform | Choice | sine / triangle / sawtooth / ramp down / square / random / smooth random; default sine |
| Frequency (Hz) | Number | 0 to 100; default 0.5 |
| Min | Number | default 0 |
| Max | Number | default 100 |
| Phase | Number | 0 to 1; default 0 |
| Reset | Trigger |  |

| Output | Type |
|---|---|
| Output | Number |

## Math

### Calculator

Combines two numbers with an operator.

| Input | Type | Range / default |
|---|---|---|
| Value 1 | Number | default 0 |
| Operator | Choice | + / - / × / ÷ / mod / min / max / power / average / difference / atan2; default + |
| Value 2 | Number | default 0 |

| Output | Type |
|---|---|
| Result | Number |

### Expression

Evaluates a formula using inputs a, b, c, d and time t. Example: sin(t * 2) * a + b

| Input | Type | Range / default |
|---|---|---|
| Formula | Text | default a * b |
| a | Number | default 1 |
| b | Number | default 1 |
| c | Number | default 0 |
| d | Number | default 0 |
| Evaluate Every Frame | On/Off | default off |

| Output | Type |
|---|---|
| Result | Number |

### Function

Applies a single-input math function (trig functions use degrees).

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Function | Choice | abs / negate / reciprocal / sqrt / square / sin / cos / tan / log / exp / sign / percent → 0-1 / 0-1 → percent / MIDI → percent / dB → gain / gain → dB; default abs |

| Output | Type |
|---|---|
| Output | Number |

### Inside Range

Reports whether a value lies within a range, with triggers when it enters or leaves.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Low | Number | default 25 |
| High | Number | default 75 |

| Output | Type |
|---|---|
| Inside | On/Off |
| Enter | Trigger |
| Exit | Trigger |

### Interpolate

Blends between A and B by Mix (0-100%).

| Input | Type | Range / default |
|---|---|---|
| A | Number | default 0 |
| B | Number | default 100 |
| Mix % | Number | 0 to 100; default 50 |

| Output | Type |
|---|---|
| Output | Number |

### Limit

Keeps a value within Min / Max by clamping, wrapping or folding.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Min | Number | default 0 |
| Max | Number | default 100 |
| Mode | Choice | clamp / wrap / fold; default clamp |

| Output | Type |
|---|---|
| Output | Number |

### Map Range

Rescales a value from one range to another, with optional clamping and curve.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| In Min | Number | default 0 |
| In Max | Number | default 127 |
| Out Min | Number | default 0 |
| Out Max | Number | default 100 |
| Clamp | On/Off | default on |
| Curve | Choice | linear / ease in / ease out / ease in-out / exponential; default linear |

| Output | Type |
|---|---|
| Output | Number |

### Peak & Average

Tracks running minimum, maximum and average of a value over a window.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Window (s) | Number | 0.05 to ∞; default 2 |
| Reset | Trigger |  |

| Output | Type |
|---|---|
| Min | Number |
| Max | Number |
| Average | Number |

### Round

Rounds a value, or quantises it to a step size.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Mode | Choice | round / floor / ceil / truncate; default round |
| Step | Number | 0 to ∞; default 1 |

| Output | Type |
|---|---|
| Output | Number |

### Smoother

Smooths jumpy values (sensors, audio, MIDI) by gliding towards the input.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Smoothing | Number | 0 to 99.9; default 80 |

| Output | Type |
|---|---|
| Output | Number |

## Logic

### Change Detector

Fires triggers when a value changes, increases or decreases.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Min Change | Number | 0 to ∞; default 0 |

| Output | Type |
|---|---|
| Changed | Trigger |
| Increased | Trigger |
| Decreased | Trigger |
| Delta | Number |

### Comparator

Compares two values. Outputs on/off plus triggers when the result becomes true or false.

| Input | Type | Range / default |
|---|---|---|
| Value 1 | Number | default 0 |
| Test | Choice | = / ≠ / < / > / ≤ / ≥; default > |
| Value 2 | Number | default 50 |

| Output | Type |
|---|---|
| Result | On/Off |
| Became True | Trigger |
| Became False | Trigger |

### Gate

Passes values (and triggers) through only while Open is on.

| Input | Type | Range / default |
|---|---|---|
| Value | Any | default 0 |
| Trigger In | Trigger |  |
| Open | On/Off | default on |

| Output | Type |
|---|---|
| Value | Any |
| Trigger Out | Trigger |

### Logic Gate

Boolean logic on two on/off inputs.

| Input | Type | Range / default |
|---|---|---|
| A | On/Off | default off |
| Operation | Choice | AND / OR / XOR / NAND / NOR / NOT A; default AND |
| B | On/Off | default off |

| Output | Type |
|---|---|
| Result | On/Off |

### Lookup Table

Maps an index (1-based) to an entry in a comma-separated table.

| Input | Type | Range / default |
|---|---|---|
| Index | Number | default 1 |
| Table | Text | default red, green, blue |
| Wrap | On/Off | default on |

| Output | Type |
|---|---|
| Entry | Any |
| Count | Number |

### Router

Routes an incoming value or trigger to one of several outputs.

_The number of ports can be changed from the module's context menu or the Inspector._

| Input | Type | Range / default |
|---|---|---|
| Value | Any | default 0 |
| Trigger In | Trigger |  |
| Output # | Number | 1 to 4; default 1 |

| Output | Type |
|---|---|
| Out 1 | Any |
| Out 2 | Any |
| Out 3 | Any |
| Out 4 | Any |

### Sample & Hold

Captures the input value when triggered and holds it until the next trigger.

| Input | Type | Range / default |
|---|---|---|
| Value | Any | default 0 |
| Sample | Trigger |  |

| Output | Type |
|---|---|
| Held | Any |

### Selector

Chooses one of several input values to pass to the output.

_The number of ports can be changed from the module's context menu or the Inspector._

| Input | Type | Range / default |
|---|---|---|
| Input # | Number | 1 to 4; default 1 |
| In 1 | Any | default 0 |
| In 2 | Any | default 0 |
| In 3 | Any | default 0 |
| In 4 | Any | default 0 |

| Output | Type |
|---|---|
| Output | Any |

### Step Sequencer

Steps through a comma-separated list of values each time it is advanced.

| Input | Type | Range / default |
|---|---|---|
| Values | Text | default 0, 25, 50, 75, 100 |
| Next | Trigger |  |
| Previous | Trigger |  |
| Reset | Trigger |  |
| Jump To # | Number | 1 to ∞; default 1 |
| Order | Choice | forward / ping-pong / random; default forward |

| Output | Type |
|---|---|
| Value | Any |
| Step # | Number |
| Wrapped | Trigger |

### Text Formatter

Builds text from a template. Use {a}, {b}, {c}, {d} as placeholders, {a:2} for 2 decimals.

| Input | Type | Range / default |
|---|---|---|
| Template | Text | default Value: {a} |
| a | Any | default 0 |
| b | Any | default 0 |
| c | Any |  |
| d | Any |  |

| Output | Type |
|---|---|
| Text | Text |

### Toggle

Flips between off and on each time it is triggered (flip-flop).

| Input | Type | Range / default |
|---|---|---|
| Toggle | Trigger |  |
| Set On | Trigger |  |
| Set Off | Trigger |  |
| Initial | On/Off | default off |

| Output | Type |
|---|---|
| State | On/Off |
| Turned On | Trigger |
| Turned Off | Trigger |

### Trigger Delay

Delays triggers (and optionally values) by a time in seconds. Multiple pending triggers are queued.

| Input | Type | Range / default |
|---|---|---|
| Trigger | Trigger |  |
| Value | Any | default 0 |
| Delay (s) | Number | 0 to ∞; default 1 |
| Cancel | Trigger |  |

| Output | Type |
|---|---|
| Trigger | Trigger |
| Value | Any |

### Trigger Divider

Passes one trigger out of every N, e.g. every 4th beat.

| Input | Type | Range / default |
|---|---|---|
| Trigger | Trigger |  |
| Every N | Number | 1 to ∞; default 4 |
| Reset | Trigger |  |

| Output | Type |
|---|---|
| Trigger | Trigger |

### Trigger Value

Sends a preset value whenever it is triggered — the classic way to set a parameter from a cue.

| Input | Type | Range / default |
|---|---|---|
| Trigger | Trigger |  |
| Value | Any | default 0 |

| Output | Type |
|---|---|
| Output | Any |

## Control

### Button

A push button. Momentary buttons fire on press and release; toggle buttons latch.

| Input | Type | Range / default |
|---|---|---|
| Mode | Choice | momentary / toggle; default momentary |

| Output | Type |
|---|---|
| Pressed | Trigger |
| Released | Trigger |
| State | On/Off |

### Colour Picker

Pick a colour; outputs the colour and its red / green / blue components (0-255).

| Output | Type |
|---|---|
| Colour | Colour |
| Red | Number |
| Green | Number |
| Blue | Number |

### Make Colour

Builds a colour from red, green, blue (0-255) and alpha (0-100).

| Input | Type | Range / default |
|---|---|---|
| Red | Number | 0 to 255; default 255 |
| Green | Number | 0 to 255; default 255 |
| Blue | Number | 0 to 255; default 255 |
| Alpha % | Number | 0 to 100; default 100 |

| Output | Type |
|---|---|
| Colour | Colour |

### Monitor

Displays any incoming value in large type. Handy for debugging or on a Live panel.

| Input | Type | Range / default |
|---|---|---|
| Value | Any | default 0 |

### Scope

Plots a value over time, like an oscilloscope. Useful for tuning sensors and envelopes.

| Input | Type | Range / default |
|---|---|---|
| Value | Number | default 0 |
| Min | Number | default 0 |
| Max | Number | default 100 |

### Slider

A fader you can drag in the patch or on the Live panel. Also appears in Show mode.

| Input | Type | Range / default |
|---|---|---|
| Min | Number | default 0 |
| Max | Number | default 100 |
| Set Value | Number | default 0 |

| Output | Type |
|---|---|
| Value | Number |

### Switch

An on/off switch control.

| Output | Type |
|---|---|
| State | On/Off |

### XY Pad

Two-dimensional controller. Drag the puck to output X and Y (0-100).

| Output | Type |
|---|---|
| X | Number |
| Y | Number |

## Input / Output

### DMX Out (Art-Net)

Drives lighting over Art-Net: writes channel values (0-255) into a DMX universe.

_The number of ports can be changed from the module's context menu or the Inspector._

| Input | Type | Range / default |
|---|---|---|
| Universe | Number | 0 to 32767; default 0 |
| Start Channel | Number | 1 to 512; default 1 |
| Node IP (blank=prefs) | Text |  |
| Ch +0 | Number | 0 to 255; default 0 |
| Ch +1 | Number | 0 to 255; default 0 |
| Ch +2 | Number | 0 to 255; default 0 |
| Ch +3 | Number | 0 to 255; default 0 |

### Gamepad

Reads a game controller: two sticks (-100..100) and the four face buttons.

| Input | Type | Range / default |
|---|---|---|
| Pad # | Number | 1 to 4; default 1 |

| Output | Type |
|---|---|
| Left X | Number |
| Left Y | Number |
| Right X | Number |
| Right Y | Number |
| Button A | On/Off |
| Button B | On/Off |
| Button X | On/Off |
| Button Y | On/Off |
| Any Pressed | Trigger |
| Connected | On/Off |

### Keyboard Watcher

Watches the computer keyboard. Set Key to a letter, "space", "enter", "up"… or "any".

| Input | Type | Range / default |
|---|---|---|
| Key | Text | default space |

| Output | Type |
|---|---|
| Pressed | Trigger |
| Released | Trigger |
| Held | On/Off |
| Key Name | Text |

### MIDI Control In

Listens for a MIDI control change (knob / fader). Outputs raw 0-127 and 0-100%.

| Input | Type | Range / default |
|---|---|---|
| Channel (0=any) | Number | 0 to 16; default 0 |
| Controller (-1=any) | Number | -1 to 127; default 1 |

| Output | Type |
|---|---|
| Value 0-127 | Number |
| Value % | Number |
| Controller # | Number |

### MIDI Note In

Listens for MIDI notes from any connected device. Channel 0 / Note -1 mean "any".

| Input | Type | Range / default |
|---|---|---|
| Channel (0=any) | Number | 0 to 16; default 0 |
| Note (-1=any) | Number | -1 to 127; default -1 |

| Output | Type |
|---|---|
| Note | Number |
| Velocity | Number |
| Note On | Trigger |
| Note Off | Trigger |
| Gate | On/Off |

### MIDI Out

Sends MIDI notes or control changes to an output device (1 = first device).

| Input | Type | Range / default |
|---|---|---|
| Device # | Number | 1 to ∞; default 1 |
| Message | Choice | note / control / program; default note |
| Channel | Number | 1 to 16; default 1 |
| Note / CC # | Number | 0 to 127; default 60 |
| Velocity / Value | Number | 0 to 127; default 100 |
| Note Length (s) | Number | 0 to ∞; default 0.25 |
| Send | Trigger |  |
| Send On Change | On/Off | default off |

### Mouse Watcher

Reports the mouse position over a stage output window (0-100, top-left origin) and its buttons.

| Input | Type | Range / default |
|---|---|---|
| Stage # (0=any) | Number | 0 to ∞; default 0 |

| Output | Type |
|---|---|
| X | Number |
| Y | Number |
| Button | On/Off |
| Click | Trigger |

### OSC Receive

Receives Open Sound Control messages (port set in Preferences). Address supports * and ? wildcards.

| Input | Type | Range / default |
|---|---|---|
| Address | Text | default /kami/1 |

| Output | Type |
|---|---|
| Arg 1 | Any |
| Arg 2 | Any |
| Arg 3 | Any |
| Arg 4 | Any |
| Received | Trigger |
| Address | Text |

### OSC Send

Sends an OSC message over UDP to another app or device.

| Input | Type | Range / default |
|---|---|---|
| Host | Text | default 127.0.0.1 |
| Port | Number | 1 to 65535; default 9000 |
| Address | Text | default /kami/out |
| Arg 1 | Any | default 0 |
| Arg 2 | Any |  |
| Send | Trigger |  |
| Send On Change | On/Off | default on |

## Audio

### Sound Analyser

Listens to the microphone / line input. Outputs overall level, low / mid / high bands and a beat trigger.

| Input | Type | Range / default |
|---|---|---|
| Listen | On/Off | default on |
| Gain | Number | 0 to 20; default 1 |
| Smoothing | Number | 0 to 99; default 60 |
| Beat Sensitivity | Number | 0 to 100; default 50 |

| Output | Type |
|---|---|
| Level | Number |
| Low | Number |
| Mid | Number |
| High | Number |
| Beat | Trigger |

### Sound Player

Plays an audio file from the Media Bin with volume, pan, speed and looping. Outputs its level.

| Input | Type | Range / default |
|---|---|---|
| Sound | Media |  |
| Play | On/Off | default on |
| Loop | On/Off | default off |
| Volume % | Number | 0 to 200; default 100 |
| Pan | Number | -100 to 100; default 0 |
| Speed | Number | 0.1 to 4; default 1 |
| Position % | Number | 0 to 100; default 0 |
| Seek | Trigger |  |
| Restart | Trigger |  |

| Output | Type |
|---|---|
| Position % | Number |
| Level | Number |
| Ended | Trigger |
| Duration (s) | Number |

## Scene

### Broadcaster

Sends a value on a numbered channel to every Listener in all active scenes — wireless patch cords.

| Input | Type | Range / default |
|---|---|---|
| Channel | Number | 1 to 999; default 1 |
| Value | Any | default 0 |
| Trigger | Trigger |  |

### Jump to Scene

Changes scene when triggered: next, previous, first, last or a scene number, with an optional cross-fade.

| Input | Type | Range / default |
|---|---|---|
| Go | Trigger |  |
| Destination | Choice | next / previous / scene # / first / last; default next |
| Scene # | Number | 1 to ∞; default 1 |
| Fade (s, -1 = scene) | Number | -1 to ∞; default -1 |

### Listener

Receives values and triggers from Broadcasters on the same channel.

| Input | Type | Range / default |
|---|---|---|
| Channel | Number | 1 to 999; default 1 |

| Output | Type |
|---|---|
| Value | Any |
| Received | Trigger |

### Scene Info

Name and number of the scene this module lives in, and seconds since it started.

| Output | Type |
|---|---|
| Name | Text |
| Scene # | Number |
| Scene Count | Number |
| Time In Scene | Number |

### Scene Start

Fires a trigger when this scene becomes active. Use it to start movies, reset counters, set values.

| Input | Type | Range / default |
|---|---|---|
| Delay (s) | Number | 0 to ∞; default 0 |

| Output | Type |
|---|---|
| Started | Trigger |

## Utility

### Comment

A sticky note for documenting your patch.

### Trigger Merge

Combines several trigger sources into one output.

| Input | Type | Range / default |
|---|---|---|
| Trigger 1 | Trigger |  |
| Trigger 2 | Trigger |  |
| Trigger 3 | Trigger |  |
| Trigger 4 | Trigger |  |

| Output | Type |
|---|---|
| Trigger | Trigger |
| Last Input # | Number |

### Trigger Rate

Measures how often triggers arrive (per second and per minute).

| Input | Type | Range / default |
|---|---|---|
| Trigger | Trigger |  |

| Output | Type |
|---|---|
| Per Second | Number |
| Per Minute | Number |
| Total | Number |

### Value

Holds a value you type in and sends it on. Useful as a shared constant feeding many modules.

| Input | Type | Range / default |
|---|---|---|
| Value | Any | default 0 |
| Re-send | Trigger |  |

| Output | Type |
|---|---|
| Value | Any |
