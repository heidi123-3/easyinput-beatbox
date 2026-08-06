#include "audio_click.h"
#include "board_keys.h"
#include "board_power.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "host_link.h"
#include "led_status.h"
#include "tempo.h"

static const char *TAG = "beatbox";
static bool s_audio_ready;
static uint8_t s_last_beat_in_bar;

static void apply_encoder_bpm(int8_t delta)
{
    if (delta == 0) {
        return;
    }
    const int64_t now = esp_timer_get_time();
    /* Hardware PCNT already returns exact mechanical detents: 1 detent = 1 BPM. */
    tempo_set_bpm((uint16_t)((int)tempo_get_bpm() + (int)delta));
    if (s_audio_ready) {
        (void)audio_click_set_bpm(tempo_get_bpm());
    }
    led_status_show_tempo(tempo_get_bpm(), now);
    host_link_send_status(tempo_get_bpm(), tempo_is_running(), s_last_beat_in_bar);
    ESP_LOGI(TAG, "BPM -> %u", tempo_get_bpm());
}

static void render_beat(const audio_beat_event_t *event, int64_t now_us)
{
    s_last_beat_in_bar = event->beat_in_bar;
    led_status_on_beat(event->step, event->accent, now_us);
    host_link_send_beat(event->accent, event->beat_in_bar);
}

static void transport_set(bool running, bool from_host)
{
    if (running == tempo_is_running()) {
        return;
    }

    tempo_set_running(running);
    s_last_beat_in_bar = 0;
    if (s_audio_ready) {
        if (running) {
            (void)audio_click_set_bpm(tempo_get_bpm());
            (void)audio_click_set_running(true);
        } else {
            (void)audio_click_stop();
        }
    }
    if (running) {
        ESP_LOGI(TAG, "PLAY @ %u BPM", tempo_get_bpm());
        if (!from_host) {
            host_link_send_start();
        }
        host_link_send_status(tempo_get_bpm(), true, 0);
    } else {
        ESP_LOGI(TAG, "STOP");
        if (!from_host) {
            host_link_send_stop();
        }
        host_link_send_status(tempo_get_bpm(), false, 0);
    }
}

static void on_host_transport(bool start)
{
    transport_set(start, true);
}

static void on_host_bpm(uint16_t bpm)
{
    if (bpm < 60) {
        bpm = 60;
    }
    if (bpm > 240) {
        bpm = 240;
    }
    tempo_set_bpm(bpm);
    if (s_audio_ready) {
        (void)audio_click_set_bpm(tempo_get_bpm());
    }
    host_link_send_status(tempo_get_bpm(), tempo_is_running(), s_last_beat_in_bar);
    ESP_LOGI(TAG, "BPM from host -> %u", bpm);
}

void app_main(void)
{
    ESP_ERROR_CHECK(board_keys_init());
    ESP_ERROR_CHECK(board_power_enable_peripherals());
    ESP_ERROR_CHECK(host_link_init());
    host_link_set_handlers(on_host_transport, on_host_bpm);

    ESP_ERROR_CHECK(led_status_init());
    /* Audio must not brick the product if I2S misbehaves. */
    const esp_err_t audio_err = audio_click_init();
    if (audio_err != ESP_OK) {
        ESP_LOGW(TAG, "audio init failed (%s); LEDs/keys still run", esp_err_to_name(audio_err));
    } else {
        s_audio_ready = true;
    }
    ESP_ERROR_CHECK(tempo_init(120));
    if (s_audio_ready) {
        ESP_ERROR_CHECK(audio_click_set_bpm(tempo_get_bpm()));
    }

    ESP_ERROR_CHECK(led_status_set_solid_rgb(0, 18, 0));
    vTaskDelay(pdMS_TO_TICKS(300));
    ESP_ERROR_CHECK(led_status_clear());

    host_link_send_hello();
    host_link_send_status(tempo_get_bpm(), false, 0);
    ESP_LOGI(TAG, "Ready. Twist=BPM, encoder/S8=Play-Stop, USB=Serial host link");

    int64_t last_status_us = 0;
    int64_t last_hello_us = 0;
    int64_t last_led_frame_us = 0;

    while (true) {
        board_input_snapshot_t in = {0};
        ESP_ERROR_CHECK(board_keys_poll(&in));
        apply_encoder_bpm(in.enc_delta);

        if (in.enc_press) {
            transport_set(!tempo_is_running(), false);
        }

        host_link_poll_rx();

        const int64_t now = esp_timer_get_time();

        audio_beat_event_t beat_event;
        while (audio_click_poll_beat(&beat_event)) {
            render_beat(&beat_event, now);
        }

        if (now - last_led_frame_us >= 20000) {
            last_led_frame_us = now;
            (void)led_status_update(now, tempo_get_bpm(), tempo_is_running());
        }

        if (now - last_status_us > 500000) {
            last_status_us = now;
            host_link_send_status(tempo_get_bpm(), tempo_is_running(), s_last_beat_in_bar);
        }
        if (now - last_hello_us > 5000000) {
            last_hello_us = now;
            host_link_send_hello();
        }

        /* 100 Hz FreeRTOS tick: literal one tick, never pdMS_TO_TICKS(1)==0. */
        vTaskDelay(1);
    }
}
