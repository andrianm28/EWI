import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { ECR_REPO_NAME, EnvConfig } from './config';

export interface EnvStackProps extends StackProps {
  config: EnvConfig;
  /** Tag image API di ECR (commit SHA). Diisi workflow deploy lewat `-c imageTag=<sha>`. */
  imageTag: string;
  elitementorApiUrl?: string;
  elitementorTokenUrl?: string;
}

const API_PORT = 4100;

/**
 * Satu lingkungan EWI lengkap:
 *
 *   Browser ──HTTPS──> CloudFront ──┬── /*      ──> S3 (web Vue, OAC)
 *                                   └── /api/*  ──> ALB ──> ECS Fargate (api) ──> RDS Postgres
 *
 * - Satu URL HTTPS (domain *.cloudfront.net) tanpa perlu domain/sertifikat dulu; web memanggil
 *   `/api` relatif sehingga tidak ada CORS lintas origin.
 * - Tanpa NAT Gateway (hemat ±US$37/bulan per lingkungan): task Fargate di subnet publik dengan
 *   IP publik, tetapi hanya menerima trafik dari ALB; ALB hanya menerima dari CloudFront.
 *   RDS di subnet terisolasi tanpa akses internet. Saat komersial, pertimbangkan subnet privat
 *   + NAT untuk prod.
 * - Migrasi DB dijalankan container saat start (RUN_MIGRATIONS=true); gagal migrasi = task
 *   tidak sehat = ECS circuit breaker rollback ke versi sebelumnya.
 */
export class EwiEnvStack extends Stack {
  // AZ ditulis eksplisit agar synth tidak butuh lookup ke akun AWS (CI tanpa kredensial).
  get availabilityZones(): string[] {
    return [`${this.region}a`, `${this.region}b`];
  }

