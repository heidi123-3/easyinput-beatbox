#include "audio_click.h"

#include "board_pins.h"
#include "board_power.h"
#include "driver/i2s_std.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include <math.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static const char *TAG = "audio_engine";

#define AUDIO_SAMPLE_RATE       32000
#define AUDIO_BLOCK_FRAMES      128  /* 4 ms render quantum */
#define AUDIO_STEREO_SAMPLES    (AUDIO_BLOCK_FRAMES * 2)
#define CLICK_MONO_FRAMES       288  /* 9 ms */
#define AUDIO_VOICE_COUNT       8
#define AUDIO_REQUEST_QUEUE_LEN 32
#define AUDIO_BEAT_QUEUE_LEN    16
#define AUDIO_PEAK_LIMIT        14000
#define Q32_ONE                 (1ULL << 32)

typedef enum {
    CLICK_KIND_NORMAL = 0,
    CLICK_KIND_ACCENT,
} click_kind_t;

typedef struct {
    click_kind_t kind;
} audio_request_t;

typedef struct {
    bool active;
    click_kind_t kind;
    uint16_t position;
    uint32_t age;
} audio_voice_t;

typedef struct {
    bool running;
    uint16_t bpm;
    uint32_t transport_generation;
    uint32_t flush_generation;
} audio_control_t;

static i2s_chan_handle_t s_tx;
static int16_t s_normal[CLICK_MONO_FRAMES];
static int16_t s_accent[CLICK_MONO_FRAMES];
static int16_t s_render[AUDIO_STEREO_SAMPLES];
static QueueHandle_t s_request_queue;
static QueueHandle_t s_beat_queue;
static portMUX_TYPE s_control_lock = portMUX_INITIALIZER_UNLOCKED;
static audio_control_t s_control = {
    .running = false,
    .bpm = 120,
};
static bool s_ready;

static float clampf(float value, float low, float high)
{
    if (value < low) {
        return low;
    }
    if (value > high) {
        return high;
    }
    return value;
}

static uint16_t clamp_bpm(uint16_t bpm)
{
    if (bpm < 60) {
        return 60;
    }
    if (bpm > 240) {
        return 240;
    }
    return bpm;
}

static void synthesize_clave(int16_t *destination, float fundamental_hz, float amplitude)
{
    float noise_lp = 0.0f;
    float previous_noise_lp = 0.0f;
    for (int i = 0; i < CLICK_MONO_FRAMES; ++i) {
        const float time = (float)i / (float)AUDIO_SAMPLE_RATE;
        const float body_envelope = expf(-time * 480.0f);
        const float attack_envelope = expf(-time * 2300.0f);
        const float raw_noise =
            ((float)((i * 1103515245u + 12345u) & 0xffff) / 32768.0f - 1.0f);
        noise_lp = 0.58f * noise_lp + 0.42f * raw_noise;
        const float noise_hp = noise_lp - previous_noise_lp;
        previous_noise_lp = noise_lp;

        const float body =
            (sinf(2.0f * (float)M_PI * fundamental_hz * time) +
             0.30f * sinf(2.0f * (float)M_PI * fundamental_hz * 1.52f * time)) *
            body_envelope;
        const float attack = noise_hp * 0.72f * attack_envelope;
        const float attack_ramp = i < 4 ? (float)i / 4.0f : 1.0f;
        const int tail_start = CLICK_MONO_FRAMES - 32;
        const float tail =
            i < tail_start ? 1.0f : (float)(CLICK_MONO_FRAMES - 1 - i) / 31.0f;
        const float sample =
            clampf((body + attack) * amplitude * attack_ramp * tail, -0.78f, 0.78f);
        destination[i] = (int16_t)(sample * 6200.0f);
    }
}

static uint64_t beat_interval_q32(uint16_t bpm)
{
    return (((uint64_t)AUDIO_SAMPLE_RATE * 60ULL) << 32) / clamp_bpm(bpm);
}

static audio_control_t control_snapshot(void)
{
    audio_control_t snapshot;
    portENTER_CRITICAL(&s_control_lock);
    snapshot = s_control;
    portEXIT_CRITICAL(&s_control_lock);
    return snapshot;
}

