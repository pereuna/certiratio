# Certiratio: kannustinyhteensopivan tapahtumaprotokollan vaatimukset

Lisätty 2026-10-10 käyttäjän suunnittelupäätöksen perusteella. Tämä on protokollan sitova suunnittelukriteeri ja vaatimus, ei väite siitä, että nykyinen tutkimussimulaattori jo toteuttaisi kaikki kontrollit. Suhteellisten saldojen mekanismi säilyy [mallikontekstin](../VELKATALOUS_CONTEXT.md) mukaisena.

## 1. Keskeinen suunnitteluehto

> Taloudellisen tapahtuman rekisteröinnin, hyväksynnän ja valvonnan vastuut on järjestettävä siten, ettei yhden osapuolen oikeuden toteutuminen riipu toisen osapuolen myöhemmästä vapaaehtoisesta toiminnasta.

Toimintoa ei pidä antaa sellaisen osapuolen vastuulle, joka hyötyy sen tekemättä jättämisestä tai jolle tekemättä jättämisestä ei aiheudu haittaa. Periaate liittyy mekanismisuunnittelun kannustinyhteensopivuuteen (*incentive compatibility*). Pelkkä matemaattisesti virheetön kirjanpito ei riitä, jos tarvittavat toimenpiteet jäävät käytännössä tekemättä.

Kun A myy B:lle hyödykkeen 100 yksikön kokonaisvelkahinnalla:

| Osapuoli | Suhteellisen saldon muutos | Rekisteröinnin kannustin |
|---|---:|---|
| Myyjä A | −100 | Vahva: saldo pienenee ja vastaanottovara kasvaa |
| Ostaja B | +100 | Heikko tai kielteinen: saldo kasvaa ja vastaanottovara pienenee |

Tästä seuraa myyjän rekisteröintivastuu. Ostajan kaupantekohetken hyväksyntä on pakollinen, mutta ostajan myöhempi ilmoitus tai lisävahvistus ei saa olla myyjän hyvityksen ehto. Periaate koskee paperitositteita, sovelluksia ja palvelimia. Se ei poista laskentatoimiston hyväksyttävyysvalvontaa.

## 2. Kolme erillistä vastuuta

| Vastuu | Vastuutaho | Vaatimus |
|---|---|---|
| Tapahtuman hyväksyminen | Ostaja; myyjä hyväksyy saman tositteen | Molemmat hyväksyvät samat tapahtumatiedot kaupantekohetkellä. Myyjä tarkistaa ostajan henkilöllisyyden. |
| Rekisteröinti | Myyjä | Myyjä toimittaa hyväksytyn tositteen laskentatoimistoon. Myyjä saa saldohyvityksen vasta rekisteröinnissä. |
| Hyväksyttävyysvalvonta | Laskentatoimisto | Toimisto tarkistaa tapahtuman ehdot ja valvoo vastaanottorajaa sekä väärinkäytöksiä. Se ei ole pelkkä tositteiden säilyttäjä. |

### KY-01: hyväksyntä samalle tositteelle

Ostajan ja myyjän hyväksynnän on koskettava samoja tietoja: osapuolet, hyödyke tai palvelu, määrä ja kokonaisvelkahinta. Hyväksyntä on voitava todentaa esimerkiksi allekirjoituksesta. Myyjän yksipuolinen ilmoitus ei riitä ostajan saldon kasvattamiseen. Henkilöllisyyden tarkastusmenetelmä ja hyväksynnän todentaminen on määriteltävä toteutuskohtaisesti.

### KY-02: myyjän rekisteröinti riittää

Myyjän toimittama, molempien hyväksymä ja valvonnassa hyväksyttävä tosite on riittävä peruste molempien saldomuutosten rekisteröintiin. Ostajan erillistä jälki-ilmoitusta, tarkistuskappaletta tai myöhempää vapaaehtoista vahvistusta ei saa vaatia. Ostajan vaikeneminen kaupanteon jälkeen ei ole veto-oikeus hyväksyttyyn tapahtumaan.

### KY-03: atomisuus ja kertakirjaus

Laskentatoimisto kirjaa `x_A -= 100` ja `x_B += 100` yhtenä atomisena tapahtumana. Myyjän hyvitystä ja ostajan saldon kasvua ei saa toteuttaa toisistaan riippumatta. Tositteella on oltava yksilöivä tunniste ja kaksoiskirjauksen esto: uudelleenlähetys tai toisen kuittikappaleen toimittaminen ei saa tehdä toista saldosiirtoa.

### KY-04: hyvitystakuu edellyttää ostajan oikeuden tarkistamista

Myyjän normaali saldohyvitys on taattu vain, jos ostajan oikeus tehdä kyseinen tapahtuma on asianmukaisesti tarkistettu. Tarkistus on tehtävä ennen hyödykkeen luovutusta tavalla, johon myyjä voi perustaa toimintansa. Näin myyjällä on kannustin tarkistaa henkilöllisyys ja ostovaltuus.

