#pragma once
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
namespace samp {
// Single-owner API: call all methods on one thread. RakNet owns its I/O worker.
// This is transport only; a successful handshake is NOT a SA-MP ClientJoin.
class RakTransport {
public:
    RakTransport();
    ~RakTransport();
    RakTransport(const RakTransport&) = delete;
    RakTransport& operator=(const RakTransport&) = delete;
    bool connect(const std::string& host, uint16_t port);
    void disconnect();
    bool connected() const;
    std::vector<std::vector<uint8_t>> receive();
    bool send(const std::vector<uint8_t>& packet);
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
}
