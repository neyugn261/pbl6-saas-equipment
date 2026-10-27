# ADR 0010 — Equipment dossier and detailed histories

Status: local implementation following the owner's 2026-10-27 approval of the
supplier/customer experience proposal. Shared schema/API changes need the normal
owner reviews before merge.

Asset owns the equipment dossier, confirmed operational condition, warranty
periods, local audit records and event-derived safe service history. Maintenance
owns Plan/Task histories and maintenance attention summaries. Source Request/WO
operations remain in their existing services; this implementation forwards the
caller's token for scoped reads, never invents a privileged token or queries a
foreign database. Existing CUSTOMER restrictions on WO and Maintenance remain.

The dossier shows identity/model/specifications, delivery/installation/commission
dates, current customer/site/contacts where authorized, warranty dates, linked
requests/jobs and maintenance. Each remote section explicitly reports AVAILABLE,
RESTRICTED, UNAVAILABLE, NOT_CONFIGURED or NOT_FOUND. An upstream failure is not
an empty list or zero. Previews are paginated and labelled with total; no claim
that the preview is the complete history. Related-resource detail is checked
against equipment/customer before loading subordinate history/comments/reports.

Warranty calendar coverage and the Request owner's frozen review decision are
separate. The dossier does not grant or deny a claim merely from coverage dates.
WO completion result and confirmed equipment condition are separate. Managers
explicitly confirm UNKNOWN/OPERATIONAL/DEGRADED/NOT_OPERATIONAL with a reason;
completion events never automatically assert that equipment is usable.

Histories are append-only API resources: a tenant/customer-scoped global feed,
equipment timeline, individual history detail, model/warranty histories, and
Plan/Task histories plus Task/WO journey. New entries record before/after,
actor user/roles or system, occurrence and recorded timestamps, creation-time
equipment context and source references. Internal reasons and customer notes
are separate; customer responses use explicit allowlists. No QR tokens, raw
event dumps or internal WO notes are stored in public history. Existing entries
without snapshots remain explicitly LEGACY_SUMMARY; no historical actor/location
is fabricated during migration.

Local mutations capture context at the write. External events currently omit
the original equipment site/model snapshot, so their context is explicitly
AT_EVENT_PROCESSING with sourceEquipmentContextAvailable=false. The API does
not claim that this proves the site at the time a technician performed the job.
The Asset global feed includes local mutations, Request status changes and WO
completions; Maintenance has its own feed. Detailed assignment/log histories are
read per WO from its owner, rather than represented as a complete cross-service
global audit stream.

Responsibility hints explain who needs to act and link to source resources.
They are not a second state machine, SLA promise or confirmed appointment.
Source allowedActions determine actionable Request/WO buttons. Times remain
scheduled estimates unless a source explicitly supports confirmation.

Within Minh's scope this adds backend APIs/contracts/tests and frontend handoff.
Web rendering, notifications, attachments and changes to Request/WO workflows
stay with their owners and agreed milestones. Replacement WO production stays
with Khương as explicitly selected by the owner in the previous M2 task.
