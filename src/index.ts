// src/index.ts
import { createWorkflowService } from "./service";
import { WorkflowTracker } from "./service/tracker";
import { WorkflowClient } from "./client";
import {
  trackStep,
  updateWorkflowInstance,
  recordStepRetry,
} from "./workflow/integration";

// Export all components
export {
  // Main service creator
  createWorkflowService,

  // Durable Object
  WorkflowTracker,

  // Client for other workers
  WorkflowClient,

  // Workflow utilities
  trackStep,
  updateWorkflowInstance,
  recordStepRetry,
};

// Default export for convenience
export default {
  createWorkflowService,
  WorkflowTracker,
  WorkflowClient,
};
