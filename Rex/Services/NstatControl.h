#ifndef NstatControl_h
#define NstatControl_h

#include <stdint.h>

/// Opens and connects a `com.apple.network.statistics` kernel control socket.
/// Returns a connected fd on success, or -1 on failure.
int nstat_open_control_socket(void);

#endif /* NstatControl_h */
