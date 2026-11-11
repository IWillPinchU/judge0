# Lightweight 4-Language Configuration for Judge0
# IDs match standard Judge0 IDs for smooth drop-in compatibility:
# 50 -> C (GCC 13)
# 54 -> C++ (GCC 13 with C++20 standard)
# 62 -> Java (OpenJDK 21 LTS)
# 71 -> Python (Python 3.12)

@languages = [
  {
    id: 50,
    name: "C (GCC 12.2.0)",
    is_archived: false,
    source_file: "main.c",
    compile_cmd: "/usr/bin/gcc -O3 -Wno-error=implicit-function-declaration -Wno-error=implicit-int -Wno-error=int-conversion -Wno-error=incompatible-pointer-types %s main.c",
    run_cmd: "./a.out"
  },
  {
    id: 54,
    name: "C++ (GCC 12.2.0)",
    is_archived: false,
    source_file: "main.cpp",
    compile_cmd: "/usr/bin/g++ -O3 -std=c++20 %s main.cpp",
    run_cmd: "./a.out"
  },
  {
    id: 62,
    name: "Java (OpenJDK 21)",
    is_archived: false,
    source_file: "Main.java",
    compile_cmd: "/usr/bin/javac %s Main.java",
    run_cmd: "/usr/bin/java Main"
  },
  {
    id: 71,
    name: "Python (3.11)",
    is_archived: false,
    source_file: "script.py",
    compile_cmd: nil,
    run_cmd: "/usr/bin/python3 script.py"
  }
]

