# Certiratio: velkasetelit ja toteutusjärjestys

Kirjattu 2026-10-10 käyttäjän keskustelupohdinnan ja toteutusprioriteettia koskevan päätöksen perusteella. Tämä dokumentti säilyttää pohdinnan sisällön ja erottaa päätetyn toteutusjärjestyksen vielä avoimista mekanismivalinnoista.

## 1. Päätetty toteutusjärjestys

**Järjestelmä toteutetaan aluksi selainpohjaiseksi. Kaikki paperiset ratkaisut ovat aluksi sekundäärinen eli toissijainen tavoite.**

Ensimmäisen toteutuksen lähtökohta on suora, välittömästi rekisteröitävä suhteellisen saldon siirto. Selainkäyttöliittymä ja sen taustapalvelu toteuttavat hyväksynnän, myyjän rekisteröinnin, vastaanottorajan valvonnan ja atomisen kirjauksen [kannustinyhteensopivuusvaatimusten](KANNUSTINYHTEENSOPIVUUS.md) mukaisesti. Ostajan kaupantekohetken hyväksyntä ei saa muuttua vaatimukseksi ostajan myöhemmästä vapaaehtoisesta lisävahvistuksesta.

Paperitositteet, nelinkertaiset kuittivihkot, paperiset ostovaltuutukset sekä haltija- ja siirtomerkittävät paperiset velkasetelit ovat myöhemmän vaiheen suunnittelukohteita. Niiden suunnittelu ei saa olla ensimmäisen selainpohjaisen toteutuksen valmistumisen edellytys. Selainpohjaisuus ei tarkoita, että kirjauksen luotettavuus tai vastaanottorajan valvonta jätettäisiin asiakkaan selaimen vastuulle.

Siirtokelpoisen velkasetelin mekanismi, myös mahdollinen sähköinen muoto, on tässä dokumentissa tutkimusvaihtoehto. Sen käyttöönottoa ensimmäiseen selainversioon ei ole päätetty. Nykyinen repo sisältää tutkimussimulaattorin; selainpohjainen tapahtumajärjestelmä on seuraava toteutustavoite.

## 2. Oikeudelliset ja historialliset esikuvat

Pohdinnassa mainitut Suomen oikeuden rakenteelliset vertailukohdat ovat:

- **Velkakirjalain 11 §:** juokseva velkakirja voidaan asettaa haltijalle tai nimetylle henkilölle tai hänen määräämälleen.
- **Vekselilain 11–16 §:** siirtomerkinnät, niiden allekirjoittaminen ja haltijan oikeuden todentaminen katkeamattoman siirtosarjan avulla.

Certiration velkaseteli voisi hyödyntää näiden instrumenttien historiallista rakennetta, vaikka sen lunastus tarkoittaisi suhteellisen saldon siirron kirjaamista eikä tavanomaista rahasuoritusta. Viittaukset ovat suunnittelun esikuvia. Certiration välineen oikeudellinen luokittelu, sitovuuden ehdot ja lakien soveltuminen siihen ovat erikseen selvitettäviä kysymyksiä.

| Muoto | Oikeus kirjaukseen | Ominaisuus |
|---|---|---|
| Haltijaseteli | Alkuperäisen paperin haltijalla | Muistuttaa tavallista setelirahaa; omistajanvaihdoksia ei välttämättä nimetä paperiin |
| Siirtomerkittävä seteli | Todennetun siirtosarjan viimeisellä haltijalla | Uusi haltija merkitään kääntöpuolelle tai lisälehdelle ja siirto allekirjoitetaan; parempi jäljitettävyys |

Kumpaakaan muotoa ei tässä valita ensisijaiseksi toteutukseksi. Kadonneen alkuperäisen, väärennetyn siirtomerkinnän tai katkenneen siirtosarjan käsittely tarvitsee oman menettelynsä.

## 3. Kaksoislunastus ja aitous

Paperisessa toteutuksessa alkuperäinen arvopaperi on erotettava kopioista. **SHA-tunniste voi osoittaa tietosisällön vastaavuuden, mutta ei paperin alkuperäisyyttä eikä allekirjoituksen aitoutta.** Sisällön tiiviste ei korvaa henkilöllisyyden, allekirjoituksen tai alkuperäisen instrumentin todentamista.

Allekirjoitettu sähköinen seteli voidaan kopioida rajattomasti. Siksi lunastusrekisterin on hyväksyttävä kelvollisen, yksilöllisen setelitunnisteen lunastus vain kerran. Samanaikaiset lunastusyritykset ja uudelleenlähetykset eivät saa tuottaa toista hyvitystä. Lunastetuksi merkitseminen ja molempien saldomuutosten kirjaaminen on tehtävä atomisesti.

Digitaalinen allekirjoitus voi todentaa allekirjoittajan ja allekirjoitetut tiedot, mutta se ei yksin estä saman instrumentin kopioimista tai toistuvaa käyttämistä. Instrumentin siirtäminen seuraavalle haltijalle ja sen lopullinen lunastaminen ovat myös eri toimintoja, joiden oikeudet ja todentaminen on määriteltävä.

