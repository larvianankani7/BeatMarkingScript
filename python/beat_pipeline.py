import sys
import os
import json
import shutil
import subprocess
import librosa
import numpy as np

input_file = os.path.abspath(sys.argv[1])
work_dir = os.path.abspath(sys.argv[2])

os.makedirs(work_dir, exist_ok=True)

drums_output = os.path.join(work_dir, "drums.wav")
timestamps_output = os.path.join(work_dir, "timestamps.json")
demucs_dir = os.path.join(work_dir, "separated")

cmd = [
    sys.executable,
    "-m", "demucs",
    "-d", "cuda",
    "-n", "htdemucs_ft",
    "--two-stems", "drums",
    "-o", demucs_dir,
    input_file
]

subprocess.run(cmd, check=True)

song_name = os.path.splitext(os.path.basename(input_file))[0]

generated_drums = os.path.join(
    demucs_dir,
    "htdemucs_ft",
    song_name,
    "drums.wav"
)

if not os.path.exists(generated_drums):
    raise FileNotFoundError("Demucs did not generate drums.wav")

shutil.copy2(generated_drums, drums_output)

y, sr = librosa.load(
    drums_output,
    sr=None,
    mono=True
)

frame_rate = 60.0
frame_duration = 1.0 / frame_rate

hop_length = 256

energy = librosa.feature.rms(
    y=y,
    frame_length=2048,
    hop_length=hop_length,
    center=True
)[0]

energy = np.log1p(energy * 1000)

smooth_window = max(
    3,
    int(0.08 * sr / hop_length)
)

kernel = np.ones(smooth_window) / smooth_window

smoothed = np.convolve(
    energy,
    kernel,
    mode="same"
)

baseline_window = max(
    15,
    int(0.5 * sr / hop_length)
)

baseline_kernel = np.ones(baseline_window) / baseline_window

baseline = np.convolve(
    smoothed,
    baseline_kernel,
    mode="same"
)

activity = smoothed - baseline

activity_median = np.median(activity)

activity_mad = np.median(
    np.abs(activity - activity_median)
) + 1e-9

normalized = (
    activity - activity_median
) / activity_mad

start_threshold = 1.5
end_threshold = 0.2

events = []
inside_event = False
start_frame = 0

for i in range(len(normalized)):
    if not inside_event:
        if normalized[i] >= start_threshold:
            inside_event = True
            start_frame = i
    else:
        if normalized[i] <= end_threshold:
            end_frame = i

            if end_frame > start_frame:
                events.append(
                    (start_frame, end_frame)
                )

            inside_event = False

if inside_event:
    events.append(
        (start_frame, len(normalized) - 1)
    )

timestamps = []

frame_correction = 4

for start_frame, end_frame in events:
    if end_frame <= start_frame:
        continue

    event_segment = smoothed[
        start_frame:end_frame + 1
    ]

    if len(event_segment) == 0:
        continue

    peak_index = start_frame + int(
        np.argmax(event_segment)
    )

    corrected_index = max(
        0,
        peak_index - frame_correction
    )

    peak_time = (
        corrected_index * hop_length
    ) / sr

    timestamps.append(
        round(float(peak_time), 3)
    )

timestamps = sorted(
    set(timestamps)
)

with open(timestamps_output, "w") as f:
    json.dump(
        {
            "sample_rate": sr,
            "frame_rate": frame_rate,
            "count": len(timestamps),
            "timestamps_seconds": timestamps
        },
        f,
        indent=2
    )

print(json.dumps({
    "drums": drums_output,
    "timestamps": timestamps_output,
    "count": len(timestamps),
    "timestamps_seconds": timestamps
}))

shutil.rmtree(
    demucs_dir,
    ignore_errors=True
)