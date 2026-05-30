cmake_minimum_required (VERSION 3.12)

# OpenAnsweringMachine engine — builds the single `oam_engine` target on top of BTstack's
# windows-winusb port. Dropped in over an upstream BTstack checkout by scripts/setup.ps1.

project(OpenAnsweringMachine-engine)

SET(BTSTACK_ROOT ${CMAKE_SOURCE_DIR}/../..)

if ("${CMAKE_C_COMPILER_ID}" STREQUAL "GNU" OR "${CMAKE_C_COMPILER_ID}" MATCHES ".*Clang.*")
    SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wall")
endif()

find_package(Python3 REQUIRED COMPONENTS Interpreter)
include_directories(${CMAKE_CURRENT_BINARY_DIR})
include_directories(.)
include_directories(../../3rd-party/bluedroid/decoder/include)
include_directories(../../3rd-party/bluedroid/encoder/include)
include_directories(../../3rd-party/micro-ecc)
include_directories(../../3rd-party/lc3-google/include)
include_directories(../../3rd-party/md5)
include_directories(../../3rd-party/hxcmod-player)
include_directories(../../3rd-party/hxcmod-player/mod)
include_directories(../../3rd-party/rijndael)
include_directories(../../3rd-party/yxml)
include_directories(../../src)
include_directories(../../chipset/zephyr)
include_directories(../../chipset/realtek)
include_directories(../../platform/embedded)
include_directories(../../platform/posix)
include_directories(../../platform/windows)

file(GLOB SOURCES_SRC       "../../src/*.c" "../../example/sco_demo_util.c" "../../platform/posix/wav_util.c")
file(GLOB SOURCES_BLUEDROID "../../3rd-party/bluedroid/encoder/srce/*.c" "../../3rd-party/bluedroid/decoder/srce/*.c")
file(GLOB SOURCES_CLASSIC   "../../src/classic/*.c")
file(GLOB SOURCES_BLE       "../../src/ble/*.c")
file(GLOB SOURCES_GATT      "../../src/ble/gatt-service/*.c")
file(GLOB SOURCES_UECC      "../../3rd-party/micro-ecc/uECC.c")
file(GLOB SOURCES_HXCMOD    "../../3rd-party/hxcmod-player/*.c"  "../../3rd-party/hxcmod-player/mods/*.c")
file(GLOB SOURCES_MD5       "../../3rd-party/md5/md5.c")
file(GLOB SOURCES_RIJNDAEL  "../../3rd-party/rijndael/rijndael.c")
file(GLOB SOURCES_WINDOWS   "../../platform/windows/*.c")
file(GLOB SOURCES_ZEPHYR    "../../chipset/zephyr/*.c")
file(GLOB SOURCES_REALTEK   "../../chipset/realtek/btstack_chipset_realtek.c")
file(GLOB SOURCES_LC3_GOOGLE "../../3rd-party/lc3-google/src/*.c")
file(GLOB SOURCES_PORT      "main.c" "../../platform/posix/btstack_audio_portaudio.c")
file(GLOB SOURCES_YXML      "../../3rd-party/yxml/yxml.c")

file(GLOB SOURCES_BLE_OFF "../../src/ble/le_device_db_memory.c")
list(REMOVE_ITEM SOURCES_BLE ${SOURCES_BLE_OFF})

set(SOURCES
 ${SOURCES_BLE} ${SOURCES_BLUEDROID} ${SOURCES_CLASSIC} ${SOURCES_GATT}
 ${SOURCES_HXCMOD} ${SOURCES_MD5} ${SOURCES_PORT} ${SOURCES_RIJNDAEL}
 ${SOURCES_SRC} ${SOURCES_UECC} ${SOURCES_WINDOWS} ${SOURCES_YXML}
 ${SOURCES_ZEPHYR} ${SOURCES_REALTEK}
)
list(SORT SOURCES)

add_library(btstack STATIC ${SOURCES})

find_package(PkgConfig QUIET)
if (PkgConfig_FOUND)
    pkg_check_modules(PORTAUDIO portaudio-2.0)
    if(PORTAUDIO_FOUND)
        message("HAVE_PORTAUDIO")
        target_include_directories(btstack PUBLIC ${PORTAUDIO_INCLUDE_DIRS})
        target_link_directories(btstack PUBLIC ${PORTAUDIO_LIBRARY_DIRS})
        target_link_libraries(btstack ${PORTAUDIO_LIBRARIES})
        add_compile_definitions(HAVE_PORTAUDIO)
    endif()
endif()

# the single engine binary
add_executable(oam_engine ${BTSTACK_ROOT}/example/oam_engine.c)
target_link_libraries(oam_engine btstack setupapi winusb)
