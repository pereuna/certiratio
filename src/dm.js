// Kahdenkeskiset viestit (direct.html). Viesti kulkee vain lähettäjän ja
// vastaanottajan välisellä todennetulla suoralla DataChannelilla: sitä ei
// välitetä muille jäsenille eikä rengaspalvelimen kautta. Jos suoraa yhteyttä
// ei ole, lähetys epäonnistuu. Tallennus, kuittaukset ja välitys tulevat myöhemmin.

export const MAX_DM = 2000; // merkkiä

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
  return msg?.type === 'dm' && msg.to === me && msg.from === peer && member === true && cleanDm(msg.text) === msg.text;
}
