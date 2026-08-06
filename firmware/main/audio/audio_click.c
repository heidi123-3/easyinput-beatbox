#include "audio_click.h"

#include "board_pins.h"
#include "board_power.h"
#include "driver/i2s_std.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <math.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static const char *TAG = "audio_click";

#define CLICK_SAMPLE_RATE   22050
#define CLICK_FRAMES        512

static i2s_chan_handle_t s_tx;
static int16_t s_click_normal[CLICK_FRAMES];
static int16_t s_click_accent[CLICK_FRAMES];
static bool s_ready;

static void synthesize_click(int16_t *dst, float amplitude)
{
    memset(dst, 0, CLICK_FRAMES * sizeof(int16_t));
    for (int i = 0; i < CLICK_FRAMES; ++i) {
        const float t = (float)i / (float)CLICK_SAMPLE_RATE;
        const float env = expf(-t * 80.0f);
        const float sample = sinf(2.0f * (float)M_PI * 1000.0f * t) * env * amplitude;
        dst[i] = (int16_t)(sample * 32767.0f);
    }
}

esp_err_t audio_click_init(void)
{
    ESP_RETURN_ON_FALSE(board_power_peripherals_enabled(), ESP_ERR_INVALID_STATE, TAG,
                        "enable GPIO8 before speaker");

    synthesize_click(s_click_normal, 0.25f);
    synthesize_click(s_click_accent, 0.45f);

    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
    ESP_RETURN_ON_ERROR(i2s_new_channel(&chan_cfg, &s_tx, NULL), TAG, "i2s_new_channel");

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(CLICK_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = BOARD_GPIO_SPK_BCLK,
            .ws = BOARD_GPIO_SPK_WS,
            .dout = BOARD_GPIO_SPK_DOUT,
            .din = I2S_GPIO_UNUSED,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(s_tx, &std_cfg), TAG, "init_std_mode");
    ESP_RETURN_ON_ERROR(i2s_channel_enable(s_tx), TAG, "channel_enable");
    s_ready = true;
    ESP_LOGI(TAG, "MAX98357A click path ready @ %d Hz", CLICK_SAMPLE_RATE);
    return ESP_OK;
}

static esp_err_t play_buffer(const int16_t *buf)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "not ready");
    size_t written = 0;
    return i2s_channel_write(s_tx, buf, CLICK_FRAMES * sizeof(int16_t), &written, pdMS_TO_TICKS(100));
}

esp_err_t audio_click_play_normal(void)
{
    return play_buffer(s_click_normal);
}

esp_err_t audio_click_play_accent(void)
{
    return play_buffer(s_click_accent);
}
