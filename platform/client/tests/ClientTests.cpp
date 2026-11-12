#include "samp/ClientRuntime.h"
#include "samp/RakTransport.h"
#include "SileUiWire.h"
#include <iostream>
#include <stdexcept>
using samp::Json;
static void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
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
        std::cout << "Portable runtime, Sile wire, lifecycle, and transport contracts passed\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
