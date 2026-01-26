# 🧾 PhotosDen Command Ledger

This file tracks every command that initializes the project, installs dependencies, builds artifacts, or modifies infrastructure.

---

### [2026-01-26 12:40] Infrastructure Reset & Re-initialization
Command:
```bash
rm -rf infra/environments/dev infra/modules backend docs/command-ledger.md
mkdir -p infra/environments/dev infra/environments/prod infra/modules/s3 infra/modules/dynamodb infra/modules/cognito infra/modules/iam docs/architecture
```

Purpose: Re-initializing the project structure to meet production-level Terraform standards (remote state, folder-based isolation, version pinning).

### [2026-01-26 14:10] Backend Initialization
Command:
```bash
mkdir -p backend/src/...
cd backend && npm init -y
npm install -D typescript tsx @types/node @types/aws-lambda @types/crypto-js
npm install zod @aws-sdk/client-ssm @aws-sdk/client-s3 @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/util-dynamodb @aws-sdk/client-cognito-identity-provider @aws-sdk/credential-providers
```

Purpose: Initializing the Node.js TypeScript project with strict requirements and necessary AWS SDK v3 clients.
