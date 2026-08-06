#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t tempo_init(uint16_t bpm);
void tempo_set_bpm(uint16_t bpm);
uint16_t tempo_get_bpm(void);
void tempo_set_running(bool running);
bool tempo_is_running(void);

/**
 * Advance transport using absolute time. Returns true when a quarter-note beat fires.
 * beat_index_0_to_3 is filled on fire.
 */
bool tempo_poll_beat(int64_t now_us, uint8_t *beat_index_0_to_3);

#ifdef __cplusplus
}
#endif
