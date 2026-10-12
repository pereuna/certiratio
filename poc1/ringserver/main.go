// Rengaspalvelin, prototyyppi (docs/KOHTAAMISPUHELIN.md): WebRTC-vertainen,
// johon selain ottaa yhteyden pelkällä kortilla (IPv6-osoitteet, UDP-portti,
// DTLS-sormenjälki), ilman signalointia, DNS-nimeä tai varmentajaa.
//
// Palvelin on ICE-lite yhdessä kiinteässä UDP-portissa. Selain kokoaa
// palvelimen vastauksen itse (web/src/servercard.js): ICE-tunnus on selaimen
// oma tunnus U ja salasana pwdOf(U). Kun palvelin näkee STUN-tarkistuksen
// tuntemattomalla tunnuksella, se luo tälle asiakkaalle uuden yhteyden samaan
// porttiin. Selain tarkistaa palvelimen sormenjäljen kortista; palvelin
// hyväksyy minkä tahansa asiakasvarmenteen (jäsenet todennetaan myöhemmin
// sovellustasolla, hello/auth). Prototyypissä DataChannel vain kaiuttaa.
//
//	ringserver [-port 40123] [-dir tila] [-addr osoite,…] [-page URL]
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/pion/ice/v4"
	"github.com/pion/stun/v3"
	"github.com/pion/webrtc/v4"
)

const (
	maxConns       = 64
	connectTimeout = 20 * time.Second
	quarantine     = 30 * time.Second // suljetun yhteyden tunnus ei avaa heti uutta (uudelleenlähetetyt tarkistukset)
)

var ufragRe = regexp.MustCompile(`^[A-Za-z0-9+/]{4,32}$`)

// pwdOf: palvelimen ICE-salasana johdetaan selaimen tunnuksesta (vähintään 22 merkkiä).
// Salasana ei ole turvamekanismi; palvelimen tunnistaa DTLS-sormenjälki.
func pwdOf(ufrag string) string {
	p := "certiratio-" + ufrag
	for len(p) < 24 {
		p += "-"
	}
	return p
}

// fakeOffer: selaimen tarjous palvelimen näkökulmasta. Selaimen oikeita
// tunnuksia ja sormenjälkeä ei tunneta, eikä niitä tarvita (ICE-lite, DTLS-
// palvelin ilman sormenjäljen tarkistusta).
func fakeOffer(ufrag string) string {
	zero := strings.Repeat("00:", 31) + "00"
	return strings.Join([]string{
		"v=0",
		"o=- 1 1 IN IP6 ::1",
		"s=-",
		"t=0 0",
		"a=group:BUNDLE 0",
		"m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
		"c=IN IP6 ::",
		"a=mid:0",
		"a=ice-ufrag:" + ufrag,
		"a=ice-pwd:" + pwdOf(ufrag),
		"a=fingerprint:sha-256 " + zero,
		"a=setup:actpass",
		"a=sctp-port:5000",
		"a=max-message-size:262144",
		"",
	}, "\r\n")
}

// sniffConn näkee paketit ennen multiplekseriä: uusi tunnus → uusi yhteys.
type sniffConn struct {
	net.PacketConn
	onUfrag func(ufrag string, from net.Addr)
}

func (s *sniffConn) ReadFrom(p []byte) (int, net.Addr, error) {
	n, from, err := s.PacketConn.ReadFrom(p)
	if err == nil && stun.IsMessage(p[:n]) {
		m := &stun.Message{Raw: append([]byte(nil), p[:n]...)}
		if m.Decode() == nil && m.Type == stun.BindingRequest {
			if u, e := m.Get(stun.AttrUsername); e == nil {
				s.onUfrag(strings.SplitN(string(u), ":", 2)[0], from)
			}
		}
	}
	return n, from, err
}

type server struct {
	mu    sync.Mutex
	conns map[string]*webrtc.PeerConnection
	ended map[string]time.Time
	mux   ice.UDPMux
	cert  webrtc.Certificate
}

func (s *server) onUfrag(ufrag string, from net.Addr) {
	if !ufragRe.MatchString(ufrag) {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.conns[ufrag]; ok || len(s.conns) >= maxConns || time.Since(s.ended[ufrag]) < quarantine {
		return
	}
	pc, err := s.newConn(ufrag, from)
	if err != nil {
		log.Printf("%s: %v", from, err)
		return
	}
	s.conns[ufrag] = pc
}

func (s *server) forget(ufrag string, pc *webrtc.PeerConnection) {
	s.mu.Lock()
	if s.conns[ufrag] == pc {
		delete(s.conns, ufrag)
		s.ended[ufrag] = time.Now()
		for u, t := range s.ended {
			if time.Since(t) > quarantine {
				delete(s.ended, u)
			}
		}
	}
	n := len(s.conns)
	s.mu.Unlock()
	pc.Close()
	log.Printf("yhteyksiä %d", n)
}

func (s *server) newConn(ufrag string, from net.Addr) (*webrtc.PeerConnection, error) {
	se := webrtc.SettingEngine{}
	se.SetLite(true)
	se.SetICECredentials(ufrag, pwdOf(ufrag))
	se.SetICEUDPMux(s.mux)
	se.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP6})
	se.DisableCertificateFingerprintVerification(true)
	if err := se.SetAnsweringDTLSRole(webrtc.DTLSRoleServer); err != nil {
		return nil, err
	}
	api := webrtc.NewAPI(webrtc.WithSettingEngine(se))
	pc, err := api.NewPeerConnection(webrtc.Configuration{Certificates: []webrtc.Certificate{s.cert}})
	if err != nil {
		return nil, err
	}
	who := from.String()
	log.Printf("%s: uusi asiakas (%s)", who, ufrag)
	timer := time.AfterFunc(connectTimeout, func() {
		if pc.ConnectionState() != webrtc.PeerConnectionStateConnected {
			log.Printf("%s: ei yhteyttä %s:ssa", who, connectTimeout)
			s.forget(ufrag, pc)
		}
	})
	pc.OnConnectionStateChange(func(st webrtc.PeerConnectionState) {
		log.Printf("%s: %s", who, st)
		switch st {
		case webrtc.PeerConnectionStateConnected:
			timer.Stop()
		case webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed, webrtc.PeerConnectionStateDisconnected:
			go s.forget(ufrag, pc)
		}
	})
	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		dc.OnOpen(func() { log.Printf("%s: kanava %q auki", who, dc.Label()) })
		dc.OnMessage(func(m webrtc.DataChannelMessage) {
			if !m.IsString || len(m.Data) > 4096 {
				return
			}
			reply, _ := json.Marshal(map[string]any{"type": "pong", "text": string(m.Data), "from": who, "time": time.Now().UnixMilli()})
			dc.SendText(string(reply))
		})
	})
	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: fakeOffer(ufrag)}); err != nil {
		pc.Close()
		return nil, err
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return nil, err
	}
	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return nil, err
	}
	return pc, nil
}

