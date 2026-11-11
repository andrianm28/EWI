import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ENVIRONMENTS } from '../lib/config';
import { EwiEnvStack } from '../lib/env-stack';
import { EwiSharedStack } from '../lib/shared-stack';

const awsEnv = { account: '111111111111', region: 'ap-southeast-1' };

function synthEnv(name: 'staging' | 'prod') {
  const app = new App();
  const stack = new EwiEnvStack(app, `Ewi-${name}`, { env: awsEnv, config: ENVIRONMENTS[name], imageTag: 'abc123' });
  return Template.fromStack(stack);
}

test('RDS Postgres 16 terenkripsi, tidak publik, Single-AZ (T8)', () => {
  for (const name of ['staging', 'prod'] as const) {
    const t = synthEnv(name);
    t.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^16'),
      DBInstanceClass: `db.${ENVIRONMENTS[name].db.instanceClass}`,
      StorageEncrypted: true,
      PubliclyAccessible: false,
      MultiAZ: false,
      DeletionProtection: ENVIRONMENTS[name].db.deletionProtection,
    });
  }
});

test('staging dan prod menyimpan snapshot DB saat stack dihapus, dengan deletion protection', () => {
  for (const name of ['staging', 'prod'] as const) {
    synthEnv(name).hasResource('AWS::RDS::DBInstance', {
      DeletionPolicy: 'Snapshot',
      Properties: Match.objectLike({ DeletionProtection: true }),
    });
  }
});

test('tidak ada NAT Gateway (biaya)', () => {
  synthEnv('staging').resourceCountIs('AWS::EC2::NatGateway', 0);
});

test('API Fargate memakai image ECR sesuai tag dan secret tanpa nilai plaintext', () => {
  const t = synthEnv('staging');
  const td = t.findResources('AWS::ECS::TaskDefinition');
  const container = Object.values(td)[0].Properties.ContainerDefinitions[0];
  assert.match(JSON.stringify(container.Image), /ewi-api:abc123/);
  const secretNames = container.Secrets.map((s: { Name: string }) => s.Name).sort();
  assert.deepEqual(secretNames, [
    'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT', 'DB_USER',
    'ELITEMENTOR_CLIENT_ID', 'ELITEMENTOR_CLIENT_SECRET', 'ELITEMENTOR_WEBHOOK_SECRET', 'EWI_JWT_SECRET',
  ]);
  const envNames = container.Environment.map((e: { Name: string }) => e.Name);
  assert.ok(!envNames.includes('EWI_JWT_SECRET'));
  assert.ok(!envNames.includes('DATABASE_URL'));
});

test('ECS service dengan circuit breaker rollback', () => {
  synthEnv('staging').hasResourceProperties('AWS::ECS::Service', {
    DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
    }),
  });
});

test('CloudFront: /api/* ke ALB tanpa cache, sisanya ke S3', () => {
  synthEnv('staging').hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      CacheBehaviors: [Match.objectLike({ PathPattern: '/api/*', ViewerProtocolPolicy: 'https-only' })],
      DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
    }),
  });
});

test('role deploy GitHub hanya untuk repo EWI environment staging/prod', () => {
  const app = new App();
  const t = Template.fromStack(new EwiSharedStack(app, 'Ewi-shared', { env: awsEnv }));
  t.hasResourceProperties('AWS::IAM::Role', {
    RoleName: 'ewi-github-deploy',
    AssumeRolePolicyDocument: Match.objectLike({
      Statement: [Match.objectLike({
        Condition: Match.objectLike({
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              'repo:andrianm28/EWI:environment:staging',
              'repo:andrianm28/EWI:environment:prod',
            ],
          },
        }),
      })],
    }),
  });
  t.hasResourceProperties('AWS::ECR::Repository', { RepositoryName: 'ewi-api', ImageTagMutability: 'IMMUTABLE' });
});
