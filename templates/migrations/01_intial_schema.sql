-- Initial schema for workflow tracking
-- Workflow table (enhanced with additional tracking fields)
CREATE TABLE IF NOT EXISTS workflow (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT, -- Status of the latest run (Running, Sleeping, Completed, Errored)
    input_params TEXT NOT NULL DEFAULT '{}', -- Original input parameters (not modified after creation)
    output_result TEXT NOT NULL DEFAULT '{}', -- Final result if workflow is completed
    metadata TEXT NOT NULL DEFAULT '{}', -- JSON string with metadata about the workflow
    last_run_id TEXT, -- ID of the most recent run
    ref_id TEXT, -- External reference ID (e.g., order ID, user ID)
    ref_type TEXT, -- Reference type (e.g., "order", "user")
    runs_count INTEGER DEFAULT 0, -- Count of total runs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(name, ref_id, ref_type)
);

-- Workflow runs table
CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY, -- Cloudflare's instance ID
    workflow_id INTEGER NOT NULL,
    status TEXT NOT NULL, -- Running, Sleeping, Completed, Errored
    ref_id TEXT, -- External reference ID (e.g., order ID, user ID)
    ref_type TEXT, -- Reference type (e.g., "order", "user")
    input_params TEXT NOT NULL DEFAULT '{}', -- JSON string of the workflow input parameters
    output_result TEXT NOT NULL DEFAULT '{}', -- Final result of the workflow as JSON string
    metadata TEXT NOT NULL DEFAULT '{}', -- JSON string containing metadata about the run (who triggered it, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    sleep_until TIMESTAMP, -- When the workflow will wake from sleep (if sleeping)
    FOREIGN KEY (workflow_id) REFERENCES workflow (id)
);

-- Workflow steps table
CREATE TABLE IF NOT EXISTS workflow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_run_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL, -- Pending, Running, Completed, Failed, Retrying
    step_index INTEGER NOT NULL, -- Order in which steps are executed
    state TEXT, -- Any state returned by the step (as JSON)
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs (id)
);

-- Workflow step retries table
CREATE TABLE IF NOT EXISTS workflow_step_retries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_step_id INTEGER NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    retry_at TIMESTAMP NOT NULL, -- When the retry will happen
    last_error TEXT, -- Error message from the previous attempt
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps (id)
);
