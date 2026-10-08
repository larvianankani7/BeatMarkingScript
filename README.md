# BeatMarkingScript

BeatMarkingScript is a small Adobe After Effects + Python tool for detecting drum beats from an audio layer and placing beat markers directly on the selected layer.

The project is intentionally kept minimal.

## Current Project Structure

```text
BeatMarkingScript/
│
├── ae/
│   └── BeatMarker.jsx
│
├── python/
│   └── beat_pipeline.py
│
└── .gitignore
```

### Existing Files

#### `ae/BeatMarker.jsx`

The After Effects panel.

It:

1. Gets the active composition.
2. Requires exactly one selected audio layer.
3. Renders only that layer's audio.
4. Creates a temporary working directory.
5. Sends the rendered audio to `python/beat_pipeline.py`.
6. Reads `timestamps.json`.
7. Places `Drum Beat` markers on the selected layer.
8. Cleans up the temporary directory.

This file is part of the existing working flow and should not be changed for the experimental algorithm.

#### `python/beat_pipeline.py`

The existing Python processing pipeline.

Its current flow is:

```text
AE Audio Layer
      │
      ▼
Render AIFF
      │
      ▼
beat_pipeline.py
      │
      ▼
Demucs
      │
      ▼
drums.wav
      │
      ▼
RMS / Energy Analysis
      │
      ▼
Activity Detection
      │
      ▼
Event Start / End Detection
      │
      ▼
Peak Detection
      │
      ▼
timestamps.json
      │
      ▼
After Effects Markers
```

The existing pipeline uses Demucs with the `htdemucs_ft` model and CUDA for drum separation.

It then analyzes the generated `drums.wav` using Librosa and NumPy.

The existing output remains:

```text
timestamps.json
```

with timestamps stored in:

```json
{
    "timestamps_seconds": []
}
```

This existing pipeline is intentionally left untouched.


---

# Running the Pipeline

The existing After Effects workflow remains the normal way to use the project.

Open After Effects and:

1. Open a composition.
2. Select exactly one audio layer.
3. Open the Beat Marker panel.
4. Click `Beat Marker`.
5. The existing pipeline renders the audio.
6. Demucs separates the drums.
7. The existing beat detector generates timestamps.
8. Markers are added to the selected layer.

