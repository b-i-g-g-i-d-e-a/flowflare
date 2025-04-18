// src/service/index.ts
import { WorkflowTracker } from "./tracker";
import type { WorkflowServiceOptions } from "./types";

/**
 * Create a workflow service with the provided options
 *
 * @param options Configuration options
 * @returns Cloudflare Worker handler
 */
export function createWorkflowService(options: WorkflowServiceOptions = {}) {
  // Default options
  const config = {
    allowedOrigins: ["*"],
    debug: false,
    ...options,
  };

  // Import the worker implementation
  const workerImpl = require("./worker").default;

  // Return the worker with config
  return {
    ...workerImpl,
    config,
  };
}

// Export the Durable Object
export { WorkflowTracker };

// Export types
export * from "./types";
