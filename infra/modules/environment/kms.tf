# R2-3 (13 Nov 2026): satu customer managed key per tenant. Kunci dibuat di sini saat tenant diaktifkan
# (tambah id ke var.tenant_ids lalu apply), bukan oleh API. Alias mengikuti kontrak aplikasi:
# alias/<KMS_KEY_ALIAS_PREFIX>-<tenantId>.
locals {
  tenant_key_prefix = "elgos-${var.env}-tenant"
}

resource "aws_kms_key" "tenant" {
  for_each                = var.tenant_ids
  description             = "ELGOS ${var.env}: kunci data tenant ${each.key}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags = {
    "elgos:env"    = var.env
    "elgos:tenant" = each.key
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "tenant" {
  for_each      = var.tenant_ids
  name          = "alias/${local.tenant_key_prefix}-${each.key}"
  target_key_id = aws_kms_key.tenant[each.key].key_id
}
