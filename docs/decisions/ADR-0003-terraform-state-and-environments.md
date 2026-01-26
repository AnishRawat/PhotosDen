# ADR-0003: Terraform Remote State, Locking, and Environment Strategy

## Status
Accepted

## Date
2026-01-26

---

## Context

PhotosDen is a long-lived system where infrastructure changes must be:
- reproducible
- auditable
- safe from concurrent modifications
- isolated per environment (dev/prod)

Local Terraform state and shared state across environments increase risk:
- state corruption
- race conditions (concurrent applies)
- accidental cross-environment resource changes
- non-auditable drift

---

## Decision

PhotosDen will use:

1) **Remote Terraform state in S3**, with
2) **State locking in DynamoDB**, and
3) **Folder-based environment isolation** (not Terraform workspaces)

The canonical structure is:

infra/
  environments/
    dev/
    prod/
  modules/

Each environment has its own:
- backend configuration (`backend.tf`)
- variable values (`terraform.tfvars`)
- isolated remote state key

---

## Implementation Requirements

### Remote State (S3)
- State bucket must be:
  - encrypted
  - versioned
  - protected from accidental deletion (lifecycle/guardrails)
- State key format:
  - `photosden/<environment>/terraform.tfstate`

### Locking (DynamoDB)
- A DynamoDB lock table must exist and be referenced by each environment backend config.
- Lock table must be:
  - encrypted
  - protected from accidental deletion where possible

### Environment Isolation
- `dev` and `prod` must not share:
  - state files
  - resource names
  - IAM roles/policies
- All resource names must include:
  - project name
  - environment

### Apply Discipline
- Only one apply at a time per environment (enforced by locking).
- All Terraform commands must be logged in:
  - `docs/command-ledger.md`

---

## Consequences

### Positive
- Prevents concurrent apply corruption
- Prevents cross-environment mistakes
- Enables reproducible deployments
- Creates an auditable operational trail

### Negative
- Requires one-time bootstrap of state bucket and lock table
  (acceptable and required for safety)

---

## Alternatives Considered

### Local state
Rejected due to non-reproducibility and high corruption risk.

### Terraform workspaces
Rejected due to weaker isolation and higher operator error risk compared to folder-per-env.

---

## Notes

This ADR is binding unless explicitly superseded by a newer ADR.
