# SOP-02-001 Document Control Procedure

Document Number: SOP-02-001
Document Type: Standard Operating Procedure
Revision: 01
Status: Draft
Effective Date: TBD
Next Review Date: TBD
Process Owner: Quality Assurance / Document Control
Author: TBD
Approver(s): TBD
Classification: Controlled Document
Primary Location: `docs/qms/`

> DRAFT: This document is under development and is not approved for operational use.

## 1. Purpose

This procedure defines how controlled quality documents are created, reviewed, approved, issued, revised, distributed, archived, and made obsolete. The goal is to ensure that only current, approved documents are available at the point of use and that document history remains traceable.

## 2. Scope

This procedure applies to controlled QMS documents, including:

- quality manuals
- policies
- standard operating procedures
- work instructions
- forms and templates
- specifications
- quality plans
- regulated reports and supporting records

This procedure applies to documents maintained in the repository under `docs/qms/` until a validated electronic document management system is implemented.

## 3. References

- ISO 13485:2016, Clause 4.2.4 Control of Documents
- ISO 13485:2016, Clause 4.2.5 Control of Records
- 21 CFR 820.40 Document Controls
- 21 CFR 820.180 General Requirements for Records
- 21 CFR Part 11 Electronic Records; Electronic Signatures

## 4. Definitions

| Term | Definition |
|---|---|
| Controlled Document | A document governed by review, approval, revision, and distribution controls |
| Document Master List | The official index of current controlled documents and their status |
| Effective Document | An approved document released for use |
| Obsolete Document | A document withdrawn from active use and retained per record retention requirements |
| Part 11 System | A validated electronic system that supports compliant electronic records and signatures |

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| Document Control | Assign document numbers, maintain the master list, issue documents, archive obsolete versions |
| Author | Draft and revise documents, address review comments, maintain technical accuracy |
| Reviewer | Assess suitability, clarity, regulatory alignment, and implementation impact |
| Approver | Authorize release for use and confirm the document is adequate and applicable |
| Process Owner | Own the procedure content, training impact, and periodic review |

## 6. Document Lifecycle

Controlled documents move through the following lifecycle states:

`Draft -> Review -> Approved -> Effective -> Superseded -> Obsolete`

| Status | Meaning | Use Condition |
|---|---|---|
| Draft | Under creation or revision | Not for operational use |
| Review | Circulated for comment | Not for operational use |
| Approved | Signatures obtained | Awaiting release actions if applicable |
| Effective | Released for use | Available at point of use |
| Superseded | Replaced by newer revision | Removed from active use |
| Obsolete | No longer applicable | Archived only |

## 7. Document Numbering

### 7.1 Numbering Format

Controlled document numbers shall use:

`PREFIX-CATEGORY-SEQUENCE`

Example:

`SOP-02-001`

Where:

- `SOP` = document type
- `02` = document control category
- `001` = sequential number

Revision shall be tracked separately in the document header and master list.

### 7.2 Approved Prefixes

| Prefix | Type |
|---|---|
| QM | Quality Manual |
| POL | Policy |
| SOP | Standard Operating Procedure |
| WI | Work Instruction |
| TF | Template or Form |
| SPEC | Specification |
| PLN | Plan |
| RPT | Report |

### 7.3 Category Codes

| Code | Area |
|---|---|
| 01 | Quality Management |
| 02 | Document Control |
| 03 | Human Resources and Training |
| 04 | Design and Development |
| 05 | Purchasing and Supplier Control |
| 06 | Production and Operations |
| 07 | Quality Control and Verification |
| 08 | CAPA |
| 09 | Risk Management |
| 10 | Regulatory Affairs |

## 8. Procedure

### 8.1 New Document Creation

1. The author requests a document number from Document Control.
2. Document Control confirms the document type and category.
3. Document Control assigns the next available sequence number.
4. The number is entered into the Document Master List.
5. The author drafts the document using the controlled format.
6. The draft document status is marked as `Draft`.

### 8.2 Review

1. The author submits the draft for review.
2. Reviewers are assigned based on document type and affected functions.
3. Reviewers provide comments and recommended changes.
4. The author documents disposition of comments as accepted, modified, rejected, or deferred.
5. The revised draft is reissued for approval when comments are resolved.

### 8.3 Approval

1. Required approvers review the final draft.
2. Approval shall include printed name, role, signature method, and date.
3. The document may move to `Approved` once all required approvals are complete.
4. The document may move to `Effective` only after release actions are complete, including training or communication when required.

### 8.4 Release and Distribution

1. Document Control updates the status, revision, and effective date in the master list.
2. The effective version is made available at the defined point of use.
3. Superseded versions are removed from active use locations.
4. Obsolete versions are retained in an archive with restricted use.

### 8.5 Change Control

1. Changes shall be initiated through a documented change request or equivalent tracked request.
2. The requested change shall include the reason, scope, and impact assessment.
3. Impact assessment shall address:
   - training impact
   - validation impact
   - regulatory impact
   - related document updates
   - affected records
4. Revision level shall be updated according to the scale of change:
   - major change: next whole revision
   - minor change: sub-revision if used by the organization
   - administrative change: administrative suffix or documented note if permitted by policy
5. Revised documents shall follow the same review and approval controls as new documents unless an approved administrative change path exists.

### 8.6 Periodic Review

1. Controlled documents shall be reviewed at planned intervals or sooner when triggered by change.
2. Typical review frequencies are:
   - policy and manuals: every 3 years
   - SOPs and work instructions: every 2 years
   - templates and forms: every 3 years
   - specifications: as needed based on product or process change
3. The next review date shall be tracked in the master list.

### 8.7 Obsolescence and Retention

1. Obsolete documents shall be clearly identified to prevent unintended use.
2. Archived versions shall remain retrievable for the required retention period.
3. Record retention periods shall be defined in the applicable records control procedure or retention schedule.

## 9. Electronic Records and Signatures

### 9.1 Current Repository Control

This repository may be used for drafting, collaboration, and version visibility. However, repository history, pull request approvals, and commit attribution shall not by themselves be claimed as 21 CFR Part 11-compliant electronic signatures unless the supporting system has been formally validated for that use.

### 9.2 Minimum Part 11 Expectations for Regulated Records

If this procedure or related records are approved electronically in a regulated workflow, the system used shall provide:

- unique user identification
- controlled access by role
- secure, computer-generated, time-stamped audit trails
- signature manifestation showing name, date/time, and meaning
- linkage of signature to the signed record
- record protection throughout the retention period
- documented validation for intended use

### 9.3 Practical Rule

Until a validated eQMS or document management system is implemented, electronically approved FDA-regulated records should be finalized in the validated system of record, while the repository remains the drafting and collaboration environment.

## 10. Records Generated

| Record | Owner | Storage Location |
|---|---|---|
| Document Master List | Document Control | `docs/qms/document-master-list.md` |
| Review Comment Log | Author / Reviewer | Controlled record location or future eQMS |
| Change Request | Process Owner | Controlled record location or future eQMS |
| Training Record | Quality / Department Manager | Training record system |

## 11. Monitoring and Metrics

The following document control metrics should be monitored:

- average cycle time from draft to effective
- overdue review rate
- number of open change requests
- audit findings related to document control
- rate of obsolete-document escapes

## 12. Change History

| Revision | Date | Description of Change | Author | Approver |
|---|---|---|---|---|
| 01 | 2026-03-20 | Initial draft created in repository and entered into master list | TBD | TBD |

## 13. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | TBD | TBD | TBD |
| Process Owner | TBD | TBD | TBD |
| QA Approver | TBD | TBD | TBD |
