# Certiratio – nykyinen mallikonteksti

Päivitetty 2026-10-09 käyttäjän uuden suhteellista velka-akselia koskevan päätöksen perusteella. Tämä dokumentti on nykyisten mallisääntöjen ensisijainen lähde. Aiempi ei-negatiivisten absoluuttisten saldojen ja erääntyvien lupausten malli on korvattu; sen kuvaus on [historiallisessa v1-kontekstissa](docs/history/VELKATALOUS_CONTEXT_V1.md).

## 1. Suhteellinen koordinaatisto

Certiratio kirjaa vain suhteellisen saldon `x_i`, joka voi olla negatiivinen, nolla tai positiivinen. Ajatuksellinen suhde `D_i = K + x_i` kuvaa kaikille yhteistä historiallista perusvelkaa ja poikkeamaa siitä. `K`:ta ja `D_i`:tä ei tallenneta, arvioida eikä lasketa. Äärettömyyttä ei käytetä numerona. Malli ei väitä, että jokin äärellinen vakio takaisi absoluuttisen velan positiivisuuden kaikilla mahdollisilla rajoittamattomilla saldopolkuilla.

Historiallisen velan käsitteellinen vastapuoli on osallistujayhteisö kollektiivisesti. Suhteellisen saldon etumerkki kertoo sijainnin yhteisellä velka-akselilla; se ei itsessään määrittele absoluuttisen velkasuhteen suuntaa tai henkilökohtaista oikeudellista saamista.

Henkilö syntyy saldolla `x_i = 0`. Nolla on neutraali vertailupiste, ei velattomuus eikä korkein mahdollinen taloudellinen tila. Myynti voi viedä saldon nollan alapuolelle.

## 2. Välittömät kaupat

Kun A myy työn tai hyödykkeen B:lle sovitulla ei-negatiivisella kokonaisvelkahinnalla `p`:

- `x_A' = x_A - p`
- `x_B' = x_B + p`

Hyödyke ja saldomuutos toimitetaan samassa atomisessa tapahtumassa. Hylkäys ei muuta varastoja, saldoja, liikevaihtoa tai tapahtumalokia. Ostajan suostumus, myyjän hyödykevarasto ja vastaanottoraja tarkistetaan ennen muutoksia.

Myyjältä ei edellytetä positiivista saldoa tai saldokatetta. Velanluontia, myöhemmin erääntyviä velansiirtolupauksia ja niiden varauksia ei ole. Positiivinen hyödykehinta edellyttää positiivista toimitusmäärää. Erillinen `transfer`-rajapinta tekee suostumukseen perustuvan kahden tilin saldosiirron ilman hyödykettä ja säilyttää saman nollasumman; se ei luo nettosaldoa.

Ilmainen luovutus `p = 0` on sallittu myös vastaanottajalle, jonka saldo ylittää uuden ennusterajan. Luovutus ei lisää saldoa. Positiivisessa vastaanotossa vaaditaan `x_B + p <= L_B`. Negatiivinen saldo antaa siten vastaanottovaraa: saldo −10 ja raja 0 sallivat vastaanoton 10 mutta eivät 11. Olemassa olevia saldoja ei leikata rajan laskiessa. Myyjän alarajaa ei tässä mekanismissa aseteta.

## 3. Kuolema ja yhteisön selvitystili

Toteutuksen eksplisiittinen koevalinta: kuolleen henkilön suhteellinen saldo siirtyy samalla etumerkillä yhteisön erilliselle selvitystilille `C`:

- `C' = C + x_i`
- `x_i' = 0`; henkilön tili suljetaan.

Sama sääntö koskee positiivista, negatiivista ja nollasaldoa. Selvitystili ei ole kaupankäyntiin käytettävä henkilösaldo eikä absoluuttisen kollektiivisen saamisen mittari. Sitä ei jaeta elossa oleville eikä vastasyntyneille.

Kirjanpidon invariantti on `sum_alive(x_i) + C = 0`. Ilman kuolemia `C = 0`, joten henkilöiden saldot summautuvat nollaan. Kuolemien jälkeen pelkkä henkilöiden summa voi poiketa nollasta. Kuolemaa ei esitetä suhteellisen position yksipuolisena hävittämisenä.

Kuolleen fyysiset varastot tuhotaan aiemman tuotantokokeen oletuksena; perintöä ei vielä mallinneta. Juridisen yrityksen lopettaminen ei ole henkilön kuolema. Tuotantoyksiköt ovat simulaatiossa henkilöomistajien toimintoja.

## 4. Taloudellinen tulkinta ja tutkimusrajat

Negatiivinen saldo tarjoaa ostovoiman kaltaista vastaanottovaraa, vaikka filosofinen velkatulkinta säilyy. Tämä toiminnallinen ominaisuus pitää raportoida eikä peittää terminologialla. Agentteja ei optimoida maksimaaliseen negatiiviseen saldoon, säästöihin tai nollavelkaan. Kulutus-, tuotanto- ja vapaa-aikapreferenssit ovat kokeellisia.

Yhteinen tuotantoperintö on käsitteellinen lähtökohta, ei numeerinen hintakaava tai syntymässä tehtävä saldoinjektio. Pitkät tuotantoketjut, työn mukana siirtyvä velka ja julkisten palveluiden mahdolliset siirrot säilyvät tutkimuskohteina. Malliin ei lisätä moraalin tai ansaitsevuuden mittareita.

Kirjanpitokerros, fyysinen tuotanto ja agenttien päätössäännöt pidetään erillisinä. Jokaisen tapahtuman jälkeen tarkistetaan saldot ja hyödykevarastojen identiteetit. Tutkimusrunko on ABM ja stock–flow-kirjanpidon kurinalaisuus; tämä ei ole empiirisesti kalibroitu täysi sektoritaseisiin perustuva makromalli.

Avoimia kysymyksiä: hintayksikön ankkuri, elinikäisen vastaanottorajan ennustaminen ja aggregaattinen kysyntä, rajoittamattoman negatiivisen saldon kannustimet, yritysten vastuut, yhteisötilin pitkän ajan kertymä ja oikeudellinen merkitys, perintö, julkisten palveluiden jakosäännöt sekä henkilöllisyyden ja fyysisen toimituksen todentaminen. Täsmäävä kirjanpito ei todista talouden elinkelpoisuutta.
