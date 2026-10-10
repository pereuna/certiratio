# Certiratio – nykyinen mallikonteksti

Päivitetty 2026-10-10: suhteellisen velka-akselin malliin on lisätty kannustinyhteensopivuusvaatimus, selainpohjaisen ensitoteutuksen prioriteetti ja velkaseteleitä koskeva jatkopohdinta. Tämä dokumentti on nykyisten mallisääntöjen ensisijainen lähde. Aiempi ei-negatiivisten absoluuttisten saldojen ja erääntyvien lupausten malli on korvattu; sen kuvaus on [historiallisessa v1-kontekstissa](docs/history/VELKATALOUS_CONTEXT_V1.md).

**Toteutusprioriteetti:** järjestelmä toteutetaan aluksi selainpohjaiseksi. Kaikki paperiset ratkaisut ovat aluksi sekundäärinen eli toissijainen tavoite. Ensimmäisen selainversion lähtökohta on suora, välittömästi rekisteröitävä saldosiirto; paperiratkaisujen valmius ei ole sen valmistumisen edellytys.

## 1. Suhteellinen koordinaatisto

Certiratio kirjaa vain suhteellisen saldon `x_i`, joka voi olla negatiivinen, nolla tai positiivinen. Ajatuksellinen suhde `D_i = K + x_i` kuvaa kaikille yhteistä historiallista perusvelkaa ja poikkeamaa siitä. `K`:ta ja `D_i`:tä ei tallenneta, arvioida eikä lasketa. Äärettömyyttä ei käytetä numerona. Malli ei väitä, että jokin äärellinen vakio takaisi absoluuttisen velan positiivisuuden kaikilla mahdollisilla rajoittamattomilla saldopolkuilla.

Historiallisen velan käsitteellinen vastapuoli on osallistujayhteisö kollektiivisesti. Suhteellisen saldon etumerkki kertoo sijainnin yhteisellä velka-akselilla; se ei itsessään määrittele absoluuttisen velkasuhteen suuntaa tai henkilökohtaista oikeudellista saamista.

Henkilö syntyy saldolla `x_i = 0`. Nolla on neutraali vertailupiste, ei velattomuus eikä korkein mahdollinen taloudellinen tila. Myynti voi viedä saldon nollan alapuolelle.

## 2. Välittömät kaupat

Kun A myy työn tai hyödykkeen B:lle sovitulla ei-negatiivisella kokonaisvelkahinnalla `p`:

- `x_A' = x_A - p`
- `x_B' = x_B + p`

Nykyisen simulaation kirjanpitoytimessä hyödyke ja saldomuutos toimitetaan samassa atomisessa tapahtumassa. Ytimen hylkäys ei muuta varastoja, saldoja, liikevaihtoa tai hyväksyttyjen tapahtumien lokia. Ostajan suostumus, myyjän hyödykevarasto ja vastaanottoraja tarkistetaan ennen muutoksia. Tapahtumaprotokollan tasolla vastaanotettu tosite ja valvonnassa hylätty tai jo fyysisesti toimitettu tapahtuma voivat silti edellyttää dokumentointia ja erillistä selvitystä; nämä eivät itsessään oikeuta normaaliin saldohyvitykseen.

Myyjältä ei edellytetä positiivista saldoa tai saldokatetta. Velanluontia, myöhemmin erääntyviä velansiirtolupauksia ja niiden varauksia ei ole. Positiivinen hyödykehinta edellyttää positiivista toimitusmäärää. Erillinen `transfer`-rajapinta tekee suostumukseen perustuvan kahden tilin saldosiirron ilman hyödykettä ja säilyttää saman nollasumman; se ei luo nettosaldoa.

Ilmainen luovutus `p = 0` on sallittu myös vastaanottajalle, jonka saldo ylittää uuden ennusterajan. Luovutus ei lisää saldoa. Positiivisessa vastaanotossa vaaditaan `x_B + p <= L_B`. Negatiivinen saldo antaa siten vastaanottovaraa: saldo −10 ja raja 0 sallivat vastaanoton 10 mutta eivät 11. Olemassa olevia saldoja ei leikata rajan laskiessa. Myyjän alarajaa ei tässä mekanismissa aseteta.

