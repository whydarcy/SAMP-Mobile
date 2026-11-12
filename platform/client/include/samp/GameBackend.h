#pragma once
#include <nlohmann/json.hpp>
#include <functional>
#include <string>
namespace samp {
using Json = nlohmann::json;
using Emit = std::function<void(const Json&)>;
// Implemented by the version-specific iOS GTA integration. All calls on main thread.
// Backend must provide its real renderer/view, ClientJoin/RPCs, pools and input.
class GameBackend {
public:
    virtual ~GameBackend() = default;
    virtual bool available() const = 0;
    virtual std::string unavailableReason() const = 0;
    virtual Json state() const = 0;
    virtual void setEventSink(Emit emit) = 0;
    virtual Json handle(const std::string& event, const Json& args) = 0;
    virtual void tick() = 0;
    virtual void setPaused(bool paused) = 0;
};
}
