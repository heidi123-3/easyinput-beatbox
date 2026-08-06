#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint8_t step;
    uint8_t beat_in_bar;
    bool accent;
    uint64_t sample_index;
} audio_beat_event_t;

/**
 * Continuous, sample-clocked I2S renderer.
 *
 * Metronome edges are generated inside the audio render loop, not by a
 * FreeRTOS/UI timer. External sounds enter a queue and are mixed as separate
 * voices, so a new sound never overwrites a pending/playing one.
 */
esp_err_t audio_click_init(void);
esp_err_t audio_click_set_bpm(uint16_t bpm);
esp_err_t audio_click_set_running(bool running);

/** Non-blocking beat event for LED/host visualization. */
bool audio_click_poll_beat(audio_beat_event_t *event);

/** Queue independent voices for future drum/pad use. */
esp_err_t audio_click_play_normal(void);
esp_err_t audio_click_play_accent(void);

/** Stop transport, flush queued events, and silence all active voices. */
esp_err_t audio_click_stop(void);

#ifdef __cplusplus
}
#endif
