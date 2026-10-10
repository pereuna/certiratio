# PoC 1 — selain-P2P-määrittelyn tarkastus

Tarkastettu 2026-10-10. Kohde on käyttäjän toimittama [PoC 1 v0.1](POC1-BROWSER-P2P.md), joka on tallennettu alkuperäisessä muodossaan dokumentin ehdottamaan polkuun `docs/POC1-BROWSER-P2P.md`. Tämä muistio täydentää määrittelyä; se ei merkitse havaittuja puutteita ratkaistuiksi eikä PoC:ta toteutetuksi.

## Arvio ja suhde nykyiseen malliin

Määrittely on käyttökelpoinen rajaus kolmen selaimen tekniseksi replikointikokeeksi. Sisältöosoitteiset tapahtumat, domain-erotellut allekirjoitukset, deterministinen konfliktin näkyminen, IndexedDB:n johdetut näkymät ja signaloinnin erottaminen tapahtumaliikenteestä muodostavat selkeän rungon. IPv6-yhteyden mittaaminen onnistumisen olettamisen sijaan ja TURN-välityksen erillinen raportointi ovat johdonmukaisia testitavoitteita.

PoC käsittelee siirtokelpoisen instrumentin haltijaketjua, ei vielä Certiration suhteellisten saldojen kirjanpitoa. `ISSUE` ei tässä tarkoita v1-mallin velanluontia eikä `SETTLE` toteuta nykyisen velkamoottorin saldosiirtoa. `OPEN` ja `SETTLED` ovat tunnetusta paikallisesta tapahtumajoukosta johdettuja tiloja, eivät todistus globaalista lopullisuudesta tai kaksoiskäytön estymisestä kaikissa verkon osissa.

Tämä selainkokeen rajaus sopii selainpohjaiseen toteutusprioriteettiin. Se ei sellaisenaan täytä [kannustinyhteensopivan tapahtumaprotokollan vaatimuksia](KANNUSTINYHTEENSOPIVUUS.md) eikä korvaa [mallikontekstin](../VELKATALOUS_CONTEXT.md) saldo- ja vastaanottorajasääntöjä. Instrumenttipohjainen PoC ja aiemmin kuvattu ensimmäinen varsinainen suoran saldosiirron selainjärjestelmä on erotettava toteutussuunnitelmassa.

Alla olevat protokollan täsmennykset on ratkaistava ennen tämän osan toteuttamista, jotta eri solmut eivät toteuta keskenään erilaisia sääntöjä.

## 1. Osittaiset allekirjoitukset ja sama event_id

**Kohdat 5.2, 5.4, 6 ja 8.** Määrittely kieltää osittain allekirjoitetun siirron lisäämisen tapahtumakirjanpitoon, mutta `PENDING`-tila sisältää myös puuttuvat allekirjoitukset. `event_id` perustuu vain `body`yn, joten osittaisella ja täysin allekirjoitetulla versiolla on sama tunniste.

Jos ensimmäinen versio tallennetaan tunnisteen alle ja myöhempi versio ohitetaan duplikaattina, täydellinen tapahtuma ei koskaan tule hyväksytyksi. Myös virheellisen allekirjoituskuoren saapuminen ensin voi muuten myrkyttää saman tunnisteen myöhemmän kelvollisen toimituksen.

**Täsmennys:** erottele allekirjoitusehdotukset, virheelliset toimitukset ja valmis tapahtumajoukko. Täysin allekirjoitettu tapahtuma saa odottaa puuttuvaa edeltäjää, mutta allekirjoittamaton ehdotus ei ole sama asia. Määrittele sallittujen allekirjoitusten yhdistäminen tai erillinen ehdotusvarasto sekä se, että aiempi virheellinen toimitus ei estä kelvollista tapahtumaa. Saman sisällön vaihtoehtoinen kelvollinen allekirjoituskuori ei saa luoda toista tapahtumaa.

**Testi:** toimita osittainen tai virheellinen kuori ennen kelvollista kuorta samalla `event_id`:llä; kelvollinen valmis tapahtuma tallentuu ja kaikki solmut päätyvät samaan tilaan.

## 2. Allekirjoitusten keräämisen verkkosanomat puuttuvat

**Kohdat 5.2, 7 ja 9.** Kahden osapuolen allekirjoitukset voidaan kerätä kahdessa viestissä, mutta sanomataulukossa ei määritellä allekirjoituspyyntöä tai -vastausta. `EVENTS` välittää kokonaisia tapahtumia, ja tuntemattomat sanomatyypit ohitetaan.

**Täsmennys:** määrittele ehdotus- ja allekirjoitusvastauksen sanomat tai muu eksplisiittinen menettely. Vastaanottaja näkee ja hyväksyy täsmälleen allekirjoitettavan sisällön. Määrittele peruutus, vanhentunut ehdotus ja yhteyskatko. Molempien allekirjoitusten jälkeen luovuttaja voi julkaista valmiin tapahtuman; julkaiseminen ei edellytä vastaanottajan uutta vapaaehtoista toimenpidettä. Protokollan `ACK` on säilytyskuittaus, ei kaupanteon hyväksyntä.

