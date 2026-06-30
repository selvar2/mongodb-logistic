// Shared types mirroring the FastAPI/agent contracts.

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Action = "AUTO_EXECUTE" | "HUMAN_REVIEW";

export interface ComplianceResult {
  supplier_id: string;
  name: string;
  passed: boolean;
  esg_status: string;
  sanctions_status: string;
  labour_status: string;
  carbon_status: string;
  esg_score: number;
  geo_region: string;
  fail_reasons: string[];
  evidence?: { source_doc: string; policy_type: string; text: string }[];
}

export interface PlanOption {
  supplier_id: string;
  name: string;
  geo_region: string;
  esg_score: number;
  lead_time_days: number;
  capacity_units_month: number;
  unit_price: number;
  cost_variance_usd: number;
  cost_variance_pct: number;
  confidence_score: number;
  certifications: string[];
}

export interface MitigationBrief {
  plan_id: string;
  affected_orders_count: number;
  required_capacity: number;
  disrupted_supplier: string;
  backup_supplier: string;
  backup_supplier_name: string;
  reroute_via: string;
  lead_time_delta_days: number;
  cost_variance_usd: number;
  cost_variance_pct: number;
  esg_status: string;
  confidence_score: number;
  recommended_action: Action;
  summary: string;
  options: PlanOption[];
  rejected: { supplier_id: string; reasons: string[] }[];
}

export interface WorkflowState {
  thread_id: string;
  alert_text: string;
  severity?: Severity;
  affected_region?: string;
  affected_supplier_id?: string;
  affected_skus?: string[];
  impacted_orders?: any[];
  required_capacity?: number;
  candidate_suppliers?: PlanOption[];
  compliance_results?: ComplianceResult[];
  vetted_suppliers?: any[];
  mitigation_brief?: MitigationBrief;
  confidence_score?: number;
  recommended_action?: Action;
  status?: string;
}

export interface AuditEntry {
  ts: string;
  thread_id: string;
  agent: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  level: string;
}

export interface StepEvent {
  agent: string;
  action: string;
  summary: string;
  level: string;
  ts: string;
}

export interface Supplier {
  _id: string;
  name: string;
  capabilities: string[];
  capacity_units_month: number;
  geo_region: string;
  lead_time_days: number;
  esg_score: number;
  certifications: string[];
  unit_price: number;
  disrupted?: boolean;
}
