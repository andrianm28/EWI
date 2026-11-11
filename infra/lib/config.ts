// Konfigurasi per lingkungan EWI. Satu tempat untuk ukuran, retensi, dan proteksi.
// Keputusan acuan (ewi-grilling/teknis.md): T7 ECS Fargate + ALB, T8 RDS Postgres sendiri
// ap-southeast-1 Single-AZ untuk pilot, R2-9 staging + prod di AWS; dev di luar AWS (ralat user 11 Nov 2026 07:19 UTC).

export type EnvName = 'staging' | 'prod';

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
  /** true: data ikut terhapus saat stack dihapus (hanya untuk lingkungan sekali pakai). */
  destroyOnRemoval: boolean;
}

export const ENVIRONMENTS: Record<EnvName, EnvConfig> = {
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
  prod: {
    name: 'prod',
    vpcCidr: '10.42.0.0/16',
    // Pilot ELGOS (R2-4 rekomendasi: data nyata hanya di prod). Naikkan saat komersial.
    api: { cpu: 512, memoryMiB: 1024, desiredCount: 1 },
    db: {
      instanceClass: 't4g.small',
      allocatedStorageGiB: 20,
      maxAllocatedStorageGiB: 200,
      backupRetentionDays: 7, // PITR 7 hari (R2-10 rekomendasi)
      deletionProtection: true,
      multiAz: false, // T8: Single-AZ saat pilot, Multi-AZ sebelum komersial
    },
    logRetentionDays: 90,
    destroyOnRemoval: false,
  },
};

/** Region tetap (T8): ap-southeast-1, satu region dengan EliteMentor dan layanan AI. */
export const REGION = 'ap-southeast-1';
export const GITHUB_REPO = 'andrianm28/EWI';
export const ECR_REPO_NAME = 'ewi-api';
export const DEPLOY_ROLE_NAME = 'ewi-github-deploy';
