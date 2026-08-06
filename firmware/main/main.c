#include "audio_click.h"
#include "board_keys.h"
#include "board_power.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_status.h"
#include "tempo.h"

static const char *TAG = "beatbox";

static void apply_encoder_bpm(int8_t delta)
{
    if (delta == 0) {
        return;
    }
    const int next = (int)tempo_get_bpm() + (int)delta;
    tempo_set_bpm((uint16_t)(next < 0 ? 0 : next));
    ESP_LOGI(TAG, "BPM -> %u", tempo_get_bpm());
}

void app_main(void)
{
    ESP_ERROR_CHECK(board_keys_init());
    ESP_ERROR_CHECK(board_power_enable_peripherals());
    ESP_ERROR_CHECK(led_status_init());
    ESP_ERROR_CHECK(audio_click_init());
    ESP_ERROR_CHECK(tempo_init(120));

    /* P0 smoke: brief green flash so the board is visibly alive. */
    ESP_ERROR_CHECK(led_status_set_solid_rgb(0, 24, 0));
    vTaskDelay(pdMS_TO_TICKS(250));
    ESP_ERROR_CHECK(led_status_set_beat(0, false));

    bool prev_press = false;
    ESP_LOGI(TAG, "EasyInput Beatbox ready. Encoder=BPM, press=Play/Pause");

    while (true) {
        board_input_snapshot_t in = {0};
        ESP_ERROR_CHECK(board_keys_poll(&in));
        apply_encoder_bpm(in.enc_delta);

        if (in.enc_press && !prev_press) {
            tempo_set_running(!tempo_is_running());
            ESP_LOGI(TAG, "transport %s @ %u BPM", tempo_is_running() ? "PLAY" : "STOP", tempo_get_bpm());
            if (!tempo_is_running()) {
                ESP_ERROR_CHECK(led_status_set_beat(0, false));
            }
        }
        prev_press = in.enc_press;

        uint8_t beat = 0;
        if (tempo_poll_beat(esp_timer_get_time(), &beat)) {
            ESP_ERROR_CHECK(led_status_set_beat(beat, true));
            if (beat == 0) {
                ESP_ERROR_CHECK(audio_click_play_accent());
            } else {
                ESP_ERROR_CHECK(audio_click_play_normal());
            }
        }

        vTaskDelay(pdMS_TO_TICKS(5));
    }
}
