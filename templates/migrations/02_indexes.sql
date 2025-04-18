-- Create indexes for better query performance
-- Indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs (status);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_ref_id ON workflow_runs (ref_id);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_ref_type ON workflow_runs (ref_type);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs (workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_run_id ON workflow_steps (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps (status);

CREATE INDEX IF NOT EXISTS idx_workflow_step_retries_workflow_step_id ON workflow_step_retries (workflow_step_id);

CREATE INDEX IF NOT EXISTS idx_workflow_step_retries_retry_at ON workflow_step_retries (retry_at);
