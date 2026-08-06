#include "audio_click.h"
#include "board_keys.h"
#include "board_power.h"
#include "clock.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "host_link.h"
#include "led_status.h"
#include "pattern.h"
#include "tempo.h"

static const char *TAG = "beatbox";
static bool s_audio_ready;
static uint8_t s_last_beat_in_bar;
static uint8_t s_last_step;
static uint32_t s_last_bar;
static uint16_t s_last_tick;
static uint32_t s_quarter_count;
static bool s_prev_keys[8];
static bool s_fill_held;
/* Power-on product mode is the standalone P1 metronome. */
static bool s_drum_mode;

static void send_status(void)
{
    const uint8_t volume = s_audio_ready ? audio_click_get_volume() : 100;
    host_link_send_status(tempo_get_bpm(), tempo_is_running(), s_last_beat_in_bar, s_last_step,
                          s_last_bar, s_last_tick, s_drum_mode, volume);
}

static void apply_encoder_bpm(int8_t delta)
{
    if (delta == 0) {
        return;
    }
    const int64_t now = esp_timer_get_time();
    tempo_set_bpm((uint16_t)((int)tempo_get_bpm() + (int)delta));
    if (s_audio_ready) {
        (void)audio_click_set_bpm(tempo_get_bpm());
    }
    led_status_show_tempo(tempo_get_bpm(), now);
    send_status();
    ESP_LOGI(TAG, "BPM -> %u", tempo_get_bpm());
}

static void render_event(const audio_beat_event_t *event, int64_t now_us)
{
    s_last_beat_in_bar = event->beat_in_bar;
    s_last_step = event->step;
    s_last_bar = event->bar;
    s_last_tick = event->tick;

    if (event->is_quarter) {
        led_status_on_beat((uint8_t)(s_quarter_count & 0xff), event->accent, now_us);
        host_link_send_beat(event->accent, event->beat_in_bar, event->step);
        s_quarter_count++;
    }
    if (event->is_step) {
        host_link_send_position(event->bar, event->step, event->beat_in_bar, event->tick,
                                event->accent);
    }
}

static void transport_set(bool running, bool restart, bool from_host)
{
    if (running) {
        if (tempo_is_running() && !restart) {
            return;
        }
        tempo_set_running(true);
        if (restart) {
            s_last_beat_in_bar = 0;
            s_last_step = 0;
            s_last_bar = 0;
            s_last_tick = 0;
            s_quarter_count = 0;
        }
        if (s_audio_ready) {
            (void)audio_click_set_bpm(tempo_get_bpm());
            (void)audio_click_set_running(true, restart);
        }
        ESP_LOGI(TAG, "%s @ %u BPM", restart ? "PLAY" : "CONTINUE", tempo_get_bpm());
        if (!from_host) {
            if (restart) {
                host_link_send_start();
            } else {
                host_link_send_continue();
            }
        }
        send_status();
        return;
    }

    if (!tempo_is_running()) {
        return;
    }
    tempo_set_running(false);
    if (s_audio_ready) {
        (void)audio_click_stop();
    }
    if (s_audio_ready) {
        audio_click_get_position(&s_last_bar, &s_last_step, &s_last_beat_in_bar, &s_last_tick);
    }
    ESP_LOGI(TAG, "STOP");
    if (!from_host) {
        host_link_send_stop();
    }
    send_status();
}

static void on_host_transport(bool start, bool restart)
{
    transport_set(start, restart, true);
}

static void on_host_bpm(uint16_t bpm)
{
    tempo_set_bpm(beatbox_clamp_bpm(bpm));
    if (s_audio_ready) {
        (void)audio_click_set_bpm(tempo_get_bpm());
    }
    send_status();
    ESP_LOGI(TAG, "BPM from host -> %u", tempo_get_bpm());
}

static void on_host_swing(uint8_t swing)
{
    pattern_set_swing(swing);
    send_status();
}

static void on_host_variation(uint8_t var)
{
    pattern_request_variation(var);
    send_status();
}

static void on_host_fill(bool held)
{
    s_fill_held = held;
    pattern_set_fill(held);
    send_status();
}

static void on_host_note(uint8_t note, uint8_t velocity)
{
    if (s_audio_ready) {
        (void)audio_click_play_note(note, velocity ? velocity : 127);
    }
    host_link_send_note(note, velocity ? velocity : 127);
}

static void on_host_click(bool enabled)
{
    pattern_set_click(enabled);
    if (s_audio_ready) {
        (void)audio_click_set_metronome(enabled);
    }
    send_status();
}

static void on_host_mode(bool drum_mode)
{
    s_drum_mode = drum_mode;
    if (!drum_mode) {
        /* Metronome-only always sounds; overlay mute only applies in drum mode. */
        pattern_set_click(true);
        if (s_audio_ready) {
            (void)audio_click_set_metronome(true);
        }
    }
    if (s_audio_ready) {
        (void)audio_click_set_mode(drum_mode ? AUDIO_MODE_DRUM : AUDIO_MODE_METRONOME);
    }
    send_status();
}

static void on_host_volume(uint8_t volume)
{
    if (s_audio_ready) {
        (void)audio_click_set_volume(volume);
    }
    send_status();
}

