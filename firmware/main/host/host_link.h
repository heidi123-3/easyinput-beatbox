#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Host link over USB-Serial/JTAG (EasyInput native USB).
 *
 * Carries the same transport semantics as the MIDI map in docs/midi-protocol.md,
 * framed as newline-delimited JSON so the companion UI can auto-connect via
 * Web Serial on macOS (where TinyUSB MIDI often loses the PHY race to USJ).
 *
 * Device → host:
 *   {"t":"hello","v":1,"name":"EasyInput Beatbox"}
 *   {"t":"state","bpm":120,"run":0,"beat":0}
 *   {"t":"beat","accent":1,"beat":0}
 *   {"t":"start"} / {"t":"stop"}
 *
 * Host → device:
 *   {"t":"start"} / {"t":"stop"} / {"t":"bpm","v":128} / {"t":"ping"}
 */

esp_err_t host_link_init(void);
bool host_link_ready(void);

void host_link_send_hello(void);
void host_link_send_start(void);
void host_link_send_stop(void);
void host_link_send_beat(bool accent, uint8_t beat_in_bar);
void host_link_send_status(uint16_t bpm, bool running, uint8_t beat_in_bar);

typedef void (*host_on_transport_fn)(bool start);
typedef void (*host_on_bpm_fn)(uint16_t bpm);
void host_link_set_handlers(host_on_transport_fn on_transport, host_on_bpm_fn on_bpm);
void host_link_poll_rx(void);

#ifdef __cplusplus
}
#endif
