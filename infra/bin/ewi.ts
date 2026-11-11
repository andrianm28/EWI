#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { ENVIRONMENTS, EnvName, REGION } from '../lib/config';
import { EwiEnvStack } from '../lib/env-stack';
import { EwiSharedStack } from '../lib/shared-stack';

const app = new App();

// Akun AWS diambil dari kredensial yang aktif saat deploy (CDK_DEFAULT_ACCOUNT) atau -c account=...
const account = app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT;
const awsEnv = { account, region: REGION };

const imageTag: string = app.node.tryGetContext('imageTag') ?? 'bootstrap';

new EwiSharedStack(app, 'Ewi-shared', {
  env: awsEnv,
  githubOidcProviderArn: app.node.tryGetContext('githubOidcProviderArn'),
  description: 'EWI: ECR image API + role deploy GitHub Actions (OIDC)',
});

for (const name of Object.keys(ENVIRONMENTS) as EnvName[]) {
  new EwiEnvStack(app, `Ewi-${name}`, {
    env: awsEnv,
    config: ENVIRONMENTS[name],
    imageTag,
    elitementorApiUrl: app.node.tryGetContext(`${name}:elitementorApiUrl`),
    elitementorTokenUrl: app.node.tryGetContext(`${name}:elitementorTokenUrl`),
    description: `EWI ${name}: CloudFront + S3 (web), ALB + ECS Fargate (api), RDS Postgres`,
    terminationProtection: true,
  });
}
