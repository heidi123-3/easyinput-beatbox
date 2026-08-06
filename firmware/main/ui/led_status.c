#include "led_status.h"

#include "board_pins.h"
#include "board_power.h"
#include "esp_check.h"
#include "esp_log.h"
#include "led_strip.h"

static const char *TAG = "led_status";
static led_strip_handle_t s_strip;

esp_err_t led_status_init(void)
{
    ESP_RETURN_ON_FALSE(board_power_peripherals_enabled(), ESP_ERR_INVALID_STATE, TAG,
                        "enable GPIO8 before LEDs");

    led_strip_config_t strip_config = {
        .strip_gpio_num = BOARD_GPIO_LED_DIN,
        .max_leds = BOARD_WS2812_COUNT,
        .led_model = LED_MODEL_WS2812,
        .flags.invert_out = false,
    };
    led_strip_rmt_config_t rmt_config = {
        .resolution_hz = 10 * 1000 * 1000,
        .flags.with_dma = false,
    };

    ESP_RETURN_ON_ERROR(led_strip_new_rmt_device(&strip_config, &rmt_config, &s_strip), TAG,
                        "led_strip_new_rmt_device failed");
    ESP_RETURN_ON_ERROR(led_strip_clear(s_strip), TAG, "clear failed");
    ESP_LOGI(TAG, "WS2812 ready (%d pixels)", BOARD_WS2812_COUNT);
    return ESP_OK;
}

esp_err_t led_status_set_solid_rgb(uint8_t r, uint8_t g, uint8_t b)
{
    ESP_RETURN_ON_FALSE(s_strip != NULL, ESP_ERR_INVALID_STATE, TAG, "not inited");
    for (int i = 0; i < BOARD_WS2812_COUNT; ++i) {
        ESP_RETURN_ON_ERROR(led_strip_set_pixel(s_strip, i, r, g, b), TAG, "set_pixel");
    }
    return led_strip_refresh(s_strip);
}

esp_err_t led_status_set_beat(uint8_t beat_index_0_to_3, bool running)
{
    ESP_RETURN_ON_FALSE(s_strip != NULL, ESP_ERR_INVALID_STATE, TAG, "not inited");
    ESP_RETURN_ON_FALSE(beat_index_0_to_3 < 4, ESP_ERR_INVALID_ARG, TAG, "beat index");

    ESP_RETURN_ON_ERROR(led_strip_clear(s_strip), TAG, "clear");

    for (uint8_t i = 0; i < 4; ++i) {
        const bool on = running && (i == beat_index_0_to_3);
        const uint8_t level = (i == 0 && on) ? 40 : (on ? 18 : 0);
        ESP_RETURN_ON_ERROR(led_strip_set_pixel(s_strip, i, 0, level, level ? 8 : 0), TAG, "beat pixel");
    }

    if (running) {
        ESP_RETURN_ON_ERROR(led_strip_set_pixel(s_strip, 4, 0, 12, 0), TAG, "status pixel");
    }

    return led_strip_refresh(s_strip);
}
