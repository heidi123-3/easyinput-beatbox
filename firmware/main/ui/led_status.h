#pragma once

#include "esp_err.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t led_status_init(void);
esp_err_t led_status_set_beat(uint8_t beat_index_0_to_3, bool running);
esp_err_t led_status_set_solid_rgb(uint8_t r, uint8_t g, uint8_t b);

#ifdef __cplusplus
}
#endif
