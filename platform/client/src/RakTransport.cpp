#include "samp/RakTransport.h"
#include "RakClient.h"
#include <algorithm>
#include <cctype>
namespace samp {
struct RakTransport::Impl { RakClient client; };
RakTransport::RakTransport() : impl_(std::make_unique<Impl>()) {}
RakTransport::~RakTransport() { disconnect(); }
bool RakTransport::connect(const std::string& host, uint16_t port) {
    if (!port || host.empty() || host.size() > 253 ||
        !std::all_of(host.begin(), host.end(), [](unsigned char c) {
            return std::isalnum(c) || c == '.' || c == '-';
        })) return false;
    return impl_->client.Connect(host.c_str(), port, 0, 0, 5);
}
void RakTransport::disconnect() { impl_->client.Disconnect(0); }
bool RakTransport::connected() const { return impl_->client.IsConnected(); }
std::vector<std::vector<uint8_t>> RakTransport::receive() {
    std::vector<std::vector<uint8_t>> result;
    for (unsigned i = 0; i < 128; ++i) {
        Packet* packet = impl_->client.Receive();
        if (!packet) break;
        if (packet->data && packet->length && packet->length <= 262144)
            result.emplace_back(packet->data, packet->data + packet->length);
        impl_->client.DeallocatePacket(packet);
    }
    return result;
}
bool RakTransport::send(const std::vector<uint8_t>& bytes) {
    if (!connected() || bytes.empty() || bytes.size() > 16384) return false;
    return impl_->client.Send(reinterpret_cast<const char*>(bytes.data()),
        static_cast<int>(bytes.size()), HIGH_PRIORITY, RELIABLE_ORDERED, 0);
}
}
