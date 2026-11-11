import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { DEPLOY_ROLE_NAME, ECR_REPO_NAME, GITHUB_REPO } from './config';

export interface SharedStackProps extends StackProps {
  /**
   * ARN OIDC provider GitHub yang sudah ada di akun (satu akun hanya boleh punya satu
   * untuk token.actions.githubusercontent.com). Kosong = stack ini membuatnya.
   */
  githubOidcProviderArn?: string;
}

/**
 * Sumber daya bersama staging + prod: repo image API (satu image dipromosikan dari staging ke
 * prod lewat tag commit) dan role deploy GitHub Actions lewat OIDC (tanpa access key).
 */
export class EwiSharedStack extends Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: SharedStackProps = {}) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: ECR_REPO_NAME,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { description: 'Simpan 50 image terakhir', maxImageCount: 50 },
      ],
    });

    const provider = props.githubOidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubOidc', props.githubOidcProviderArn)
      : new iam.OpenIdConnectProvider(this, 'GithubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    // Hanya job GitHub Actions di repo EWI yang memakai environment staging/prod yang boleh deploy.
    // Aturan proteksi (reviewer wajib untuk prod) diatur di Settings > Environments GitHub.
    const role = new iam.Role(this, 'GithubDeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${GITHUB_REPO}:environment:staging`,
            `repo:${GITHUB_REPO}:environment:prod`,
          ],
        },
      }),
      description: 'Deploy EWI dari GitHub Actions (OIDC)',
    });

    // cdk deploy memakai role bootstrap CDK (deploy, publish aset, lookup).
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
    }));
    this.repository.grantPullPush(role);
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    // Unggah web statis + invalidasi CloudFront + baca output stack.
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [
        `arn:${this.partition}:s3:::ewi-web-*-${this.account}`,
        `arn:${this.partition}:s3:::ewi-web-*-${this.account}/*`,
      ],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: [`arn:${this.partition}:cloudfront::${this.account}:distribution/*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: [`arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/Ewi-*/*`],
    }));

    new CfnOutput(this, 'RepositoryUri', { value: this.repository.repositoryUri });
    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
