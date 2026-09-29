export type Job = {
  id:string; title:string; company:string; company_type:string; company_type_evidence:string;
  city:string; job_type:string; graduation_year:string[]; education:string; publish_date:string|null;
  deadline:string|null; skills:string[]; description:string; source:string; source_name:string;
  source_url:string; internship_evidence:string; software_evidence:string[]; first_seen_at:string;
  last_seen_at:string; last_checked_at:string; status:string; status_reason:string; duplicate_group:string;
};
export type Change={field:string;before:unknown;after:unknown};
export type Event={id:string;job_id:string;type:string;at:string;changes:Change[]};
export type Source={id:string;name:string;url:string;status:string;error?:string;scanned:number;matched:number;scope:string;limited:boolean;checked_at:string;last_success_at:string|null};
export type Snapshot={version:number;generated_at:string|null;jobs:Job[];events:Event[];sources:Source[]};
export type Watch={companies:string;cities:string;nature:string;degree:boolean;year:string};
