# Flowflare: Workflow Tracking for Cloudflare Workers

Flowflare is a comprehensive solution for tracking, monitoring, and managing workflows in Cloudflare Workers. It leverages D1 and Durable Objects to provide a robust system for workflow state management with real-time updates.

## Purpose and Goals

The purpose of Flowflare is to solve the challenge of tracking complex workflows across Cloudflare Workers. When building multi-step processes that include retries, error handling, and state management, developers need a reliable way to:

1. Track the progress of workflow instances
2. Monitor individual steps within workflows
3. Handle retries with configurable backoff strategies
4. Connect workflows to external entities via reference IDs
5. Provide real-time updates to user interfaces
6. Query workflow history and status

Flowflare addresses these needs with a complete solution that can be easily integrated into any Cloudflare Workers project.

## Core Architecture

Flowflare's architecture consists of several key components:

### 1. Database Schema

The database schema uses Cloudflare D1 to store:
- Workflow definitions
- Workflow instances with status and reference IDs
- Individual workflow steps
- Retry information for failed steps

This provides a complete history of workflow execution that can be queried and analyzed.

### 2. Durable Object for Real-time Updates

A Durable Object (`WorkflowTracker`) handles:
- WebSocket connections for real-time updates
- State queries from the database
- Broadcasting updates to connected clients

The WebSocket Hibernation API is used to minimize compute costs during periods of inactivity.

### 3. Service Worker

The main service worker handles:
- API requests for workflow data
- Database operations for updating workflow state
- Cross-worker service endpoints
- WebSocket connection routing

### 4. Client Library

A client library provides:
- Easy integration for other workers
- Methods for starting workflows
- Methods for querying workflow status
- Reference-based workflow lookups

### 5. Workflow Integration Utilities

Utilities for workflow implementations:
- Step tracking with automatic state persistence
- Configurable retry handling
- Error tracking with detailed information
- Input/output parameter management

## How It Works

### Workflow Tracking Process

1. **Workflow Definition**: Define workflows in your Cloudflare Workers
2. **Workflow Instances**: Create instances with unique IDs and reference information
3. **Step Execution**: Track each step with `trackStep` utility
4. **State Management**: Automatically persist state between steps
5. **Error Handling**: Configure retries with exponential or linear backoff
6. **Real-time Updates**: WebSocket connections provide live updates to UIs

### Example: Processing an Order

```javascript
export class OrderWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Extract reference information
    const { ref_id, ref_type } = event.payload;
    
    // Initialize workflow tracking
    await updateWorkflowInstance({
      id: step.instanceId,
      ref_id, 
      ref_type,
      status: 'Running'
    }, this.env);
    
    try {
      // Track each step of the workflow
      await trackStep(env, step.instanceId, 'validate', 1, async () => {
        // Validation logic here
      });
      
      await trackStep(env, step.instanceId, 'process', 2, async () => {
        // Processing logic here
      });
      
      // Mark workflow as completed
      await updateWorkflowInstance({
        id: step.instanceId,
        status: 'Completed'
      }, this.env);
      
    } catch (error) {
      // Handle errors
      await updateWorkflowInstance({
        id: step.instanceId,
        status: 'Errored'
      }, this.env);
    }
  }
}
```

### Cross-Worker Integration

Other workers can start and monitor workflows:

```javascript
// Start a workflow
const result = await workflowClient.startWorkflow(
  'order_processing',
  { orderItems: ['item1', 'item2'] },
  'order-12345',  // ref_id
  'order'         // ref_type
);

// Check workflow status
const status = await workflowClient.getWorkflow(result.workflowId);

// Find workflows by reference
const orderWorkflows = await workflowClient.getWorkflowsByRef({
  ref_id: 'order-12345'
});
```

## Benefits and Use Cases

### Benefits

- **Reliability**: Automatic retry handling and state persistence
- **Observability**: Complete visibility into workflow execution
- **Scalability**: Built on Cloudflare's global infrastructure
- **Integration**: Works across multiple workers
- **Real-time**: Live updates via WebSockets
- **Low Cost**: WebSocket hibernation minimizes compute costs

### Use Cases

- **Order Processing**: Track multi-step order fulfillment
- **Content Publishing**: Manage review and publication workflows
- **Data Processing**: Track ETL and transformation jobs
- **User Onboarding**: Monitor sign-up and verification flows
- **Scheduled Tasks**: Track periodic maintenance operations
- **API Orchestration**: Manage complex sequences of API calls

## Getting Started

To get started with Flowflare:

1. Install the library: `npm install @b-i-g-g-i-d-e-a/flowflare`
2. Run the setup wizard: `npx flowflare-setup`
3. Create your workflow service worker
4. Implement your workflows
5. Deploy with Wrangler

For detailed instructions, see the [README.md](./README.md) file.
