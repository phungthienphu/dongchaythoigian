// API suites run in separate processes; analytics has its own integration suite.
// @ts-expect-error Bun runtime API
import { mock } from 'bun:test';
import { newCommandMetrics, type CommandMetrics, type CommandRoute } from '../lib/command-metrics';
mock.module('../lib/online-commands', () => ({
  trackOnlineCommand: (_pid: string, route: CommandRoute, run: (metrics: CommandMetrics) => Promise<Response>) => run(newCommandMetrics(route)),
}));
