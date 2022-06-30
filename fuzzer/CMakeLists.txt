cmake_minimum_required(VERSION 3.10) # shipped with Ubuntu 18.04
project(fuzzy-eagle)

set(CMAKE_CXX_STANDARD 11)

# To help with development, let's write compile_commands.json unconditionally.
set(CMAKE_EXPORT_COMPILE_COMMANDS 1)

# As per the cmake-js README, we need the following to build on Windows:
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

# Enable the functionality of Node-API version 3 and disable everything added
# later, so that we don't accidentally break compatibility with older versions
# of Node (see https://nodejs.org/api/n-api.html#node-api-version-matrix).
#
# Note that prebuild recommends in its README to use ${napi_build_version} here,
# but the variable is only set when cmake-js is invoked via prebuild (in which
# case the API version is taken from "binary.napi_versions" in package.json).
# Since we want the build to work in other cases as well, let's just use a
# constant. (There is currently no point in a dynamic setting anyway since we
# specify the oldest version that we're compatible with, and Node-API's ABI
# stability guarantees that this version is available in all future Node-API
# releases.)
add_definitions(-DNAPI_VERSION=3)

include_directories(${CMAKE_JS_INC})
add_library(${PROJECT_NAME} SHARED "fuzzy-eagle.cpp" ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

# Include node-addon-api wrappers. Starting in version 7.0.0, cmake-js will be
# able to locate it and configure CMake automatically.
execute_process(COMMAND node -p "require('node-addon-api').include"
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        OUTPUT_VARIABLE NODE_ADDON_API_DIR)
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})