## 4. Velkaantumisen valvonta liikkeessäolon aikana

Jos liikkeeseenlaskija voi kirjoittaa rajattomasti seteleitä ja ne tulevat laskentatoimiston tietoon vasta kuukausia myöhemmin, pelkät tilisaldot eivät kuvaa hänen todellista sitoumusmääräänsä. Vastaanottorajan valvonta ei silloin voi perustua yksinomaan jo lunastettuihin seteleihin.

Pohdinnan kaksi vaihtoehtoa:

| Vaihtoehto | Myöntäminen ja valvonta | Vastaanottajan riski |
|---|---|---|
| Ennakkovahvistetut, numeroidut setelit | Laskentatoimisto vahvistaa rajallisen määrän; yhteenlaskettu arvo huomioidaan liikkeeseenlaskijan velkaantumisvalvonnassa jo myöntämishetkellä | Väline perustuu yhteisön ennalta hyväksymään tapahtumaoikeuteen; takuun ehdot on määriteltävä |
| Vapaasti kirjoitettavat henkilökohtaiset setelit | Liikkeeseenlaskija antaa oman sitoumuksensa ilman toimiston ennakkovahvistusta | Vastaanottaja kantaa riskin siitä, ettei seteliä myöhemmin hyväksytä täysimääräisesti |

Ensimmäinen vaihtoehto muistuttaa yhteisön ennalta hyväksymää luottovälinettä, toinen henkilökohtaista luottovälinettä. Näitä ei saa esittää saman hyvitystakuun tarjoavina vaihtoehtoina. Myös setelin seuraavan vastaanottajan on voitava tunnistaa, kumpaa muotoa hän ottaa vastaan.

Ennakkovahvistetun vaihtoehdon on määriteltävä liikkeessä olevien setelien huomioiminen vastaanottovarassa, voimassaolo, peruutukset ja rajan myöhemmät muutokset. Lunastuksessa huomioitu sitoumus korvautuu kirjauksella; samaa määrää ei saa laskea sekä avoimena sitoumuksena että lunastettuna saldomuutoksena. Tämä valvontamenettely on vielä suunniteltava.

Myyjän tai viimeisen haltijan hyvitystakuu noudattaa aiempaa suunnitteluehtoa: takuu edellyttää kyseisen tapahtumaoikeuden asianmukaista tarkistamista. Ostajan tai liikkeeseenlaskijan myöhempi vapaaehtoinen vahvistus ei saa olla jo hyväksytyn lunastusoikeuden toteutumisen ehto. Hylätty seteli ja mahdollisesti jo toimitettu hyödyke käsitellään erillisessä selvityksessä.

## 5. Kirjattu saldo ja liikkeessä olevat sitoumukset

**Kirjattu suhteellinen saldo ei ole sama asia kuin liikkeessä olevat velkasitoumukset.**

Pohdinnan mukainen seteli voi olla liikkeeseenlaskijaa sitova vastuu ennen kuin sen määrä näkyy hänen suhteellisessa tilisaldossaan. Sitovuuden oikeudelliset ja tekniset ehdot on määriteltävä. Velkaantumisen valvonnassa sekä kirjattu saldo että liikkeessä olevat vastuut voivat olla olennaisia.

Setelin tarkoitus olisi väliaikainen, siirrettävä oikeus saada velansiirto kirjatuksi. Sitä ei ole tarkoitus lisätä henkilön tilille erilliseksi positiiviseksi rahasaldoksi. Tämä ei poista siirrettävän oikeuden taloudellista merkitystä.

Nollasummainen saldosiirto säilyy lunastuksessa: jos liikkeeseenlaskija I on sitoutunut vastaanottamaan määrän p ja kelvollinen viimeinen haltija H käyttää oikeuden, ehdokassääntö on `x_H -= p` ja `x_I += p`. Molemmat kirjataan yhdessä. Setelin myöntäminen, liikkeessäolo ja lunastuksen ehdot vaativat erillisen instrumentti- ja valvontakerroksen.

Tämä tutkimusvaihtoehto ei palauta v1-mallin puuttuvan saldokatteen velanluontia eikä tarkoita, että nykyiseen välittömien kauppojen moottoriin lisättäisiin nyt erääntyviä lupauksia. Kirjatut suhteelliset positiot noudattavat edelleen invarianttia `sum_alive(x_i) + C = 0`.

## 6. Setelin jakaminen ja vaihtoraha

Sadan yksikön seteli ei sellaisenaan sovellu 30 yksikön ostoon, ellei 70 yksikön erotusta palauteta toisena hyväksyttävänä välineenä tai käytetä erikseen määriteltyä osittaisen lunastuksen menettelyä.