static void on_host_pattern_set(uint8_t bank, uint32_t rev, const uint8_t *bytes)
{
    const esp_err_t err = pattern_set_bank(bank, rev, bytes);
    if (err == ESP_OK) {
        host_link_send_ack("pattern_set", true, pattern_revision());
        send_status();
    } else {
        host_link_send_error("pattern_set", "bad_bank");
        host_link_send_ack("pattern_set", false, pattern_revision());
    }
}

static void on_host_save(void)
{
    /* MVP: acknowledge save; NVS persistence is a follow-up. */
    host_link_send_ack("save", true, pattern_revision());
}

static void on_host_ping(void)
{
    host_link_send_pattern_dump();
    send_status();
}

static void handle_pads(const board_input_snapshot_t *in)
{
    static const uint8_t pad_notes[5] = {
        BEATBOX_NOTE_KICK, BEATBOX_NOTE_SNARE, BEATBOX_NOTE_CHH, BEATBOX_NOTE_OHH,
        BEATBOX_NOTE_CLAP,
    };

    for (int i = 0; i < 5; ++i) {
        if (in->s[i] && !s_prev_keys[i]) {
            if (!s_drum_mode) {
                on_host_mode(true);
            }
            on_host_note(pad_notes[i], 127);
        }
    }

    /* S6 Fill hold */
    if (in->s[5] != s_fill_held) {
        on_host_fill(in->s[5]);
    }

    /* S7 Variation toggle */
    if (in->s[6] && !s_prev_keys[6]) {
        pattern_request_variation(pattern_variation() ? 0 : 1);
        send_status();
    }

    for (int i = 0; i < 8; ++i) {
        s_prev_keys[i] = in->s[i];
    }
}

void app_main(void)
{
    ESP_ERROR_CHECK(board_keys_init());
    ESP_ERROR_CHECK(board_power_enable_peripherals());
    ESP_ERROR_CHECK(pattern_init());
    ESP_ERROR_CHECK(host_link_init());

    const host_link_handlers_t handlers = {
        .on_transport = on_host_transport,
        .on_bpm = on_host_bpm,
        .on_swing = on_host_swing,
        .on_variation = on_host_variation,
        .on_fill = on_host_fill,
        .on_note = on_host_note,
        .on_click = on_host_click,
        .on_mode = on_host_mode,
        .on_volume = on_host_volume,
        .on_pattern_set = on_host_pattern_set,
        .on_save = on_host_save,
        .on_ping = on_host_ping,
    };
    host_link_set_handlers(&handlers);

    ESP_ERROR_CHECK(led_status_init());
    const esp_err_t audio_err = audio_click_init();
    if (audio_err != ESP_OK) {
        ESP_LOGW(TAG, "audio init failed (%s); LEDs/keys still run", esp_err_to_name(audio_err));
    } else {
        s_audio_ready = true;
    }
    ESP_ERROR_CHECK(tempo_init(120));
    if (s_audio_ready) {
        ESP_ERROR_CHECK(audio_click_set_bpm(tempo_get_bpm()));
        ESP_ERROR_CHECK(audio_click_set_metronome(pattern_click_enabled()));
        ESP_ERROR_CHECK(audio_click_set_mode(AUDIO_MODE_METRONOME));
    }

    ESP_ERROR_CHECK(led_status_set_solid_rgb(0, 18, 0));
    vTaskDelay(pdMS_TO_TICKS(300));
    ESP_ERROR_CHECK(led_status_clear());

    host_link_send_hello();
    host_link_send_pattern_dump();
    send_status();
    ESP_LOGI(TAG, "Ready. Pads=S1-5, Fill=S6, A/B=S7, Play=enc/S8, USB=Serial v2");

    int64_t last_status_us = 0;
    int64_t last_hello_us = 0;
    int64_t last_led_frame_us = 0;

    while (true) {
        board_input_snapshot_t in = {0};
        ESP_ERROR_CHECK(board_keys_poll(&in));
        apply_encoder_bpm(in.enc_delta);

        if (in.enc_press) {
            if (tempo_is_running()) {
                transport_set(false, false, false);
            } else {
                /* Resume from saved position; Start only when already at zero. */
                const bool at_zero =
                    s_last_bar == 0 && s_last_step == 0 && s_last_tick == 0;
                transport_set(true, at_zero, false);
            }
        }

        handle_pads(&in);
        host_link_poll_rx();

        const int64_t now = esp_timer_get_time();

        audio_beat_event_t beat_event;
        while (s_audio_ready && audio_click_poll_beat(&beat_event)) {
            render_event(&beat_event, now);
        }

        if (now - last_led_frame_us >= 20000) {
            last_led_frame_us = now;
            (void)led_status_update(now, tempo_get_bpm(), tempo_is_running());
        }

        if (now - last_status_us > 500000) {
            last_status_us = now;
            if (s_audio_ready && tempo_is_running()) {
                audio_click_get_position(&s_last_bar, &s_last_step, &s_last_beat_in_bar,
                                         &s_last_tick);
            }
            send_status();
        }
        if (now - last_hello_us > 5000000) {
            last_hello_us = now;
            host_link_send_hello();
        }

        vTaskDelay(1);
    }
}