**Testi:** hyväksytty allekirjoitusvastaus saapuu, vastaanottaja sulkee selaimen ja luovuttaja julkaisee valmiin tapahtuman muiden vertaisten saataville ilman lisähyväksyntää.

## 3. HELLO-haaste on sidottava vastaanottajan tuoreeseen istuntoon

**Kohdat 7 ja 7.1.** HELLO sisältää satunnaisen haasteen ja allekirjoituksen, mutta haaste/vastausmenettelyn tarkkaa sisältöä ei määritellä. Lähettäjän oman haasteen allekirjoitus yksin voidaan toistaa toisessa istunnossa; se ei todista yksityisen avaimen hallintaa vastaanottajan tämänhetkiselle kanavalle.

**Täsmennys:** vastaanottaja antaa tuoreen haasteen, johon vertainen vastaa allekirjoittamalla domain-erotellun sisällön. Lukitse mukaan protokollaversio, molemmat osallistujat, sovitut istuntotiedot ja haasteet. Määrittele uusintojen hylkäys ja se, milloin kanavaa pidetään todennettuna. Todennus osoittaa avaimen hallinnan, ei henkilön virallista identiteettiä tai oikeutta liittyä yhteisöön.

**Testi:** aiemmasta yhteydestä talletettu HELLO/vastaus ei kelpaa uudessa yhteydessä, mutta tuore haaste/vastaus kelpaa.

## 4. ISSUE-tunnisteen törmäys tarvitsee deterministisen säännön

**Kohdat 5.1, 5.4 ja 6.** `instrument_id`:n paikallinen yksikäsitteisyystarkistus ei määrittele, mitä tehdään kahdelle muuten kelvolliselle ISSUE-tapahtumalle samalla instrumenttitunnisteella. Jos ensin saapunut juuri hyväksytään ja toinen hylätään, solmut voivat jäädä pysyvästi eri ketjuihin. Satunnaisuus pienentää vahingon mahdollisuutta, mutta ei estä tahallista saman tunnisteen käyttöä.

**Täsmennys:** määrittele instrumenttitunnisteen nimiavaruus ja kilpailevien ISSUE-juurten käsittely. Yksi mahdollinen sääntö on molempien kelvollisten juurten säilyttäminen ja kyseisen instrumentin `CONFLICT`; tätä vaihtoehtoa ei vielä valita tässä muistiossa. Eri instrumenttien `prev=null` ei saa aiheuttaa niiden välille konfliktia.

**Testi:** samat kaksi kelvollista ISSUE-juurta toimitetaan solmuille päinvastaisessa järjestyksessä, ja lopputulos on sama. Eri instrumenttitunnisteiden juuret pysyvät erillisinä.

## 5. Myöhäinen konflikti voi muuttaa aiemmin näkyneen SETTLED-tilan

**Kohdat 6, 8, T3 ja T7.** SETTLE sulkee yksikäsitteisen tunnetun ketjun, mutta myöhemmin voi tulla kelvollinen kilpaileva TRANSFER, jonka `prev` viittaa samaan aiempaan avoimeen tapahtumaan kuin SETTLE. Tämä on eri tapaus kuin TRANSFER, jonka edeltäjä on itse SETTLE.

**Täsmennys:** validoi tapahtuma oman edeltäjäketjunsa perusteella ja laske instrumentin johdettu tila uudelleen koko tunnetusta kelvollisesta graafista. Säilytä kilpailevat tapahtumat; aiemmin näytetty `SETTLED` ei saa estää myöhäisen konfliktin havaitsemista. Suoraan SETTLE-tapahtumaa jatkava TRANSFER on edelleen virheellinen. Erota pysyvä rakenne-/allekirjoitusvirhe muuttuvasta kontekstista, kuten puuttuvasta edeltäjästä tai löytyvästä haarasta.

**Testi:** kilpaileva TRANSFER toimitetaan ensin ennen SETTLEä ja toisessa ajossa sen jälkeen. Molemmissa lopputulos on `CONFLICT`; suora SETTLEn jatkaminen on `INVALID`. Konfliktin kelvollisia jälkeläisiä ei esitetä hyväksytyksi voittajahaaraksi.

## 6. INVENTORY tarvitsee eräjaon jo PoC:n 1 000 tapahtuman rajalla

**Kohdat 7 ja 7.1.** Yksi `sha256:`-tunniste sisältää 71 ASCII-merkkiä. Jo 1 000 tunnisteen tiivis JSON-lista kuorineen ylittää 64 KiB:n sanomarajan. Tarkastuksen esimerkkiviesti oli **74 113 tavua**, kun raja on **65 536 tavua**. Tässä käytettiin protokollan, tyypin ja 32-merkkisen viestitunnisteen lisäksi `event_ids`-listaa.

