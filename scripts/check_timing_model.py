#!/usr/bin/env python3
"""Verify the firmware's Q32 sample-clock scheduler for every supported BPM."""

SAMPLE_RATE = 32_000
Q32 = 1 << 32
MIN_BPM = 60
MAX_BPM = 240
TEST_SECONDS = 30 * 60


def sample_at_beat(beat: int, interval_q32: int) -> int:
    # Firmware triggers on the first real sample at or after the Q32 deadline.
    return (beat * interval_q32 + Q32 - 1) // Q32


def check_bpm(bpm: int) -> tuple[int, float]:
    interval_q32 = (SAMPLE_RATE * 60 * Q32) // bpm
    beat_count = TEST_SECONDS * bpm // 60
    end_sample = sample_at_beat(beat_count, interval_q32)
    ideal_end = round(beat_count * SAMPLE_RATE * 60 / bpm)
    drift = end_sample - ideal_end

    previous = sample_at_beat(0, interval_q32)
    minimum = 1 << 30
    maximum = 0
    for beat in range(1, beat_count + 1):
        current = sample_at_beat(beat, interval_q32)
        span = current - previous
        minimum = min(minimum, span)
        maximum = max(maximum, span)
        previous = current

    if maximum - minimum > 1:
        raise AssertionError(f"{bpm} BPM interval jitter exceeds one sample")
    if abs(drift) > 1:
        raise AssertionError(f"{bpm} BPM 30-minute drift is {drift} samples")
    return drift, maximum - minimum


def main() -> None:
    worst_drift = 0
    worst_interval_spread = 0
    for bpm in range(MIN_BPM, MAX_BPM + 1):
        drift, spread = check_bpm(bpm)
        worst_drift = max(worst_drift, abs(drift))
        worst_interval_spread = max(worst_interval_spread, spread)

    print(
        "PASS:"
        f" {MIN_BPM}-{MAX_BPM} BPM,"
        f" {TEST_SECONDS // 60} min each,"
        f" drift <= {worst_drift} sample,"
        f" interval spread <= {worst_interval_spread} sample"
    )


if __name__ == "__main__":
    main()
