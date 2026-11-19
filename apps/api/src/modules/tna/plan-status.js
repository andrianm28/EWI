'use strict';
// K-3 (formulir 12 Nov, PM-8 C): satu set status untuk rencana training dan permintaan karyawan.
// Diminta (learner) -> Baru -> Berjalan -> Selesai, dan Ditolak dari status mana pun yang belum selesai.
const PLAN_STATUSES = Object.freeze(['requested', 'new', 'in_progress', 'completed', 'rejected']);

const PLAN_STATUS_LABEL = Object.freeze({
  requested: 'Diminta',
  new: 'Baru',
  in_progress: 'Berjalan',
  completed: 'Selesai',
  rejected: 'Ditolak',
});

const TRANSITIONS = Object.freeze({
  requested: ['new', 'rejected'],
  new: ['in_progress', 'rejected'],
  in_progress: ['completed', 'rejected'],
  completed: [],
  rejected: [],
});

/** Status awal: permintaan karyawan mulai "Diminta", usulan HR/AI mulai "Baru". */
function initialStatus(origin) {
  return origin === 'learner_request' ? 'requested' : 'new';
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = { PLAN_STATUSES, PLAN_STATUS_LABEL, TRANSITIONS, initialStatus, canTransition };
