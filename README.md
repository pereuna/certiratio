
# Credita certa, homines liberi.

# Velkatalous – ensimmäinen tutkimussimulaattori

Lue [johdonmukaisuusauditointi ja toteutussuunnitelma](docs/MALLI_JA_SUUNNITELMA.md) sekä alkuperäinen [mallikonteksti](VELKATALOUS_CONTEXT.md). Käyttäjän periaatteet ja kokeelliset oletukset on erotettu raportissa.

Velka on osallistujayhteisölle kollektiivisesti. Työn tai hyödykkeen vastaanottaja ottaa sovitun osan luovuttajan velasta kannettavakseen; yhteisön saaminen ei muodosta osallistujille henkilökohtaisia positiivisia saamissaldoja.

Python 3.10 tai uudempi, vain standardikirjasto. Aja projektin juuresta:

```bash
python3 -m unittest discover -s tests -v
python3 -m velkatalous.simulation --seed 7 --periods 30 --output results/baseline.json
python3 -m velkatalous.simulation --no-creation --output results/no_creation.json
python3 -m velkatalous.simulation --cap-scale 0 --output results/zero_limit.json
python3 -m velkatalous.simulation --resource 2 --output results/scarcity.json
python3 -m velkatalous.simulation --mortality 0.05 --output results/mortality.json
```

JSON sisältää parametrit, jaksoittaiset mittarit ja tapahtumalokin. Samat parametrit ja siemen tuottavat saman tuloksen. Vahvistettuja sääntöjä ei voi muuttaa kokeellisten parametrien kautta: velka ei mene negatiiviseksi eikä häviä muutoin kuin henkilön kuollessa.

Tämä on stock–flow-identiteetit säilyttävä ABM-prototyyppi, ei vielä täydellinen sektoritaseisiin perustuva, empiirisesti kalibroitu AB-SFC-makromalli. Agenttien tavoitteina ovat kulutus ja valittu toiminnan määrä; positiivista rahavarallisuutta tai nollavelan optimointia ei ole.

## Yksinkertainen 300 vuoden Monte Carlo -koe

[Selkokielinen kuvaus](docs/MONTE_CARLO_300_VUOTTA.md): 100 satunnaista 300 vuoden historiaa, syntymiä, kuolemia ja palvelukauppoja. Erillinen tarkastuskirjanpito täsmäyttää jokaisen henkilön velan ja yhteisön saamisen jokaisen tapahtuman jälkeen.

```bash
python3 -m velkatalous.monte_carlo --runs 100 --years 300 --population 30
```

Tulokset tallentuvat hakemistoon `results/monte_carlo/`. Täsmäytysero nolla tarkoittaa kirjanpidon testin läpäisyä; erääntyneet selvittämättömät sopimukset raportoidaan erikseen.