// loadCert: pysyvä DTLS-varmenne (sormenjälki pysyy kortissa samana).
func loadCert(dir string) (webrtc.Certificate, error) {
	path := filepath.Join(dir, "dtls.pem")
	if b, err := os.ReadFile(path); err == nil {
		c, err := webrtc.CertificateFromPEM(string(b))
		if err != nil {
			return webrtc.Certificate{}, err
		}
		return *c, nil
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return webrtc.Certificate{}, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 64))
	if err != nil {
		return webrtc.Certificate{}, err
	}
	c, err := webrtc.NewCertificate(key, x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "certiratio-ringserver"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(10, 0, 0), // sormenjälki on kortissa: varmenne ei saa vanhentua
	})
	if err != nil {
		return webrtc.Certificate{}, err
	}
	pem, err := c.PEM()
	if err != nil {
		return webrtc.Certificate{}, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return webrtc.Certificate{}, err
	}
	return *c, os.WriteFile(path, []byte(pem), 0o600)
}

func fingerprint(c webrtc.Certificate) ([]byte, error) {
	fps, err := c.GetFingerprints()
	if err != nil {
		return nil, err
	}
	for _, f := range fps {
		if f.Algorithm == "sha-256" {
			return hex.DecodeString(strings.ReplaceAll(f.Value, ":", ""))
		}
	}
	return nil, fmt.Errorf("ei sha-256-sormenjälkeä")
}

// usable: kortille kelpaa julkinen IPv6 (2000::/3) tai ULA (fc00::/7).
func usable(ip net.IP) bool {
	if ip.To4() != nil || ip.To16() == nil {
		return false
	}
	return ip[0]&0xe0 == 0x20 || ip[0]&0xfe == 0xfc
}

// addresses: liitäntöjen osoitteet; Androidilla liitäntälista voi olla estetty,
// joten lisäksi se osoite, jota ydin käyttäisi lähtevään liikenteeseen (ei lähetä mitään).
func addresses(extra string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(ip net.IP) {
		if usable(ip) && !seen[ip.String()] {
			seen[ip.String()] = true
			out = append(out, ip.String())
		}
	}
	for _, a := range strings.Split(extra, ",") {
		add(net.ParseIP(strings.TrimSpace(a)))
	}
	if as, err := net.InterfaceAddrs(); err == nil {
		for _, a := range as {
			if n, ok := a.(*net.IPNet); ok {
				add(n.IP)
			}
		}
	}
	if c, err := net.Dial("udp6", "[2001:4860:4860::8888]:53"); err == nil {
		add(c.LocalAddr().(*net.UDPAddr).IP)
		c.Close()
	}
	return out
}

func main() {
	port := flag.Int("port", 40123, "UDP-portti")
	dir := flag.String("dir", "ringserver-tila", "pysyvän tilan hakemisto (DTLS-varmenne)")
	extra := flag.String("addr", "", "kortin lisäosoitteet pilkuin eroteltuna")
	page := flag.String("page", "https://pereuna.github.io/certiratio/palvelin.html", "testisivu kortin linkkiin")
	flag.Parse()
	log.SetFlags(log.Ltime)

	cert, err := loadCert(*dir)
	if err != nil {
		log.Fatal(err)
	}
	fp, err := fingerprint(cert)
	if err != nil {
		log.Fatal(err)
	}
	conn, err := net.ListenUDP("udp6", &net.UDPAddr{IP: net.IPv6unspecified, Port: *port})
	if err != nil {
		log.Fatal(err)
	}
	s := &server{conns: map[string]*webrtc.PeerConnection{}, ended: map[string]time.Time{}, cert: cert}
	s.mux = ice.NewUDPMuxDefault(ice.UDPMuxParams{UDPConn: &sniffConn{PacketConn: conn, onUfrag: s.onUfrag}})

	addrs := addresses(*extra)
	if len(addrs) == 0 {
		log.Print("varoitus: ei IPv6-osoitetta kortille (anna -addr)")
	}
	card := fmt.Sprintf("s1.%s.%d.%s", base64.RawURLEncoding.EncodeToString(fp), *port, strings.Join(addrs, ","))
	log.Printf("kuunnellaan UDP [::]:%d", *port)
	fmt.Printf("kortti: %s\n%s#%s\n", card, *page, card)
	select {}
}