static audio_voice_t *allocate_voice(audio_voice_t voices[AUDIO_VOICE_COUNT], uint32_t age)
{
    for (int i = 0; i < AUDIO_VOICE_COUNT; ++i) {
        if (!voices[i].active) {
            voices[i].age = age;
            return &voices[i];
        }
    }

    /*
     * Eight 9ms voices cover far denser input than the metronome can create.
     * If saturated by future drum input, steal the oldest voice rather than
     * blocking the real-time renderer.
     */
    audio_voice_t *oldest = &voices[0];
    for (int i = 1; i < AUDIO_VOICE_COUNT; ++i) {
        if (voices[i].age < oldest->age) {
            oldest = &voices[i];
        }
    }
    oldest->age = age;
    return oldest;
}

static void start_voice(audio_voice_t voices[AUDIO_VOICE_COUNT], click_kind_t kind,
                        uint32_t age)
{
    audio_voice_t *voice = allocate_voice(voices, age);
    voice->active = true;
    voice->kind = kind;
    voice->position = 0;
}

static void clear_voices(audio_voice_t voices[AUDIO_VOICE_COUNT])
{
    memset(voices, 0, sizeof(audio_voice_t) * AUDIO_VOICE_COUNT);
}

static int16_t limit_sample(int32_t sample)
{
    if (sample > AUDIO_PEAK_LIMIT) {
        return AUDIO_PEAK_LIMIT;
    }
    if (sample < -AUDIO_PEAK_LIMIT) {
        return -AUDIO_PEAK_LIMIT;
    }
    return (int16_t)sample;
}

static void audio_task(void *argument)
{
    (void)argument;

    audio_voice_t voices[AUDIO_VOICE_COUNT] = {0};
    uint64_t sample_cursor = 0;
    uint64_t next_beat_q32 = 0;
    uint64_t interval_q32 = beat_interval_q32(120);
    uint32_t beat_count = 0;
    uint32_t voice_age = 0;
    uint32_t transport_generation = 0;
    uint32_t flush_generation = 0;
    uint16_t current_bpm = 120;
    bool running = false;

    while (true) {
        const audio_control_t control = control_snapshot();

        if (control.flush_generation != flush_generation) {
            flush_generation = control.flush_generation;
            clear_voices(voices);
            xQueueReset(s_request_queue);
            xQueueReset(s_beat_queue);
        }

        if (control.transport_generation != transport_generation) {
            transport_generation = control.transport_generation;
            running = control.running;
            beat_count = 0;
            if (running) {
                next_beat_q32 = sample_cursor << 32;
            }
        }

        if (control.bpm != current_bpm) {
            const uint64_t old_interval = interval_q32;
            const uint64_t new_interval = beat_interval_q32(control.bpm);
            if (running) {
                const uint64_t now_q32 = sample_cursor << 32;
                if (next_beat_q32 > now_q32) {
                    const long double phase_remaining =
                        (long double)(next_beat_q32 - now_q32) / (long double)old_interval;
                    next_beat_q32 =
                        now_q32 + (uint64_t)(phase_remaining * (long double)new_interval);
                }
            }
            current_bpm = control.bpm;
            interval_q32 = new_interval;
        }

        audio_request_t request;
        while (xQueueReceive(s_request_queue, &request, 0) == pdTRUE) {
            start_voice(voices, request.kind, voice_age++);
        }

        for (uint32_t frame = 0; frame < AUDIO_BLOCK_FRAMES; ++frame) {
            const uint64_t frame_q32 = (sample_cursor + frame) << 32;

            if (running && frame_q32 >= next_beat_q32) {
                const uint8_t beat_in_bar = (uint8_t)(beat_count & 0x03);
                const bool accent = beat_in_bar == 0;
                start_voice(voices, accent ? CLICK_KIND_ACCENT : CLICK_KIND_NORMAL,
                            voice_age++);

                const audio_beat_event_t event = {
                    .step = (uint8_t)(beat_count & 0xff),
                    .beat_in_bar = beat_in_bar,
                    .accent = accent,
                    .sample_index = sample_cursor + frame,
                };
                (void)xQueueSend(s_beat_queue, &event, 0);
                beat_count++;
                next_beat_q32 += interval_q32;
            }

            int32_t mixed = 0;
            for (int voice_index = 0; voice_index < AUDIO_VOICE_COUNT; ++voice_index) {
                audio_voice_t *voice = &voices[voice_index];
                if (!voice->active) {
                    continue;
                }

                const int16_t *source =
                    voice->kind == CLICK_KIND_ACCENT ? s_accent : s_normal;
                mixed += source[voice->position++];
                if (voice->position >= CLICK_MONO_FRAMES) {
                    voice->active = false;
                }
            }

            const int16_t output = limit_sample(mixed);
            s_render[frame * 2] = output;
            s_render[frame * 2 + 1] = output;
        }

        size_t bytes_written = 0;
        const esp_err_t error =
            i2s_channel_write(s_tx, s_render, sizeof(s_render), &bytes_written, portMAX_DELAY);
        if (error != ESP_OK || bytes_written != sizeof(s_render)) {
            ESP_LOGE(TAG, "I2S render failed: %s (%u/%u)", esp_err_to_name(error),
                     (unsigned)bytes_written, (unsigned)sizeof(s_render));
        }
        sample_cursor += AUDIO_BLOCK_FRAMES;
    }
}

