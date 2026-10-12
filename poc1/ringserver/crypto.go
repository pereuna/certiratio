package main

// Identiteetti kuten web/src/identity.js: ECDSA P-256, julkinen avain raw
// (65 tavua) base64url:nä, allekirjoitus r‖s (64 tavua, WebCryptomuoto), ja
// allekirjoitettava sisältö on JSON-taulukko täsmälleen kuten JSON.stringify.

import (
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"unicode/utf8"
)

var b64 = base64.RawURLEncoding

// jsString koodaa merkkijonon kuten JavaScriptin JSON.stringify: vain ",
// \ ja ohjausmerkit escapoidaan (Go:n encoding/json escapoisi lisäksi
// esimerkiksi <, >, & sekä U+2028 ja U+2029).
func jsString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

// canon: allekirjoitettava sisältö, merkkijonotaulukko JSON-muodossa.
func canon(parts ...string) []byte {
	q := make([]string, len(parts))
	for i, p := range parts {
		q[i] = jsString(p)
	}
	return []byte("[" + strings.Join(q, ",") + "]")
}

func hex8(text string) string {
	h := sha256.Sum256([]byte(text))
	return hex.EncodeToString(h[:4])
}

func idOf(key string) string           { return hex8(key) }
func ringIdOf(key, salt string) string { return hex8(key + "." + salt) }
func authPayload(nonce, signer, verifier string) []byte {
	return canon("auth", nonce, signer, verifier)
}

// verify: allekirjoitus (r‖s, base64url) julkisella avaimella (raw, base64url).
func verify(key string, payload []byte, sig string) bool {
	raw, err := b64.DecodeString(key)
	if err != nil {
		return false
	}
	if _, err := ecdh.P256().NewPublicKey(raw); err != nil { // tarkistaa, että piste on käyrällä
		return false
	}
	x, y := elliptic.Unmarshal(elliptic.P256(), raw) //nolint:staticcheck // raw-muoto WebCryptosta
	if x == nil {
		return false
	}
	s, err := b64.DecodeString(sig)
	if err != nil || len(s) != 64 {
		return false
	}
	h := sha256.Sum256(payload)
	return ecdsa.Verify(&ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, h[:],
		new(big.Int).SetBytes(s[:32]), new(big.Int).SetBytes(s[32:]))
}

type identity struct {
	priv *ecdsa.PrivateKey
	key  string // julkinen avain raw, base64url
	id   string
}

func (me *identity) sign(payload []byte) (string, error) {
	h := sha256.Sum256(payload)
	r, s, err := ecdsa.Sign(rand.Reader, me.priv, h[:])
	if err != nil {
		return "", err
	}
	out := make([]byte, 64)
	r.FillBytes(out[:32])
	s.FillBytes(out[32:])
	return b64.EncodeToString(out), nil
}

func newIdentity(priv *ecdsa.PrivateKey) (*identity, error) {
	pub, err := priv.PublicKey.ECDH()
	if err != nil {
		return nil, err
	}
	key := b64.EncodeToString(pub.Bytes())
	return &identity{priv: priv, key: key, id: idOf(key)}, nil
}

// loadIdentity: palvelimen pysyvä avainpari (PKCS#8 PEM).
func loadIdentity(path string) (*identity, error) {
	if b, err := os.ReadFile(path); err == nil {
		blk, _ := pem.Decode(b)
		if blk == nil {
			return nil, errors.New("avaintiedosto rikki")
		}
		k, err := x509.ParsePKCS8PrivateKey(blk.Bytes)
		if err != nil {
			return nil, err
		}
		priv, ok := k.(*ecdsa.PrivateKey)
		if !ok {
			return nil, errors.New("avain ei ole ECDSA")
		}
		return newIdentity(priv)
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0o600); err != nil {
		return nil, err
	}
	return newIdentity(priv)
}

// utf16Len: JavaScriptin merkkijonon pituus (UTF-16-yksiköt).
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// jsSpace: merkit, jotka JavaScriptin String.prototype.trim poistaa.
func jsSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

// cleanNameOK: onko nimi sama kuin ring.js:n cleanName(nimi) ja ei tyhjä.
func cleanNameOK(s string) bool {
	if s == "" || !utf8.ValidString(s) || utf16Len(s) > maxName {
		return false
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	first, _ := utf8.DecodeRuneInString(s)
	last, _ := utf8.DecodeLastRuneInString(s)
	return !jsSpace(first) && !jsSpace(last)
}
