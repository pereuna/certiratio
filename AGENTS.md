# Certiratio – Codex-ohjeet

Kun tehtävä koskee taloussääntöjä, simulointia tai kirjanpitoa, lue ensin `VELKATALOUS_CONTEXT.md`. Käyttäjän viimeisin mallipäätös on ensisijainen. `docs/history/` ja `codex_handoff.zip` sisältävät historiallisen v1-mallin, eivät nykyisiä ohjeita.

Ensimmäinen tapahtumajärjestelmän toteutus on selainpohjainen. Kaikki paperiset ratkaisut ovat aluksi sekundäärinen tavoite; älä tee paperitositteiden, kuittivihkojen, paperivaltuutusten tai paperisten velkasetelien valmistumisesta selainversion edellytystä. Lue `docs/VELKASETELIT_JA_TOTEUTUSJARJESTYS.md` toteutusjärjestystä tai velkaseteleitä koskevassa työssä. Siirtokelpoinen setelimekanismi ja lopullisten nettomuutosten kirjaaminen ovat avoimia tutkimusvaihtoehtoja, eivät nykyisen välittömien kauppojen mallin toteutettuja sääntöjä.

Nykyinen kirjanpito käyttää etumerkillistä suhteellista saldoa x. Älä palauta ei-negatiivisen absoluuttisen velan vaatimusta, myyjän saldokatetta, velanluontia tai erääntyviä velansiirtolupauksia. Invariantti on elävien saldot + yhteisön selvitystili = 0; kuolemassa saldo siirtyy yhteisötilille samalla etumerkillä.

IPv6 P2P -kokeet (PoC 1 -rengas, ringserver, verkkotestit) on siirretty 2026-10-14 repoon `pereuna/ipv6-p2p`; lue sen `docs/POC1_RENGAS_ARKISTO.md` ennen P2P-työtä. Tähän repoon ei lisätä verkko- tai P2P-sovelluksia. Rengaskoe ei ole velkavaluutan perusta. Selain-P2P:n testikohde on suora IPv6 puhelinten välillä; älä ehdota IPv4-varaa tai TURN-välitystä testin osaksi.

Tapahtumaprotokollaa koskevassa työssä lue myös `docs/KANNUSTINYHTEENSOPIVUUS.md`. Ostaja hyväksyy kaupan kaupantekohetkellä, myyjä vastaa rekisteröinnistä ja laskentatoimisto valvonnasta. Älä tee myyjän normaalista saldohyvityksestä riippuvaista ostajan myöhemmästä vapaaehtoisesta ilmoituksesta tai lisävahvistuksesta. Hyvitystakuu edellyttää ostajan tapahtumaoikeuden asianmukaista tarkistusta. Määrittele myös osapuolten passiivisuus, häiriöt, kertakirjaus sekä valvonnassa hylättyjen tapahtumien selvitys. Erota nämä protokollavaatimukset simulaation jo toteuttamista saldo- ja varastotarkistuksista.

Kirjanpitokerros, agenttien päätössäännöt ja fyysinen tuotanto pidetään erillisinä. Testaa tapahtumat saldo- ja varastoinvariantteja vasten sekä hylkäysten atomisuus. Dokumentoi oletukset ja avoimet kysymykset. Negatiivisen saldon vastaanottovara on taloudellisesti merkityksellinen; älä lisää nollasaldon tai säästöjen maksimointia agenttien tavoitteeksi.