esp_err_t audio_click_init(void)
{
    ESP_RETURN_ON_FALSE(board_power_peripherals_enabled(), ESP_ERR_INVALID_STATE, TAG,
                        "enable GPIO8 before speaker");

    synthesize_clave(s_normal, 1850.0f, 0.62f);
    synthesize_clave(s_accent, 2450.0f, 0.68f);

    s_request_queue = xQueueCreate(AUDIO_REQUEST_QUEUE_LEN, sizeof(audio_request_t));
    s_beat_queue = xQueueCreate(AUDIO_BEAT_QUEUE_LEN, sizeof(audio_beat_event_t));
    ESP_RETURN_ON_FALSE(s_request_queue != NULL && s_beat_queue != NULL, ESP_ERR_NO_MEM, TAG,
                        "audio queues");

    i2s_chan_config_t channel_config = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    channel_config.dma_desc_num = 4;
    channel_config.dma_frame_num = AUDIO_BLOCK_FRAMES;
    channel_config.auto_clear = true;
    ESP_RETURN_ON_ERROR(i2s_new_channel(&channel_config, &s_tx, NULL), TAG, "new I2S channel");

    const i2s_std_config_t standard_config = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(AUDIO_SAMPLE_RATE),
        .slot_cfg =
            I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
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

    ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(s_tx, &standard_config), TAG,
                        "init I2S standard mode");
    ESP_RETURN_ON_ERROR(i2s_channel_enable(s_tx), TAG, "enable I2S");

    const BaseType_t created =
        xTaskCreatePinnedToCore(audio_task, "audio_render", 4096, NULL, 8, NULL, 0);
    ESP_RETURN_ON_FALSE(created == pdPASS, ESP_ERR_NO_MEM, TAG, "audio render task");
    s_ready = true;

    ESP_LOGI(TAG, "sample-clock engine ready: %d Hz, %d-frame blocks, %d voices",
             AUDIO_SAMPLE_RATE, AUDIO_BLOCK_FRAMES, AUDIO_VOICE_COUNT);
    return ESP_OK;
}

esp_err_t audio_click_set_bpm(uint16_t bpm)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "not ready");
    portENTER_CRITICAL(&s_control_lock);
    s_control.bpm = clamp_bpm(bpm);
    portEXIT_CRITICAL(&s_control_lock);
    return ESP_OK;
}

esp_err_t audio_click_set_running(bool running)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "not ready");
    portENTER_CRITICAL(&s_control_lock);
    if (s_control.running != running) {
        s_control.running = running;
        s_control.transport_generation++;
    }
    portEXIT_CRITICAL(&s_control_lock);
    return ESP_OK;
}

bool audio_click_poll_beat(audio_beat_event_t *event)
{
    if (!s_ready || event == NULL) {
        return false;
    }
    return xQueueReceive(s_beat_queue, event, 0) == pdTRUE;
}

static esp_err_t queue_click(click_kind_t kind)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "not ready");
    const audio_request_t request = {.kind = kind};
    return xQueueSend(s_request_queue, &request, 0) == pdTRUE ? ESP_OK : ESP_ERR_NO_MEM;
}

esp_err_t audio_click_play_normal(void)
{
    return queue_click(CLICK_KIND_NORMAL);
}

esp_err_t audio_click_play_accent(void)
{
    return queue_click(CLICK_KIND_ACCENT);
}

esp_err_t audio_click_stop(void)
{
    ESP_RETURN_ON_FALSE(s_ready, ESP_ERR_INVALID_STATE, TAG, "not ready");
    portENTER_CRITICAL(&s_control_lock);
    if (s_control.running) {
        s_control.running = false;
        s_control.transport_generation++;
    }
    s_control.flush_generation++;
    portEXIT_CRITICAL(&s_control_lock);
    return ESP_OK;
}