Jakaminen pienempiin seteleihin, vaihtorahan antaminen ja osittainen lunastus tarvitsevat omat sääntönsä. Jos vanha seteli korvataan esimerkiksi 30 ja 70 yksikön instrumenteilla, alkuperäinen ei saa jäädä uudelleen lunastettavaksi, ja uusien oikeuksien kokonaismäärän on säilyttävä. Mahdollisen jäännösarvon ja uusien tunnisteiden syntyminen on käsiteltävä yhdessä, jotta jakaminen ei monista lunastusoikeutta.

Näistä vaihtoehdoista ei tässä valita toteutusmenettelyä.

## 7. Suora ja välillinen velansiirto

Pohdinta avaa mahdollisuuden kahteen saman saldomatematiikan mukaiseen tapahtumatapaan:

| Tapa | Vaihto ja kirjaus | Valvonnan erityiskysymys |
|---|---|---|
| Suora velansiirto | Ostajan ja myyjän tapahtuma kirjataan välittömästi; myöhemmässä paperiratkaisussa hyväksytyn tositteen rekisteröinti voi tapahtua jälkikäteen | Ostajan oikeus ja molempien hyväksyntä on tarkistettava asianmukaisesti; myyjä rekisteröi |
| Välillinen velansiirto | Ostaja antaa siirtokelpoisen setelin, joka voi kiertää useita kertoja ennen lopullista kirjausta | Liikkeessä olevat vastuut, haltijan oikeus ja kertalunastus on valvottava erikseen |

Molemmat voisivat toimia samassa yhteiskunnassa, mutta kirjausajankohta, riskit ja tarvittava valvonta eroavat. Ensimmäiseen selainpohjaiseen toteutukseen valittu lähtökohta on suora siirto; rinnakkaisen setelimekanismin käyttöönotto on avoin jatkopäätös.

Välillisen vaihdon aikana tapahtuvat kaupat eivät välttämättä näy yksilöllisissä tilisaldoissa. Pelkistä lopullisista saldokirjauksista ei silloin voi päätellä kaikkia vaihtoja tai todellista kaupankäyntiliikevaihtoa.

Esimerkiksi I ostaa tavaran H1:ltä 100 yksikön setelillä, ja H1 käyttää saman setelin ostaakseen H2:lta. Jos H2 lunastaa setelin, lopullinen ehdokaskirjaus on I:lle +100 ja H2:lle −100; H1:n nettomuutos on nolla. Yksi lopullinen saldosiirto ei kuvaa kahta tapahtunutta hyödykekauppaa. Tämä on netotuksen havainnollistus, ei vielä hyväksytty instrumenttiprotokolla.

## 8. Avoin peruskysymys: jokainen vaihto vai lopulliset nettomuutokset?

**Pitääkö jokainen vaihto rekisteröidä, vai riittääkö, että velkasuhteiden lopulliset nettomuutokset kirjataan?**

Jos lopulliset nettomuutokset riittävät, siirtokelpoinen velkaseteli voisi selvittää kokonaisen vaihtoketjun yhdellä kirjanpitotapahtumalla. Jos jokaisesta vaihdosta tarvitaan erillinen tapahtumatieto, on määriteltävä myös siirtoketjun kirjaaminen ja todentaminen, vaikka saldot netotettaisiin vasta lunastuksessa.

Tästä ei vielä tehdä lopullista protokollapäätöstä. Nykyinen simulaattori kirjaa jokaisen hyväksytyn suoran kaupan erikseen, ja tämä on myös ensimmäisen selainversion suunnittelun lähtökohta. Myöhemmän netotusratkaisun on erotettava taloudellisten vaihtojen tiedot, instrumenttien siirrot ja tilisaldojen selvityskirjaukset. Mittareissa ei saa nimetä pelkkää lopullista lunastusmäärää koko vaihtoketjun kaupankäyntivolyymiksi.

## 9. Jatkosuunnittelussa ratkaistavat asiat

- Velkasetelin hyväksynnän sisältö, oikeudellinen sitovuus ja viimeisen haltijan oikeuden todentaminen.
- Haltija- tai siirtomerkittävä muoto, mahdollinen sähköinen muoto ja niiden siirto- sekä kertalunastusmenettelyt.
- Ennakkovahvistetun ja henkilökohtaisen välineen erot, liikkeessä olevien vastuiden valvonta ja vastaanottajalle näkyvä hyväksymisriski.
- Jakaminen, vaihtoraha, osittainen lunastus, peruutus sekä kadonneen instrumentin käsittely.
- Liikkeeseenlaskijan tai haltijan kuolema kesken liikkeessäolon suhteessa yhteisön selvitystiliin.
- Jokaisen vaihdon rekisteröinti tai lopullinen netotus sekä vaikutus tarkastettavuuteen, väärinkäytösten valvontaan ja taloudellisiin mittareihin.

Nämä ovat tutkimus- ja suunnittelukysymyksiä. Ensimmäisen selainpohjaisen toteutuksen valmistuminen ei edellytä paperiratkaisujen tai siirtokelpoisen setelimekanismin valmiutta.
