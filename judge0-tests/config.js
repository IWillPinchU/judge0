// Central Configuration for Judge0 Test Suite
module.exports = {
  // Judge0 Server API endpoint (default: localhost:2358)
  JUDGE0_URL: process.env.JUDGE0_URL || "http://localhost:2358",

  // Candidate Host IPs for Webhook Callbacks from the VM
  CALLBACK_CANDIDATE_IPS: [
    "192.168.196.254", // User candidate 1 (VMnet8)
    "192.168.196.1",   // Host VMnet8 Virtual Adapter
    "192.168.11.254"   // User candidate 2 (VMnet1 - Host Only)
  ],

  // Port for local callback listener
  CALLBACK_PORT: parseInt(process.env.CALLBACK_PORT || "9876", 10),

  // 4 Supported Language IDs
  LANGUAGES: {
    C: 50,       // GCC 12.2.0
    CPP: 54,     // G++ 12.2.0 (C++20)
    JAVA: 62,    // OpenJDK 21 LTS
    PYTHON: 71   // Python 3.11 with NumPy
  },

  // Standard Judge0 Status Codes
  STATUS: {
    IN_QUEUE: 1,
    PROCESSING: 2,
    ACCEPTED: 3,
    WRONG_ANSWER: 4,
    TIME_LIMIT_EXCEEDED: 5,
    COMPILATION_ERROR: 6,
    RUNTIME_ERROR_SIGSEGV: 7,
    RUNTIME_ERROR_SIGXFSZ: 8,
    RUNTIME_ERROR_SIGFPE: 9,
    RUNTIME_ERROR_SIGABRT: 10,
    RUNTIME_ERROR_NZEC: 11,
    RUNTIME_ERROR_OTHER: 12,
    INTERNAL_ERROR: 13,
    EXEC_FORMAT_ERROR: 14
  }
};
