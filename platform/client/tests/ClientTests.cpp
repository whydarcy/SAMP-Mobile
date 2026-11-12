#include "samp/ClientRuntime.h"
#include "samp/RakTransport.h"
#include "SileUiWire.h"
#include "BitStream.h"
#include <iostream>
#include <stdexcept>
using samp::Json;
static void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
class TestBackend final : public samp::GameBackend {
public:
    samp::Emit emit;
    bool available() const override { return true; }
    std::string unavailableReason() const override { return {}; }
    Json state() const override { return {{"connected",true},{"playerReady",false}}; }
    void setEventSink(samp::Emit sink) override { emit = std::move(sink); }
    Json handle(const std::string& event, const Json& args) override { return {{"handled",event}}; }
    void tick() override {}
    void setPaused(bool value) override {}
};
int main() {
    try {
        std::vector<Json> events;
        samp::ClientRuntime runtime(nullptr, [&](const Json& event) { events.push_back(event); });
        check(!runtime.status()["gameAvailable"].get<bool>(), "Missing engine must be explicit");
        runtime.receive(R"({"v":1,"id":1,"event":"Ui.Ready","args":[]})");
        check(events.size() == 3 && events[0]["ok"] == true, "Ready and initial state");
        check(events[1]["args"][0]["connected"] == false, "Never fake a joined player");
        runtime.receive(R"({"v":1,"id":2,"event":"Client.Command","args":[{"text":"/spawn"}]})");
        check(events.back()["ok"] == false, "Game commands fail without a backend");
        const auto count = events.size();
        runtime.receive(std::string(16385, 'x'));
        runtime.receive("[]"); runtime.receive("null"); runtime.receive("{");
        check(events.size() == count, "Oversized and malformed packets rejected");
        runtime.pause(true); runtime.tick();
        runtime.receive(R"({"v":1,"id":3,"event":"Ui.RequestState","args":[]})");
        check(events.size() == count, "No UI dispatch in background");
        runtime.pause(false);
        runtime.receive(R"({"v":1,"id":4,"event":"Ui.RequestState","args":[]})");
        check(events.back()["result"]["paused"] == false, "Resume state");
        std::vector<uint8_t> bytes{215, 2, 0, 4, 0, 0, 0, 1};
        SileUiWire::String32(bytes, "Authorization");
        SileUiWire::Command command;
        check(SileUiWire::Decode(bytes.data(), bytes.size(), command), "Shared Sile decoder");
        check(command.type == 4 && command.args[0] == "Authorization", "Sile command data");
        bytes.pop_back(); check(!SileUiWire::Decode(bytes.data(), bytes.size(), command), "Truncated Sile packet");
        samp::RakTransport transport;
        check(!transport.connected(), "Fresh transport disconnected");
        check(!transport.connect("bad/host", 7777), "Invalid endpoint rejected");
        check(!transport.connect("localhost", 0), "Zero port rejected");
        check(!transport.send({215, 2}), "No sends while disconnected");
        const unsigned char bits[] = {0xa5, 0x5a, 0x80, 0x01};
        RakNet::BitStream reader(const_cast<unsigned char*>(bits), sizeof(bits), false);
        for (unsigned i=0; i<32; ++i) {
            bool value = false;
            check(reader.Read(value), "Read bool at byte boundary");
            check(value == !!(bits[i/8] & (0x80 >> (i%8))), "Wire bit order must not depend on evaluation order");
        }
        bool end = false; check(!reader.Read(end), "Bool read stops at packet end");
        reader.ResetReadPointer();
        for (unsigned i=0; i<32; ++i)
            check(reader.ReadBit() == !!(bits[i/8] & (0x80 >> (i%8))), "ReadBit wire order");
        auto game = std::make_unique<TestBackend>();
        auto* testGame = game.get();
        std::vector<Json> realEvents;
        samp::ClientRuntime withBackend(std::move(game), [&](const Json& event) { realEvents.push_back(event); });
        testGame->emit({{"event","Server.Dialog"},{"args",Json::array({{{"id",10},{"title","Login"}}})}});
        check(realEvents.empty(), "Do not deliver dialogs before UI initialization");
        withBackend.receive(R"({"v":1,"id":0,"event":"Ui.Ready","args":[]})");
        check(realEvents[0]["event"] == "Server.Dialog", "Preserve server authorization arriving before UI readiness");
        withBackend.receive(R"({"v":1,"id":7,"event":"Client.Command","args":[{"text":"/spawn"}]})");
        check(realEvents.back()["result"]["handled"] == "Client.Command", "Dispatch game event through backend");
        withBackend.pause(true);
        const auto pausedCount = realEvents.size();
        testGame->emit({{"event","Server.DialogClosed"},{"args",Json::array()}});
        check(realEvents.size() == pausedCount, "Queue native events in background");
        withBackend.pause(false);
        check(realEvents.back()["event"] == "Server.DialogClosed", "Deliver buffered events on resume");
        std::cout << "Portable runtime, Sile wire, lifecycle, and transport contracts passed\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
