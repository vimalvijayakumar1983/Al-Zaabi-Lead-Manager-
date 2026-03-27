/** Datasets supported by Report Builder API + UI (keep in sync with backend report-builder routes). */
export type ReportBuilderDataset =
  | 'leads'
  | 'tasks'
  | 'call_logs'
  | 'contacts'
  | 'deals'
  | 'campaigns'
  | 'campaign_assignments'
  | 'lead_activities'
  | 'pipelines'
  | 'incentive_events'
  | 'incentive_attributions'
  | 'incentive_earnings'
  | 'incentive_adjustments'
  | 'incentive_statements'
  | 'incentive_disputes'
  | 'incentive_exceptions';
