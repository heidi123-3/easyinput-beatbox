#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t audio_click_init(void);
esp_err_t audio_click_play_normal(void);
esp_err_t audio_click_play_accent(void);

#ifdef __cplusplus
}
#endif
