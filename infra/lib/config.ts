// Konfigurasi per lingkungan EWI. Satu tempat untuk ukuran, retensi, dan proteksi.
// Keputusan acuan (ewi-grilling/teknis.md): T7 ECS Fargate + ALB, T8 RDS Postgres sendiri
// ap-southeast-1 Single-AZ untuk pilot, R2-9 dev + staging (permintaan user 11 Nov 2026).

export type EnvName = 'dev' | 'staging';

export interface EnvConfig {
  name: EnvName;
  /** CIDR VPC; dibedakan per lingkungan agar bisa di-peer nanti tanpa bentrok. */
  vpcCidr: string;
  api: {
    cpu: number; // unit Fargate (256 = 0,25 vCPU)
    memoryMiB: number;
    desiredCount: number;
  };
  db: {
    instanceClass: string; // mis. t4g.micro (db.* ditambahkan otomatis)
    allocatedStorageGiB: number;
    maxAllocatedStorageGiB: number;
    backupRetentionDays: number;
    deletionProtection: boolean;
    multiAz: boolean;
  };
  logRetentionDays: number;
  /** true: data dihapus saat stack dihapus (hanya dev). staging menyimpan snapshot/bucket. */
  destroyOnRemoval: boolean;
}

export const ENVIRONMENTS: Record<EnvName, EnvConfig> = {
  dev: {
    name: 'dev',
    vpcCidr: '10.40.0.0/16',
    api: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
    db: {
      instanceClass: 't4g.micro',
      allocatedStorageGiB: 20,
      maxAllocatedStorageGiB: 50,
      backupRetentionDays: 1,
      deletionProtection: false,
      multiAz: false,
    },
    logRetentionDays: 14,
    destroyOnRemoval: true,
  },
  staging: {
    name: 'staging',
    vpcCidr: '10.41.0.0/16',
    api: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
    db: {
      instanceClass: 't4g.micro',
      allocatedStorageGiB: 20,
      maxAllocatedStorageGiB: 100,
      backupRetentionDays: 7,
      deletionProtection: true,
      multiAz: false,
    },
    logRetentionDays: 30,
    destroyOnRemoval: false,
  },
};

/** Region tetap (T8): ap-southeast-1, satu region dengan EliteMentor dan layanan AI. */
export const REGION = 'ap-southeast-1';
export const GITHUB_REPO = 'andrianm28/EWI';
export const ECR_REPO_NAME = 'ewi-api';
export const DEPLOY_ROLE_NAME = 'ewi-github-deploy';