Positiivisen hinnan vastaanotossa ehto on edelleen `x_B + p <= L_B`. Negatiivinen saldo antaa vastaanottovaraa; ilmainen luovutus ei kasvata saldoa. Digitaalisessa toteutuksessa tarkistus ja rekisteröinti voidaan tehdä välittömästi. Samanaikaiset kaupat eivät saa yhdessä ylittää hyväksyttyä vastaanottovaraa.

Paperisessa järjestelmässä voidaan käyttää laskentatoimiston ennalta myöntämiä rajallisia ostovaltuutuksia, joiden aitouden myyjä tarkistaa. Valtuutuksen määrä, voimassaolo, kuluminen, väärentämisen esto ja kaksoiskäytön esto on määriteltävä. Myös valtuutuksen voimassa ollessa muuttuvien rajojen ja mahdollisen peruutuksen vaikutus hyvitystakuuseen on ratkaistava ennen käyttöönottoa. Ostovaltuutus on tapahtumaoikeuden tarkastusväline, ei vanhan mallin erääntyvä velansiirtolupaus tai velanluontimekanismi.

### KY-05: valvonta kattaa myös yhteistoiminnan

Väärille ilmoituksille, henkilöllisyyspetoksille ja osapuolten yhdessä tekemille kuvitteellisille kaupoille on määriteltävä omat kontrollinsa. Molempien allekirjoitukset eivät yksin todista fyysistä toimitusta tai kaupan todellisuutta. Kontrollien kattavuus ja jäljelle jäävä riski on dokumentoitava; niitä ei saa päätellä ratkaistuiksi saldojen täsmäämisestä.

### KY-06: ilmoitus ja riitautus eivät ole jälkivahvistus

Laskentatoimisto voi ilmoittaa ostajalle rekisteröinnistä. Ostajalla on oltava tapa tarkistaa kirjaus ja riitauttaa virheellinen tapahtuma. Ilmoituksen vastaanottokuittaus tai riitautusajan aikana annettava lisävahvistus ei saa olla normaalin saldohyvityksen toteutumisen ehto. Riitautuksen, selvityksen ja mahdollisen oikaisun säännöt on määriteltävä erikseen. Oikaisu säilyttää saldoinvariantin ja jäljitettävän yhteyden alkuperäiseen tapahtumaan.

### KY-07: kirjaaminen ja hyväksyttävyys erotetaan

Tositteen vastaanotto, tapahtuman dokumentointi ja valvonnan hyväksyttävyysratkaisu ovat eri asioita kuin normaali saldosiirto. Valvonnassa hylättyä tapahtumaa voidaan joutua käsittelemään kirjanpidossa ja selvityksessä, vaikka myyjälle ei taata normaalia hyvitystä.

Jos myyjä on jo luovuttanut tavaran ostajalle ilman asianmukaista oikeuden tarkistusta tai ostajan rajan ylityttyä, tapahtumaa ei saa vain olettaa olemattomaksi. Protokollan on määriteltävä hylkäyksen syyn, toimitustiedon ja tositteen säilytys sekä selvitys-, vastuu- ja mahdollisten oikaisujen menettely. Tästä vaatimuksesta ei johdeta automaattista hyvitystä, yksipuolista vastakirjausta tai toteutumattoman kaupan fyysistä palautusta.

Nykyisen simulaation `Rejected` estää hyväksymättömän kaupan ennen varasto- ja saldomuutoksia. Se ei vielä mallinna tositetta tavarasta, joka on luovutettu simulaation ulkopuolella, eikä toteuta riita- tai selvitysmenettelyä. Protokollan tositteiden ja selvitysten loki on erotettava kirjanpitoytimen hyväksyttyjen tapahtumien lokista; vaatimusta hylkäyksen muuttumattomista saldoista ei pidä tulkita kielloksi dokumentoida hylättyä tositetta.

## 3. Nelinkertainen paperitosite

Kaikki kappaleet koskevat samaa molempien hyväksymää tapahtumaa ja samaa tunnistetta.

| Kappale | Käsittelijä | Tarkoitus |
|---|---|---|
| 1. Myyjän kuitti | Myyjä säilyttää | Myyjän oma näyttö hyväksytystä kaupasta |
| 2. Ostajan kuitti | Ostaja säilyttää | Ostajan oma näyttö ja kirjauksen tarkistaminen |
| 3. Rekisteröintitosite | Myyjä toimittaa laskentatoimistoon | Molempien saldomuutosten atominen rekisteröinti |
| 4. Tarkistuskappale | Ostaja voi toimittaa riippumattomaan tarkastukseen | Ylimääräinen tarkastusmahdollisuus |