## 3. Kuolema ja yhteisön selvitystili

Toteutuksen eksplisiittinen koevalinta: kuolleen henkilön suhteellinen saldo siirtyy samalla etumerkillä yhteisön erilliselle selvitystilille `C`:

- `C' = C + x_i`
- `x_i' = 0`; henkilön tili suljetaan.

Sama sääntö koskee positiivista, negatiivista ja nollasaldoa. Selvitystili ei ole kaupankäyntiin käytettävä henkilösaldo eikä absoluuttisen kollektiivisen saamisen mittari. Sitä ei jaeta elossa oleville eikä vastasyntyneille.

Kirjanpidon invariantti on `sum_alive(x_i) + C = 0`. Ilman kuolemia `C = 0`, joten henkilöiden saldot summautuvat nollaan. Kuolemien jälkeen pelkkä henkilöiden summa voi poiketa nollasta. Kuolemaa ei esitetä suhteellisen position yksipuolisena hävittämisenä.

Kuolleen fyysiset varastot tuhotaan aiemman tuotantokokeen oletuksena; perintöä ei vielä mallinneta. Juridisen yrityksen lopettaminen ei ole henkilön kuolema. Tuotantoyksiköt ovat simulaatiossa henkilöomistajien toimintoja.

## 4. Kannustinyhteensopivuus: sitova suunnittelukriteeri

> Taloudellisen tapahtuman rekisteröinnin, hyväksynnän ja valvonnan vastuut on järjestettävä siten, ettei yhden osapuolen oikeuden toteutuminen riipu toisen osapuolen myöhemmästä vapaaehtoisesta toiminnasta.

Ostaja hyväksyy saman tositteen myyjän kanssa kaupantekohetkellä, ja myyjä tarkistaa ostajan henkilöllisyyden. Myyjä vastaa rekisteröinnistä ja saa saldohyvityksen vasta rekisteröinnissä. Laskentatoimisto valvoo tapahtuman hyväksyttävyyttä ja kirjaa molemmat saldomuutokset atomisesti. Ostajan myöhempi ilmoitus, tarkistuskappale tai lisävahvistus ei saa olla kirjauksen edellytys.

Myyjän normaali saldohyvitys on taattu vain, jos ostajan oikeus tehdä kyseinen tapahtuma on asianmukaisesti tarkistettu ennen hyödykkeen luovutusta. Digitaalisessa toteutuksessa tarkistus voidaan tehdä välittömästi; paperisessa toteutuksessa voidaan käyttää rajallisia ennakkovaltuutuksia, jotka tarvitsevat aitouden tarkastuksen ja kaksoiskäytön eston. Tositteiden kertakirjaus, virheelliset ilmoitukset, henkilöllisyyspetokset ja kuvitteelliset yhteistoimintakaupat vaativat omat kontrollinsa.

Kirjaamisen ja valvonnan hyväksyttävyyden ero, riitautus, häiriötilanteet ja osapuolten tekemättä jättäminen on määriteltävä eksplisiittisesti. Valvonnassa hylättyä tapahtumaa voidaan joutua käsittelemään kirjanpidossa, vaikka myyjälle ei taata normaalia hyvitystä. Yksityiskohtaiset vaatimukset, neljän paperikappaleen vastuut ja hyväksymiskriteerit ovat [kannustinyhteensopivuusvaatimuksissa](docs/KANNUSTINYHTEENSOPIVUUS.md).

Tämä on toteutusta ohjaava vaatimus. Nykyinen simulaation suostumusmuuttuja ei vielä toteuta todellista tosite-, tunnistus-, valtuutus- tai riitautusprotokollaa. Matemaattisesti täsmäävä kirjanpito ei yksin osoita kannustinyhteensopivuuden toteutumista.

## 5. Velkasetelit: kirjattu jatkopohdinta

