cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
cmake_policy(SET CMP0042 NEW)

project(signal_impl)

set(CMAKE_CXX_STANDARD 17) # mostly supported since GCC 7
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(LLVM_ENABLE_LLD TRUE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Avoid warning about DOWNLOAD_EXTRACT_TIMESTAMP in CMake 3.24:
if(CMAKE_VERSION VERSION_GREATER_EQUAL "3.24.0")
  cmake_policy(SET CMP0135 NEW)
endif()

# To help with development, let's write compile_commands.json unconditionally.
set(CMAKE_EXPORT_COMPILE_COMMANDS 1)

include_directories(${CMAKE_JS_INC})

file(GLOB SOURCE_FILES "*.cpp")

add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

# Enable the functionality of Node-API version 4 and disable everything added
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
add_definitions(-DNAPI_VERSION=4)
