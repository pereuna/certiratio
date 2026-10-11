// Valitun ICE-kandidaattiparin luokittelu (POC1-BROWSER-P2P.md §3.3, T6).
//
// Suora IPv6 päätellään vain valitun parin osoitteista, ei laitteen osoitteista.
// Chrome piilottaa host-kandidaattien IP:t mDNS-nimillä (*.local); silloin perhe
// luetaan parin toisesta päästä tai tulos on 'unknown'.

export const CLASSES = {
  'ipv6-direct': 'IPv6 direct',
  'ipv4-direct': 'IPv4 direct',
  relay: 'relay',
  unknown: 'unknown',
  failed: 'failed',
};

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Palauttaa 4, 6 tai null (mDNS-nimi, tyhjä tai tunnistamaton). */
export function ipFamily(address) {
  if (typeof address !== 'string' || address === '') return null;
  const a = address.replace(/^\[|\]$/g, '').split('%')[0];
  if (IPV4_RE.test(a)) return 4;
  const mapped = /^::ffff:(.+)$/i.exec(a);
  if (mapped && IPV4_RE.test(mapped[1])) return 4;
  if (a.includes(':') && /^[0-9a-f:.]+$/i.test(a)) return 6;
  return null;
}

/** Kandidaatin osoite: uudet selaimet käyttävät `address`, vanhat `ip`. */
export function candidateAddress(c) {
  return c?.address ?? c?.ip ?? null;
}

/**
 * Luokittelee parin. `local` ja `remote` ovat getStats()-raportin
 * local-candidate/remote-candidate-olioita, `pairState` parin tila.
 */
export function classifyPair({ local, remote, pairState } = {}) {
  if (pairState === 'failed') return 'failed';
  if (!local || !remote) return 'unknown';
  if (local.candidateType === 'relay' || remote.candidateType === 'relay') return 'relay';
  const lf = ipFamily(candidateAddress(local));
  const rf = ipFamily(candidateAddress(remote));
  if (lf && rf && lf !== rf) return 'unknown';
  const family = lf ?? rf;
  if (family === 6) return 'ipv6-direct';
  if (family === 4) return 'ipv4-direct';
  return 'unknown';
}

/** Etsii valitun parin RTCStatsReport-raportista (Chrome, Firefox, Safari). */
export function selectedPair(report) {
  const byId = new Map();
  for (const s of report.values()) byId.set(s.id, s);
  let pair = null;
  for (const s of byId.values()) {
    if (s.type === 'transport' && s.selectedCandidatePairId) {
      pair = byId.get(s.selectedCandidatePairId);
      break;
    }
  }
  if (!pair) {
    for (const s of byId.values()) {
      if (s.type === 'candidate-pair' && (s.selected || (s.nominated && s.state === 'succeeded'))) {
        pair = s;
        break;
      }
    }
  }
  if (!pair) return null;
  return {
    pair,
    local: byId.get(pair.localCandidateId) ?? null,
    remote: byId.get(pair.remoteCandidateId) ?? null,
  };
}