Siirtokelpoinen velkaseteli voisi olla väliaikainen oikeus saada velansiirto kirjatuksi. Se voisi kiertää haltijalta toiselle ennen lopullista lunastusta. Haltijaseteli ja allekirjoitetulla siirtosarjalla todettava seteli ovat vaihtoehtoja; juokseva velkakirja ja vekselin siirtomerkinnät ovat pohdinnassa mainittuja historiallisia esikuvia.

Kirjattu suhteellinen saldo ja liikkeessä olevat velkasitoumukset on erotettava: liikkeessä oleva instrumentti voi sitoa liikkeeseenlaskijaa ennen saldokirjausta. Valvonnassa voidaan tarvita molemmat tiedot. Vaihtoehdot ovat laskentatoimiston ennakkovahvistamat numeroidut setelit, joiden arvo huomioidaan jo myöntämisessä, tai henkilökohtaiset setelit, joiden vastaanottaja kantaa myöhemmän hyväksymisen riskin. Kumpaakaan ei ole vielä valittu käyttöön.

Kopioinnin ja kaksoislunastuksen esto, instrumentin aitous, jakaminen ja vaihtoraha tarvitsevat omat menettelynsä. SHA-tiiviste ei todista paperin alkuperäisyyttä tai allekirjoituksen aitoutta. Sähköisenkin setelin tunnisteelle on sallittava vain yksi kelvollinen lunastus, atomisesti molempien saldomuutosten kanssa.

Suora ja välillinen velansiirto voisivat käyttää samaa nollasummaista saldomatematiikkaa, mutta niiden kirjausajankohta ja valvonta eroaisivat. Avoin kysymys on, kirjataanko jokainen vaihto vai vain lopulliset nettomuutokset. Välillisten vaihtojen määrä ei selviä pelkistä lopullisista saldoista. Nykyinen simulaatio ja ensimmäisen selainversion lähtökohta rekisteröivät jokaisen hyväksytyn suoran kaupan erikseen.

Yksityiskohtainen pohdinta, oikeudelliset esikuvat ja avoimet ratkaisut on kirjattu [velkaseteli- ja toteutusjärjestysdokumenttiin](docs/VELKASETELIT_JA_TOTEUTUSJARJESTYS.md). Tämä ei ota setelimekanismia käyttöön, muuta nykyistä saldoidentiteettiä tai palauta v1-mallin velanluontia.

## 6. Taloudellinen tulkinta ja tutkimusrajat

Negatiivinen saldo tarjoaa ostovoiman kaltaista vastaanottovaraa, vaikka filosofinen velkatulkinta säilyy. Tämä toiminnallinen ominaisuus pitää raportoida eikä peittää terminologialla. Agentteja ei optimoida maksimaaliseen negatiiviseen saldoon, säästöihin tai nollavelkaan. Kulutus-, tuotanto- ja vapaa-aikapreferenssit ovat kokeellisia.

Yhteinen tuotantoperintö on käsitteellinen lähtökohta, ei numeerinen hintakaava tai syntymässä tehtävä saldoinjektio. Pitkät tuotantoketjut, työn mukana siirtyvä velka ja julkisten palveluiden mahdolliset siirrot säilyvät tutkimuskohteina. Malliin ei lisätä moraalin tai ansaitsevuuden mittareita.

Kirjanpitokerros, fyysinen tuotanto ja agenttien päätössäännöt pidetään erillisinä. Jokaisen tapahtuman jälkeen tarkistetaan saldot ja hyödykevarastojen identiteetit. Tutkimusrunko on ABM ja stock–flow-kirjanpidon kurinalaisuus; tämä ei ole empiirisesti kalibroitu täysi sektoritaseisiin perustuva makromalli.

Avoimia kysymyksiä: hintayksikön ankkuri, elinikäisen vastaanottorajan ennustaminen ja aggregaattinen kysyntä, rajoittamattoman negatiivisen saldon kannustimet, yritysten vastuut, yhteisötilin pitkän ajan kertymä ja oikeudellinen merkitys, perintö, julkisten palveluiden jakosäännöt sekä henkilöllisyyden ja fyysisen toimituksen todentaminen. Täsmäävä kirjanpito ei todista talouden elinkelpoisuutta.
