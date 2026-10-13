// Kahdenkeskiset viestit (direct.html). Viesti kulkee vain lähettäjän ja
// vastaanottajan välisellä todennetulla suoralla DataChannelilla: sitä ei
// välitetä muille jäsenille eikä rengaspalvelimen kautta. Jos suoraa yhteyttä
// ei ole, viesti jää lähtevään ja lähtee, kun suora yhteys syntyy. Vastaanottaja
// kuittaa viestin (dm-ack); kuittaamaton lähetetään uudelleen seuraavalla
// yhteydellä, ja vastaanottaja tunnistaa kaksoiskappaleen tunnisteesta.

export const MAX_DM = 2000; // merkkiä
export const DM_ID = /^[0-9a-f]{16}$/;

/** Lähetettävä teksti: rivinvaihdot säilyvät, reunojen tyhjä pois. Kelvoton → null. */
export function cleanDm(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  return t && t.length <= MAX_DM ? t : null;
}

/**
 * Saapunut dm kelpaa vain, kun se on osoitettu minulle ja lähettäjä on sama
 * kuin todennettu suora vertainen (`peer`), joka on renkaan jäsen.
 */
export function acceptDm(msg, { me, peer, member }) {
  return msg?.type === 'dm' && msg.to === me && msg.from === peer && member === true && DM_ID.test(msg.id ?? '') &&
    cleanDm(msg.text) === msg.text;
}

/** Tallennettu keskustelu (IndexedDB): vain kelvolliset viestit, enintään `max`. */
export function restoreDms(list, max = 500) {
  if (!Array.isArray(list)) return [];
  return list.filter((m) => m && typeof m === 'object' && DM_ID.test(m.id ?? '') && cleanDm(m.text) === m.text &&
    Number.isFinite(m.at) && (m.out === true ? ['pending', 'sent', 'delivered'].includes(m.state) : m.out === false))
    .slice(-max)
    .map((m) => ({ id: m.id, out: m.out, text: m.text, at: m.at, seen: m.out || m.seen === true,
      ...(m.out ? { state: m.state === 'sent' ? 'pending' : m.state } : {}) })); // kuittaamaton lähtee uudelleen
}
