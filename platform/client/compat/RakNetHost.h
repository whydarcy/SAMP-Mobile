#pragma once
// The transport needs C runtime types and a logger, never JNI or GTA structures.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
void FLog(const char* format, ...);
