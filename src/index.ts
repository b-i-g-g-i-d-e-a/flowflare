// src/index.ts
import { createWorkflowService } from "./service";
import { WorkflowTracker } from "./service/tracker";
import { WorkflowClient } from "./client";
import {
  trackStep,
  updateWorkflowRun,
  updateWorkflowStep,
  recordWorkflowStepRetry,
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
  updateWorkflowRun,
  updateWorkflowStep,
  recordWorkflowStepRetry,
  
  // For backward compatibility
  updateWorkflowRun as updateWorkflowInstance,
  recordWorkflowStepRetry as recordStepRetry,
};

// Default export for convenience
export default {
  createWorkflowService,
  WorkflowTracker,
  WorkflowClient,
  trackStep,
  updateWorkflowRun,
  updateWorkflowInstance: updateWorkflowRun,
  recordWorkflowStepRetry,
  recordStepRetry: recordWorkflowStepRetry,
};
