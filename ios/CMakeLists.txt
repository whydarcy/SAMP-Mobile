cmake_minimum_required(VERSION 3.22)
project(SampIOS LANGUAGES CXX OBJCXX)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
  message(FATAL_ERROR "Use -DCMAKE_SYSTEM_NAME=iOS with an Apple iOS SDK")
endif()
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(SAMP_BUILD_TESTS OFF CACHE BOOL "" FORCE)
add_subdirectory(../platform/client portable-client)
set(SAMP_BUNDLE_ID "games.samp.port.ios" CACHE STRING "iOS bundle identifier")
set(SAMP_IOS_ASSETS "" CACHE PATH "Optional prepared assets directory (webui + sile-cache)")
set(SAMP_IOS_BACKEND_DIR "" CACHE PATH "Version-specific GTA iOS backend CMake directory")
add_executable(SampIOS MACOSX_BUNDLE Sources/main.mm Sources/SampViewController.mm
    Sources/LocalAssets.mm)
target_include_directories(SampIOS PRIVATE Sources)
target_compile_options(SampIOS PRIVATE -fobjc-arc)
target_link_libraries(SampIOS PRIVATE samp_client_core "-framework UIKit" "-framework WebKit"
    "-framework Foundation" "-framework CoreGraphics")
set_target_properties(SampIOS PROPERTIES
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_LIST_DIR}/Info.plist.in"
    MACOSX_BUNDLE_GUI_IDENTIFIER "${SAMP_BUNDLE_ID}"
    MACOSX_BUNDLE_BUNDLE_VERSION "1"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "0.1.0"
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${SAMP_BUNDLE_ID}"
    XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1,2"
    XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC "YES"
    XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED "NO"
    XCODE_GENERATE_SCHEME TRUE)
if(SAMP_IOS_BACKEND_DIR)
  add_subdirectory("${SAMP_IOS_BACKEND_DIR}" gta-ios-backend)
  if(NOT TARGET samp_ios_game_backend)
    message(FATAL_ERROR "Backend must define samp_ios_game_backend implementing IOSGameBackend.h")
  endif()
  target_link_libraries(SampIOS PRIVATE samp_ios_game_backend)
  target_compile_definitions(SampIOS PRIVATE SAMP_HAS_IOS_GAME_BACKEND=1)
endif()
add_custom_command(TARGET SampIOS POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_CURRENT_LIST_DIR}/Resources/diagnostic"
        "$<TARGET_BUNDLE_DIR:SampIOS>/assets/diagnostic")
if(SAMP_IOS_ASSETS)
  if(NOT EXISTS "${SAMP_IOS_ASSETS}/webui/sile/index.html" OR NOT EXISTS "${SAMP_IOS_ASSETS}/sile-cache/paths.json")
    message(FATAL_ERROR "Assets must contain webui/sile/index.html and sile-cache/paths.json")
  endif()
  foreach(folder webui sile-cache)
    add_custom_command(TARGET SampIOS POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory "${SAMP_IOS_ASSETS}/${folder}"
            "$<TARGET_BUNDLE_DIR:SampIOS>/assets/${folder}")
  endforeach()
endif()