**Täsmennys:** määrittele myös INVENTORY- ja GET_EVENTS-listojen eräjako sekä erien loppumisen tunnistus. Pelkkä EVENTS-eräjako ei riitä. Tarkista koko UTF-8-koodatun viestin koko kuorineen, ei vain JavaScript-merkkijonon pituutta. Yhden tapahtuman enimmäiskoon on mahduttava EVENTS-kuoreen tai sille on määriteltävä erillinen paloittelu. Käytä tarvittaessa myös yhteyden neuvottelemaa pienempää SCTP-sanomarajaa.

**Testi:** 1 000 tapahtumaa synkronoidaan ilman yhtään yli 64 KiB:n viestiä. Myös GET_EVENTS ja yksittäinen suurin sallittu tapahtuma kuorineen noudattavat rajaa.

## 7. Kryptografian ja tapahtumaskeeman lukittavat yksityiskohdat

**Kohdat 3.1, 4, 5 ja 6.** Algoritmin valinta ja julkisen avaimen sarjoituksen lukitseminen ovat perustellusti määrittelyssä toteutusta edeltäviä tehtäviä. Ennen testivektoreita tarvitaan kuitenkin täsmällinen yhteentoimiva muoto.

Lukitse julkisen avaimen sarjoitus (esimerkiksi valitun algoritmin raw tai SPKI), algoritmin yhteys osallistujatunnisteeseen, allekirjoituksen tavumuoto ja base64url-säännöt. Jos valinta on WebCrypto ECDSA P-256, sen kiinteäpituista `r || s` -esitystä ei saa sekoittaa ASN.1 DER -esitykseen.

Lukitse tyyppikohtaiset pakolliset ja kielletyt kentät, toistuvat JSON-avaimet, tunnisteiden ja noncen muoto, summamerkkijonon etumerkki ja johtavat nollat sekä suurimmat sallitut pituudet. Erota JSON-jäsennys, skeeman tarkistus, JCS-kanonisointi ja allekirjoituksen tarkistus. Samasta `by`-tunnisteesta tulevat allekirjoitusduplikaatit eivät saa korvata toisen vaaditun osapuolen hyväksyntää. Määrittele myös itselle siirron ja alkuperäisen haltijan oman SETTLEn sallittavuus.

**Testit:** lukitut JCS-/avain-/allekirjoitusvektorit ja virhetapaukset toimivat kaikissa valituissa selaimissa. Uudelleen muodostuvan ECDSA-allekirjoituksen ei tarvitse olla tavuilleen sama kuin aiempi kelvollinen allekirjoitus; saman sisällön tapahtuma-ID pysyy samana.

## 8. PoC:n SETTLE ei ole kannustinyhteensopiva saldoselvitys

**Kohta 5.3 sekä repon KY-02 ja KY-04.** PoC:n SETTLE edellyttää viimeisen haltijan ja alkuperäisen velallisen uusia allekirjoituksia. Velallinen voi siten estää teknisen lopetustapahtuman vaikenemalla. Määrittely rajaa sen asianmukaisesti testin molemminpuoliseksi kuittaukseksi eikä väitä toteuttavansa lopullista velkatilin selvitystä.

**Jatkototeutuksen ehto:** jos instrumentista myöhemmin tehdään oikeus saldohyvitykseen, sen lunastusta ei saa jättää liikkeeseenlaskijan uuden vapaaehtoisen allekirjoituksen varaan jo kelvollisen ennakkohyväksynnän jälkeen. Kirjaa ennen taloudellista käyttöönottoa lunastuksen oikeus, vastaanottorajan valvonta ja molempien saldomuutosten atomisuus. PoC:n rajattu SETTLE-testi voidaan säilyttää, kun käyttöliittymä ja tulosraportti eivät esitä sitä ratkaistuna taloudellisena lunastuksena.

## Tarkastuksen varmennukset

- Kaikki kolme dokumentin JSON-esimerkkiä ovat syntaktisesti kelvollista JSONia. Tämä ei todista tapahtumien kryptografista kelvollisuutta; tunnisteet ja allekirjoitukset ovat esimerkkipaikkamerkkejä.
- 1 000 tunnisteen inventaarioviestin ylitys toistettiin tavukokoa mittaamalla.
- Määrittelyä verrattiin nykyiseen mallikontekstiin, toteutusjärjestykseen ja kannustinyhteensopivuusvaatimuksiin.
- PoC:n sovellusta ei tässä tehtävässä toteutettu eikä T1–T7-testejä suoritettu. Nykyisen Python-simulaattorin testit eivät varmista tätä selainprotokollaa.

Toteutukseen siirryttäessä täsmennykset päivitetään itse määrittelyyn ja vastaavat testit lisätään sen hyväksymiskriteereihin. Kolmen solmun saman tapahtumajoukon testi on replikoinnin näyttö; se ei ole globaalin konsensuksen, kaksoiskäytön lopullisen eston tai tuotantokelpoisen kirjanpidon näyttö.
