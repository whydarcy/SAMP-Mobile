#include "samp/ClientRuntime.h"
#include <regex>
#include <stdexcept>
namespace samp {
ClientRuntime::ClientRuntime(std::unique_ptr<GameBackend> backend, Emit emit)
    : backend_(std::move(backend)), emit_(std::move(emit)) {
    if (backend_) backend_->setEventSink([this](const Json& event) {
        if (ready_ && !paused_) emit_(event);
    });
}
ClientRuntime::~ClientRuntime() { if (backend_) backend_->setEventSink({}); }
Json ClientRuntime::status() const {
    const bool available = backend_ && backend_->available();
    return {{"platform", "iOS"}, {"protocol", 1}, {"gameAvailable", available},
        {"reason", available ? "" : backend_ ? backend_->unavailableReason()
            : "iOS GTA backend is not linked. Game world and server join are unavailable."}};
}
Json ClientRuntime::state() const {
    Json value = backend_ && backend_->available() ? backend_->state() : Json{
        {"connected", false}, {"playerReady", false}, {"sileSession", 0}, {"voiceEnabled", false}};
    value["paused"] = paused_;
    value["platform"] = "iOS";
    return value;
}
void ClientRuntime::reply(int id, bool ok, const Json& value) {
    if (id > 0) emit_({{"replyTo", id}, {"ok", ok}, {ok ? "result" : "error", value}});
}
void ClientRuntime::receive(const std::string& text) {
    if (text.empty() || text.size() > 16384 || paused_) return;
    int id = 0;
    try {
        const auto packet = Json::parse(text);
        if (!packet.is_object()) return;
        if (packet.contains("id") && packet["id"].is_number_integer()) {
            const auto n = packet["id"].get<int64_t>();
            if (n < 0 || n > 2147483647) return;
            id = static_cast<int>(n);
        } else return;
        if (!packet.contains("v") || packet["v"] != 1 || !packet.contains("event") ||
            !packet["event"].is_string() || !packet.contains("args") || !packet["args"].is_array())
            throw std::runtime_error("Invalid UI protocol packet");
        const auto event = packet["event"].get<std::string>();
        static const std::regex eventPattern("^[A-Za-z][A-Za-z0-9_.]{0,63}$");
        if (!std::regex_match(event, eventPattern)) throw std::runtime_error("Invalid UI event");
        if (event == "Ui.Ready") {
            ready_ = true;
            reply(id, true, status());
            emit_({{"event", "State"}, {"args", Json::array({state()})}});
            emit_({{"event", "Client.Status"}, {"args", Json::array({status()})}});
        } else if (event == "Ui.RequestState") reply(id, true, state());
        else if (event == "Ui.Ping" || event == "Client.Status") reply(id, true, status());
        else {
            if (!ready_) throw std::runtime_error("UI has not initialized");
            if (!backend_ || !backend_->available()) throw std::runtime_error(status()["reason"]);
            reply(id, true, backend_->handle(event, packet["args"]));
        }
    } catch (const std::exception&) {
        // Error strings from game/server handlers can contain user input. Never log them.
        reply(id, false, backend_ && backend_->available() ? "Invalid or unsupported client event"
            : status()["reason"]);
    }
}
void ClientRuntime::tick() {
    if (paused_) return;
    if (backend_ && backend_->available()) backend_->tick();
    if (ready_) emit_({{"event", "State"}, {"args", Json::array({state()})}});
}
void ClientRuntime::pause(bool paused) {
    paused_ = paused;
    if (backend_) backend_->setPaused(paused);
}
}
