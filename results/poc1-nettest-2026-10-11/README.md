# PoC 1 -verkkotesti T5 ja T6, 2026-10-11

Kohde: `poc1/` (commit 0a4efd2). Ajettu ohjausskriptillä `poc1/tools/drive-cdp.mjs` (Chrome DevTools Protocol).

## Järjestely

- Vertaiset: puhelimen Chrome 151 (Android 16, USB-debuggaus) ja kaksi Chromium 154 -välilehteä (headless) samassa kannettavassa.
- Signaling: `poc1/signal/server.mjs --port 8080` kannettavassa. Puhelin tavoitti sen `adb reverse tcp:8080 tcp:8080` -tunnelilla, joten sivu oli `http://localhost:8080/` (suojattu konteksti).
- Verkot: puhelin 5G-mobiiliverkossa (julkinen IPv6, IPv4 operaattorin NATin takana). Kannettava puhelimen Wi-Fi-hotspotissa, joten "Wi-Fi ↔ mobiili" kulki puhelimen sisällä, ei kahden erillisen verkon välillä.
- Ei TURN-palvelinta.

## T6 — reitin luokittelu

| Ajo (tiedosto) | Puhelin ↔ kannettava | Kannettava ↔ kannettava |
|---|---|---|
| Oletus-STUN (`stun.json`) | IPv4 direct, prflx → prflx, ~8 ms | unknown, host → host (mDNS), ~2 ms |
| STUN tyhjä (`nostun.json`) | IPv4 direct, ~7 ms | unknown, ~2 ms |
| Oletus-STUN (`t5.json`, alku) | IPv6 direct (prflx → srflx) yhdellä parilla, IPv4 direct toisella | unknown |
| Vain relay, ei TURNia (`relay.json`) | yhteys jää tilaan `new` | sama |

Havainnot:

- IPv6 direct, IPv4 direct ja unknown erottuvat. Kannettavan Chrome piilottaa omat host-osoitteensa mDNS-nimillä ja vertaisen prflx-osoitteen, joten sen puolelta pari on unknown. Puhelimen Chrome näyttää osoitteet.
- Relay-luokkaa ei testattu: TURN-palvelinta ei ollut.
- **Puute:** kun kandidaatteja ei ole, yhteys jää tilaan `new` eikä siirry tilaan `failed`. Sovellus ei siis erota epäonnistunutta yhteyttä, jota T6:n hyväksyntä edellyttää. Tarvitaan aikakatkaisu, joka kirjaa `failed`.
- Puhelin ei saanut STUNilta IPv4-srflx-kandidaattia. IPv6-srflx tuli vain yhdessä neljästä ajosta.
- Kahden eri mobiiliverkon ja kahden natiivin IPv6-päätelaitteen yhdistelmiä ei testattu.

## T5 — signalingin riippumattomuus (`t5.json`)

Kolmen vertaisen kanavat auki. Kaikki painoivat **Sulje signaling**, ja palvelinprosessi pysäytettiin (portti 8080 kiinni). Sen jälkeen jokainen lähetti yksilöllisen viestin kaikille.

Tulos: jokainen vastaanotti molempien muiden viestin ja sai kaiun omastaan (6/6 suuntaa). Yhteydet pysyivät tilassa `connected`. **Hyväksytty.**

Tiedostoissa ei ole IP-osoitteita: `state` on sivun taulukko ja loki, `exported` sivun JSON-vienti.
