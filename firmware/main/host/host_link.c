#include "host_link.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static const char *TAG = "host";

static host_on_transport_fn s_on_transport;
static host_on_bpm_fn s_on_bpm;
static bool s_ready;
static char s_rx_buf[192];
static size_t s_rx_len;
static int s_stdin_flags_set;

static void host_write(const char *line)
{
    if (!s_ready || line == NULL) {
        return;
    }
    /* Console is USB-Serial/JTAG; keep frames as whole lines. */
    printf("%s\n", line);
    fflush(stdout);
}

esp_err_t host_link_init(void)
{
    /* Ensure non-blocking stdin reads for JSON commands. */
    const int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
    if (flags >= 0) {
        (void)fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);
        s_stdin_flags_set = 1;
    }

    s_ready = true;
    s_rx_len = 0;
    ESP_LOGI(TAG, "USB Serial host link ready (console USJ)");
    host_write("{\"t\":\"hello\",\"v\":1,\"name\":\"EasyInput Beatbox\"}");
    return ESP_OK;
}

bool host_link_ready(void)
{
    return s_ready;
}

void host_link_send_hello(void)
{
    host_write("{\"t\":\"hello\",\"v\":1,\"name\":\"EasyInput Beatbox\"}");
}

void host_link_send_start(void)
{
    host_write("{\"t\":\"start\"}");
}

void host_link_send_stop(void)
{
    host_write("{\"t\":\"stop\"}");
}

void host_link_send_beat(bool accent, uint8_t beat_in_bar)
{
    char line[96];
    snprintf(line, sizeof(line), "{\"t\":\"beat\",\"accent\":%d,\"beat\":%u}", accent ? 1 : 0,
             (unsigned)(beat_in_bar & 0x03));
    host_write(line);
}

void host_link_send_status(uint16_t bpm, bool running, uint8_t beat_in_bar)
{
    char line[128];
    snprintf(line, sizeof(line), "{\"t\":\"state\",\"bpm\":%u,\"run\":%d,\"beat\":%u}",
             (unsigned)bpm, running ? 1 : 0, (unsigned)(beat_in_bar & 0x03));
    host_write(line);
}

void host_link_set_handlers(host_on_transport_fn on_transport, host_on_bpm_fn on_bpm)
{
    s_on_transport = on_transport;
    s_on_bpm = on_bpm;
}

static bool extract_quoted_type(const char *line, char *out, size_t out_len)
{
    const char *t = strstr(line, "\"t\"");
    if (t == NULL) {
        return false;
    }
    const char *colon = strchr(t, ':');
    if (colon == NULL) {
        return false;
    }
    const char *q1 = strchr(colon, '"');
    if (q1 == NULL) {
        return false;
    }
    const char *q2 = strchr(q1 + 1, '"');
    if (q2 == NULL || (size_t)(q2 - (q1 + 1)) >= out_len) {
        return false;
    }
    memcpy(out, q1 + 1, (size_t)(q2 - (q1 + 1)));
    out[q2 - (q1 + 1)] = '\0';
    return true;
}

static void handle_line(const char *line)
{
    char type[24];
    if (!extract_quoted_type(line, type, sizeof(type))) {
        return;
    }

    if (strcmp(type, "start") == 0 || strcmp(type, "continue") == 0) {
        if (s_on_transport) {
            s_on_transport(true);
        }
        return;
    }
    if (strcmp(type, "stop") == 0) {
        if (s_on_transport) {
            s_on_transport(false);
        }
        return;
    }
    if (strcmp(type, "ping") == 0) {
        host_link_send_hello();
        return;
    }
    if (strcmp(type, "bpm") == 0 && s_on_bpm) {
        const char *v = strstr(line, "\"v\"");
        if (v == NULL) {
            return;
        }
        const char *vc = strchr(v, ':');
        if (vc == NULL) {
            return;
        }
        int bpm = atoi(vc + 1);
        if (bpm < 60) {
            bpm = 60;
        }
        if (bpm > 240) {
            bpm = 240;
        }
        s_on_bpm((uint16_t)bpm);
    }
}

void host_link_poll_rx(void)
{
    if (!s_ready) {
        return;
    }

    char chunk[64];
    while (true) {
        const ssize_t n = read(STDIN_FILENO, chunk, sizeof(chunk));
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;
            }
            break;
        }
        if (n == 0) {
            break;
        }

        for (ssize_t i = 0; i < n; ++i) {
            const char c = chunk[i];
            if (c == '\r') {
                continue;
            }
            if (c == '\n') {
                if (s_rx_len > 0) {
                    s_rx_buf[s_rx_len] = '\0';
                    handle_line(s_rx_buf);
                    s_rx_len = 0;
                }
                continue;
            }
            if (s_rx_len + 1 < sizeof(s_rx_buf)) {
                s_rx_buf[s_rx_len++] = c;
            } else {
                s_rx_len = 0;
            }
        }
    }

    (void)s_stdin_flags_set;
    (void)TAG;
}