  constructor(scope: Construct, id: string, props: EnvStackProps) {
    super(scope, id, props);
    const { config } = props;
    const env = config.name;
    const removal = config.destroyOnRemoval ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN;

    Tags.of(this).add('Project', 'EWI');
    Tags.of(this).add('Environment', env);

    // ---------- Jaringan ----------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3 });

    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: `EWI ${env} ALB: hanya dari CloudFront`,
      allowAllOutbound: true,
    });
    // Prefix list AWS-managed untuk origin-facing CloudFront, dicari saat deploy (tanpa lookup saat synth).
    const cfPrefixList = new cr.AwsCustomResource(this, 'CloudFrontPrefixList', {
      onUpdate: {
        service: 'EC2',
        action: 'describeManagedPrefixLists',
        parameters: {
          Filters: [{ Name: 'prefix-list-name', Values: ['com.amazonaws.global.cloudfront.origin-facing'] }],
        },
        physicalResourceId: cr.PhysicalResourceId.of('cloudfront-origin-facing'),
        outputPaths: ['PrefixLists.0.PrefixListId'],
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE }),
      installLatestAwsSdk: false,
    });
    albSg.addIngressRule(
      ec2.Peer.prefixList(cfPrefixList.getResponseField('PrefixLists.0.PrefixListId')),
      ec2.Port.tcp(80),
      'CloudFront origin-facing',
    );

    const apiSg = new ec2.SecurityGroup(this, 'ApiSg', {
      vpc,
      description: `EWI ${env} API task: hanya dari ALB`,
      allowAllOutbound: true, // EliteMentor API, SES, Bedrock, ECR, Secrets Manager
    });
    apiSg.addIngressRule(albSg, ec2.Port.tcp(API_PORT), 'ALB ke API');

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: `EWI ${env} RDS: hanya dari API`,
      allowAllOutbound: false,
    });
    dbSg.addIngressRule(apiSg, ec2.Port.tcp(5432), 'API ke Postgres');

    // ---------- Database (T8) ----------
    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: new ec2.InstanceType(config.db.instanceClass),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      databaseName: 'ewi',
      credentials: rds.Credentials.fromGeneratedSecret('ewi_admin', {
        secretName: `ewi/${env}/db`,
      }),
      multiAz: config.db.multiAz,
      allocatedStorage: config.db.allocatedStorageGiB,
      maxAllocatedStorage: config.db.maxAllocatedStorageGiB,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false,
      backupRetention: Duration.days(config.db.backupRetentionDays),
      deletionProtection: config.db.deletionProtection,
      removalPolicy: config.destroyOnRemoval ? RemovalPolicy.DESTROY : RemovalPolicy.SNAPSHOT,
      deleteAutomatedBackups: config.destroyOnRemoval,
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: config.logRetentionDays as logs.RetentionDays,
      autoMinorVersionUpgrade: true,
      preferredBackupWindow: '18:00-19:00', // 01:00-02:00 WIB
      preferredMaintenanceWindow: 'sat:19:00-sat:20:00', // Minggu 02:00-03:00 WIB
    });

    // ---------- Secret aplikasi ----------
    // EWI_JWT_SECRET dibangkitkan sekali oleh Secrets Manager (B22: secret sendiri, tanpa fallback).
    const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: `ewi/${env}/app`,
      description: `EWI ${env}: secret JWT`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'EWI_JWT_SECRET',
        passwordLength: 64,
        excludePunctuation: true,
      },
      removalPolicy: removal,
    });
    // Kredensial integrasi EliteMentor (T2, T6). client_id/secret diisi manual setelah EM menerbitkannya;
    // secret webhook HMAC dibangkitkan di sini lalu diberikan ke tim EM.
    const elitementorSecret = new secretsmanager.Secret(this, 'ElitementorSecret', {
      secretName: `ewi/${env}/elitementor`,
      description: `EWI ${env}: kredensial OAuth2 + secret webhook EliteMentor`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ ELITEMENTOR_CLIENT_ID: '', ELITEMENTOR_CLIENT_SECRET: '' }),
        generateStringKey: 'ELITEMENTOR_WEBHOOK_SECRET',
        passwordLength: 48,
        excludePunctuation: true,
      },
      removalPolicy: removal,
    });

    // ---------- Web statis ----------
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `ewi-web-${env}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: removal,
      autoDeleteObjects: config.destroyOnRemoval,
    });

    // ---------- API di ECS Fargate (T7) ----------
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `ewi-${env}`,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      idleTimeout: Duration.seconds(120), // ruang untuk WebSocket voice gateway nanti
      dropInvalidHeaderFields: true,
    });

    // SPA: path tanpa ekstensi diarahkan ke /index.html, tanpa menyentuh respons /api.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event){var r=event.request;if(!r.uri.includes('.')){r.uri='/index.html';}return r;}",
      ),
    });

    const distribution = new cloudfront.Distribution(this, 'Web', {
      comment: `EWI ${env}`,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            readTimeout: Duration.seconds(60),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });
    const webOrigin = `https://${distribution.distributionDomainName}`;

    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/ewi/${env}/api`,
      retention: config.logRetentionDays as logs.RetentionDays,
      removalPolicy: removal,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      family: `ewi-${env}-api`,
      cpu: config.api.cpu,
      memoryLimitMiB: config.api.memoryMiB,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    const repository = ecr.Repository.fromRepositoryName(this, 'ApiRepository', ECR_REPO_NAME);
    taskDef.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(repository, props.imageTag),
      portMappings: [{ containerPort: API_PORT }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'api' }),
      environment: {
        NODE_ENV: 'production',
        EWI_ENV: env,
        PORT: String(API_PORT),
        DB_SCHEMA: 'ewi',
        RUN_MIGRATIONS: 'true',
        EWI_JWT_AUDIENCE: 'ewi',
        EWI_JWT_ISSUER: `ewi-api-${env}`,
        EWI_JWT_TTL: '8h',
        CORS_ORIGIN: webOrigin,
        ELITEMENTOR_API_URL: props.elitementorApiUrl ?? '',
        ELITEMENTOR_TOKEN_URL: props.elitementorTokenUrl ?? '',
      },
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(db.secret!, 'host'),
        DB_PORT: ecs.Secret.fromSecretsManager(db.secret!, 'port'),
        DB_NAME: ecs.Secret.fromSecretsManager(db.secret!, 'dbname'),
        DB_USER: ecs.Secret.fromSecretsManager(db.secret!, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password'),
        EWI_JWT_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'EWI_JWT_SECRET'),
        ELITEMENTOR_CLIENT_ID: ecs.Secret.fromSecretsManager(elitementorSecret, 'ELITEMENTOR_CLIENT_ID'),
        ELITEMENTOR_CLIENT_SECRET: ecs.Secret.fromSecretsManager(elitementorSecret, 'ELITEMENTOR_CLIENT_SECRET'),
        ELITEMENTOR_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(elitementorSecret, 'ELITEMENTOR_WEBHOOK_SECRET'),
      },
      healthCheck: {
        command: ['CMD-SHELL', `wget -qO- http://127.0.0.1:${API_PORT}/api/health || exit 1`],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(90),
      },
    });

    const service = new ecs.FargateService(this, 'ApiService', {
      serviceName: 'api',
      cluster,
      taskDefinition: taskDef,
      desiredCount: config.api.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [apiSg],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: Duration.seconds(120),
      enableExecuteCommand: true,
    });

    const listener = alb.addListener('Http', { port: 80, open: false });
    listener.addTargets('Api', {
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: Duration.seconds(15),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // ---------- Output (dibaca workflow deploy) ----------
    new CfnOutput(this, 'WebUrl', { value: webOrigin });
    new CfnOutput(this, 'WebBucketName', { value: webBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new CfnOutput(this, 'DbEndpoint', { value: db.dbInstanceEndpointAddress });
    new CfnOutput(this, 'AppSecretArn', { value: appSecret.secretArn });
    new CfnOutput(this, 'ElitementorSecretArn', { value: elitementorSecret.secretArn });
  }
}
