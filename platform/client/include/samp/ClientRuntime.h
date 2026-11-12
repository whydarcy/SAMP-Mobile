#pragma once
#include "GameBackend.h"
#include <memory>
namespace samp {
class ClientRuntime {
public:
    ClientRuntime(std::unique_ptr<GameBackend> backend, Emit emit);
    ~ClientRuntime();
    void receive(const std::string& utf8);
    void tick();
    void pause(bool paused);
    Json status() const;
private:
    std::unique_ptr<GameBackend> backend_;
    Emit emit_;
    bool ready_ = false, paused_ = false;
    Json state() const;
    void reply(int id, bool ok, const Json& value);
};
}
