// src/client/types.ts

/**
 * Configuration options for the workflow client
 */
export interface WorkflowClientOptions {
  /**
   * The base URL of the workflow service (when using HTTP)
   */
  serviceUrl?: string;

  /**
   * API key for service authentication
   */
  apiKey: string;

  /**
   * Direct service binding (preferred if available)
   */
  serviceBinding?: any;
}

/**
 * Query options for listing workflows
 */
export interface WorkflowListOptions {
  /**
   * Filter by workflow status
   */
  status?: string;

  /**
   * Maximum number of results to return
   * Default: 20
   */
  limit?: number;

  /**
   * Offset for pagination
   * Default: 0
   */
  offset?: number;
}

/**
 * Query options for finding workflows by reference
 */
export interface WorkflowRefQueryOptions {
  /**
   * Reference ID to search for
   */
  ref_id?: string;

  /**
   * Reference type to search for
   */
  ref_type?: string;

  /**
   * Filter by workflow status
   */
  status?: string;

  /**
   * Maximum number of results to return
   * Default: 20
   */
  limit?: number;

  /**
   * Offset for pagination
   * Default: 0
   */
  offset?: number;
}