Neljännen kappaleen puuttuminen ei saa estää rekisteröintiä. Kuittikappaleiden eroja ei saa ratkaista tekemällä kummastakin erillistä saldosiirtoa; ne ovat samaa tapahtumaa koskevaa näyttöä.

## 4. KY-08: myös tekemättä jättäminen on määriteltävä

| Tilanne | Protokollalta vaadittu toiminta |
|---|---|
| Ostaja ei hyväksy kauppaa kaupantekohetkellä | Normaalia hyväksyttyä kauppaa ei rekisteröidä. Ostajan suostumusta ei oleteta hiljaisuudesta. |
| Ostaja hyväksyy mutta ei myöhemmin ilmoita mitään | Myyjän toimittama hyväksyttävä tosite riittää kirjaukseen. |
| Ostaja ei toimita neljättä kappaletta | Lisätarkastus jää toteutumatta; kirjaus ei esty. |
| Myyjä ei rekisteröi tapahtumaa | Myyjän normaali saldohyvitys ei toteudu; rekisteröinti on myyjän omassa intressissä. |
| Laskentatoimisto tai yhteys ei toimi | On määriteltävä tositteen säilytys, vastaanoton todennus, turvallinen uudelleenlähetys ja häiriön käsittely. Ostajan uutta hyväksyntää ei saa tehdä palautumisen ehdoksi. |
| Sama tosite toimitetaan uudelleen | Jo rekisteröity tapahtuma tunnistetaan eikä kirjata toista kertaa. |
| Ostajan oikeutta ei tarkisteta tai valvonta hylkää tapahtuman | Normaalia hyvitystä ei taata; tositteen ja mahdollisesti toteutuneen toimituksen selvitys noudattaa KY-07:ää. |

Laskentatoimiston rekisteröinti- ja valvontavelvollisuus sekä häiriöstä palautumisen menettely on määriteltävä palvelun vastuuksi. Oikeuden toteutumista ei saa jättää myöskään laskentatoimiston mielivaltaisen vapaaehtoisuuden varaan. Tekninen saatavuus, vastaanottokuittaus ja korvaava käsittelyreitti ovat toteutuksessa ratkaistavia asioita.

## 5. Hyväksymiskriteerit ja nykyisen toteutuksen rajat

Tapahtumaprotokollan toteutuksen on osoitettava testeillä vähintään seuraavat tapaukset:

1. Ostaja hyväksyy tositteen ja vaikenee; myyjän rekisteröinti toteuttaa molemmat saldomuutokset ilman ostajan jälkivahvistusta.
2. Neljäs paperikappale puuttuu; rekisteröinti onnistuu ja riippumaton tarkastus on erillinen toiminto.
3. Myyjä ei rekisteröi; normaalia saldohyvitystä ei kirjata ennakkoon.
4. Puuttuva hyväksyntä, muutetut tositetiedot tai väärä henkilöllisyys estävät normaalin hyväksytyn kirjauksen.
5. Hyväksyttävä ostovaltuus tuottaa luvatun hyvityksen; puuttuva tarkistus ei anna ehdotonta hyvitystakuuta.
6. Samanaikaiset kaupat, saman tositteen uudelleenlähetys ja saman paperivaltuutuksen kaksoiskäyttö eivät mahdollista ylimääräisiä saldosiirtoja tai vastaanottorajan ohitusta.
7. Laskentatoimiston häiriöstä palaaminen onnistuu säilytetystä hyväksynnästä ja tositteesta ilman ostajan uutta toimenpidettä.
8. Valvonnassa hylätty mutta fyysisesti toimitettu kauppa säilyy selvityksessä; normaalia hyvitystä ei luvata automaattisesti.
9. Ostajan ilmoitukseen reagoimattomuus ei estä kirjausta; riitautus ja oikaisu ovat jäljitettäviä ja säilyttävät nollasumman.
10. Väärien ilmoitusten ja kuvitteellisten yhteistoimintakauppojen kontrollit arvioidaan erikseen matemaattisista invarianttitesteistä.

Nykyinen tutkimussimulaattori tarkistaa testisyötteenä annetun `consent=True`-arvon, vastaanottorajan ja atomisen hyödyke-/saldosiirron. Se ei toteuta allekirjoitettuja tositteita, henkilöllisyyden todentamista, rekisteröintivastuun kannustimia, paperivaltuutuksia, tositteiden kertakirjausta, häiriöpalautumista tai riitautusta. Nykyisten testien läpäisyä ei saa esittää tämän tapahtumaprotokollan hyväksymiskriteerien läpäisynä.

Certiration suunnittelutavoite on velansiirron kirjanpitoprotokolla ja kannustinyhteensopiva tapahtumaprotokolla. Toteutus arvioidaan sekä saldojen oikeellisuudella että sillä, toteutuvatko tarvittavat hyväksyntä-, rekisteröinti- ja valvontatoimet myös osapuolten jättäessä myöhemmät vapaaehtoiset toimet tekemättä.
