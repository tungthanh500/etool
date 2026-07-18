import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false, // các file test dùng chung 1 DB — chạy tuần tự tránh đè dữ liệu
    testTimeout: 20000, // có test sinh PDF thật (LEAVE) nên nới timeout
  },
});
