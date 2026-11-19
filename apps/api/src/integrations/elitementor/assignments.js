'use strict';
// Port penugasan course ke EliteMentor (B7, K4). Kontrak FR-EM belum disepakati dengan tim EliteMentor:
// path, payload, dan dukungan Idempotency-Key di bawah ini sementara. Karena itu adapter hanya dipasang
// bila ELITEMENTOR_ASSIGNMENTS_ENABLED=true (lihat app.js).
// Data pribadi yang keluar: employeeId dan email karyawan, kode dan judul course.

function createAssignmentService({ client, timeoutMs = 10000 }) {
  return {
    /** planItemId dipakai sebagai kunci idempotensi supaya percobaan ulang tidak menggandakan penugasan. */
    async assign({ organizationId, employee, course, planItemId }) {
      const out = await client.request('POST', '/api/ewi/assignments', {
        organizationId,
        headers: { 'Idempotency-Key': planItemId },
        signal: AbortSignal.timeout(timeoutMs),
        body: { idempotencyKey: planItemId, employeeId: employee.employeeId, email: employee.email, courseRef: course.ref, courseTitle: course.title },
      });
      return { ref: out && (out.id ?? out.ref) != null ? String(out.id ?? out.ref) : null };
    },
  };
}

module.exports = { createAssignmentService };
