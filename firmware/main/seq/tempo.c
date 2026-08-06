#include "tempo.h"

#include "esp_timer.h"

#define TEMPO_BPM_MIN 60
#define TEMPO_BPM_MAX 240
#define TEMPO_BPM_DEFAULT 120

static uint16_t s_bpm = TEMPO_BPM_DEFAULT;
static bool s_running = false;
static int64_t s_next_beat_us = 0;
static uint8_t s_beat_index = 0;

static int64_t beat_period_us(uint16_t bpm)
{
    return (int64_t)(60000000.0 / (double)bpm);
}

static uint16_t clamp_bpm(uint16_t bpm)
{
    if (bpm < TEMPO_BPM_MIN) {
        return TEMPO_BPM_MIN;
    }
    if (bpm > TEMPO_BPM_MAX) {
        return TEMPO_BPM_MAX;
    }
    return bpm;
}

esp_err_t tempo_init(uint16_t bpm)
{
    s_bpm = clamp_bpm(bpm);
    s_running = false;
    s_next_beat_us = 0;
    s_beat_index = 0;
    return ESP_OK;
}

void tempo_set_bpm(uint16_t bpm)
{
    s_bpm = clamp_bpm(bpm);
}

uint16_t tempo_get_bpm(void)
{
    return s_bpm;
}

void tempo_set_running(bool running)
{
    s_running = running;
    if (running) {
        s_next_beat_us = esp_timer_get_time();
        s_beat_index = 0;
    }
}

bool tempo_is_running(void)
{
    return s_running;
}

bool tempo_poll_beat(int64_t now_us, uint8_t *beat_index_0_to_3)
{
    if (!s_running) {
        return false;
    }

    if (s_next_beat_us == 0) {
        s_next_beat_us = now_us;
    }

    if (now_us < s_next_beat_us) {
        return false;
    }

    if (beat_index_0_to_3) {
        *beat_index_0_to_3 = s_beat_index;
    }

    /* Schedule from absolute timeline to limit long-term drift accumulation. */
    s_next_beat_us += beat_period_us(s_bpm);
    if (s_next_beat_us < now_us - beat_period_us(s_bpm)) {
        s_next_beat_us = now_us + beat_period_us(s_bpm);
    }

    s_beat_index = (uint8_t)((s_beat_index + 1) % 4);
    return true;
}
