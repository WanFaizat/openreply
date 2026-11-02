# OpenReply di pelayan percuma yang tidak tidur

Panduan ini memindahkan OpenReply daripada Codespace (yang tidur bila tiada aktiviti) ke
satu pelayan yang hidup 24 jam. Pilihan percuma: Oracle Cloud Always Free.

Satu pelayan menjalankan semuanya: web app, worker yang hantar DM, pangkalan data,
Redis, penjadual dan HTTPS. Pangkalan data dan Redis tidak dibuka ke internet.

## Apa yang anda perlu buat

1. Daftar di <https://www.oracle.com/cloud/free/>. Perlu emel, nombor telefon dan kad
   Visa atau Mastercard untuk sahkan identiti. Pilih kawasan **Singapore** (tidak boleh
   ditukar kemudian).
2. Bila akaun sudah aktif, beritahu Claude. Claude cipta pelayan dan jalankan pemasangan.
3. Semasa pemasangan, skrip bertanya beberapa rahsia (Meta App Secret, kunci Resend).
   Taip sendiri. Ia tidak dipaparkan di skrin dan tidak masuk ke GitHub.

## Pelayan yang dicipta

- Imej Ubuntu 24.04, bentuk **VM.Standard.A1.Flex** (Arm) dengan 2 OCPU dan 12 GB RAM.
  Itu dalam had percuma. Kalau Oracle kata "Out of host capacity", cuba lagi atau tukar
  availability domain.
- Alamat IP awam kekal (reserved), supaya alamat tidak berubah bila pelayan dihidupkan semula.
- Dalam Security List (VCN): benarkan masuk TCP port **80** dan **443** dari mana-mana.

Jangan cipta sumber lain di Oracle (volume tambahan, load balancer, IP tambahan) kerana
ada yang berbayar. Untuk elak Oracle mengambil balik pelayan percuma yang terbiar, naik
taraf akaun kepada Pay As You Go. Selagi hanya sumber percuma digunakan, tiada caj.

## Pemasangan

Pada pelayan baharu (melalui Cloud Shell atau SSH):

```bash
curl -fsSL https://raw.githubusercontent.com/WanFaizat/openreply/main/deploy/oracle/setup.sh -o setup.sh
bash setup.sh
```

Pilihan: tampal salinan `.env` dari Codespace ke `~/openreply.env` dahulu. Skrip akan guna
semula kunci Meta, emel dan token webhook yang sama, jadi anda tidak perlu menaipnya semula.

Skrip: memasang Docker, membuka port 80 dan 443, membina aplikasi, menghidupkan semua
perkhidmatan, menetapkan sandaran harian pangkalan data (`~/backups`, simpan 14 hari),
dan mencetak dua alamat untuk dimasukkan dalam Meta.

## Selepas pemasangan

1. Dalam Meta (Use cases, Instagram API): tukar **Callback URL** webhook kepada
   `https://<alamat>/api/webhook` dan **Redirect URL** kepada
   `https://<alamat>/api/instagram/callback`. Token pengesahan webhook mesti sama dengan
   `WEBHOOK_VERIFY_TOKEN` dalam `.env` pelayan.
2. Log masuk ke dashboard dengan emel yang dibenarkan, sambung Instagram, dan cipta semula
   kempen NAK.
3. Uji dengan akaun kawan: komen NAK, DM NAK, balas Story.
4. Matikan OpenReply di Codespace supaya tidak ada dua pelayan menerima webhook yang sama.

## Penyelenggaraan

```bash
cd ~/openreply/deploy/oracle
sudo docker compose ps                    # semua perkhidmatan mesti "Up" atau "healthy"
sudo docker compose logs --tail 50 worker # log penghantar DM
bash update.sh                            # kod terbaru dan hidupkan semula
```

Semua perkhidmatan ada `restart: unless-stopped`, jadi ia hidup semula sendiri selepas
pelayan restart.

## Pulihkan sandaran

```bash
gunzip -c ~/backups/openreply-TARIKH.sql.gz | sudo docker compose exec -T postgres psql -U openreply openreply
```
