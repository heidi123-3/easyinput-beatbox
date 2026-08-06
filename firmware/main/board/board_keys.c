#include "board_keys.h"

#include "board_pins.h"
#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_log.h"

static const char *TAG = "board_keys";

static const int s_key_gpios[8] = {
    BOARD_GPIO_S1, BOARD_GPIO_S2, BOARD_GPIO_S3, BOARD_GPIO_S4,
    BOARD_GPIO_S5, BOARD_GPIO_S6, BOARD_GPIO_S7, BOARD_GPIO_S8,
};

static int s_last_enc_a = 1;
static int s_last_enc_b = 1;

esp_err_t board_keys_init(void)
{
    uint64_t mask = 0;
    for (int i = 0; i < 8; ++i) {
        mask |= 1ULL << s_key_gpios[i];
    }
    mask |= 1ULL << BOARD_GPIO_ENC_A;
    mask |= 1ULL << BOARD_GPIO_ENC_B;
    mask |= 1ULL << BOARD_GPIO_ENC_PRESS;

    gpio_config_t cfg = {
        .pin_bit_mask = mask,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&cfg), TAG, "gpio_config failed");

    s_last_enc_a = gpio_get_level(BOARD_GPIO_ENC_A);
    s_last_enc_b = gpio_get_level(BOARD_GPIO_ENC_B);
    ESP_LOGI(TAG, "keys + encoder ready");
    return ESP_OK;
}

esp_err_t board_keys_poll(board_input_snapshot_t *out)
{
    if (out == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    for (int i = 0; i < 8; ++i) {
        out->s[i] = gpio_get_level(s_key_gpios[i]) == 0;
    }
    out->enc_press = gpio_get_level(BOARD_GPIO_ENC_PRESS) == 0;

    const int a = gpio_get_level(BOARD_GPIO_ENC_A);
    const int b = gpio_get_level(BOARD_GPIO_ENC_B);
    out->enc_delta = 0;

    /* Minimal quadrature edge decode; refine with PCNT later. */
    if (a != s_last_enc_a) {
        out->enc_delta = (a == b) ? -1 : 1;
    }

    s_last_enc_a = a;
    s_last_enc_b = b;
    return ESP_OK;
}
