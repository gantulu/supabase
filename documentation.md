# Dokumentasi Integrasi Duitku POP

> **Sumber resmi:** [Duitku POP API Reference (Bahasa Indonesia)](https://docs.duitku.com/pop/id/)  
> **Jenis dokumen:** referensi teknis integrasi backend dan browser  
> **Pembaruan sumber yang terlihat:** September 2026  
> **Catatan:** dokumentasi ini merangkum kontrak yang dipublikasikan pada halaman resmi. Untuk implementasi produksi, periksa kembali halaman sumber karena parameter dan payment channel dapat berubah.

## 1. Gambaran umum

Duitku POP menyediakan alur pembayaran yang memungkinkan pelanggan memilih dan menyelesaikan pembayaran melalui antarmuka Duitku. Secara umum:

1. Pelanggan melakukan checkout di aplikasi merchant.
2. Backend merchant meminta invoice ke API Duitku.
3. Duitku mengembalikan referensi transaksi (`reference`) dan URL pembayaran (`paymentUrl`).
4. Merchant menampilkan POP atau mengarahkan pelanggan ke `paymentUrl`.
5. Pelanggan menyelesaikan pembayaran.
6. Duitku mengirim HTTP callback ke backend merchant untuk memberitahukan status transaksi.

**Prinsip penting:** hasil JavaScript callback di browser hanya untuk pengalaman pengguna/notifikasi. Jangan menggunakannya sebagai sumber kebenaran status pembayaran. Gunakan HTTP callback backend yang diverifikasi.

## 2. Kredensial dan lingkungan

Siapkan dari Merchant Portal Duitku:
- **Merchant Code**: identitas proyek merchant.
- **API Key / Merchant Key**: kunci untuk membuat dan memverifikasi signature.

Simpan API key hanya pada backend/secret manager. Jangan menaruhnya di frontend, repository, log, atau dokumentasi konfigurasi yang dipublikasikan.

### Endpoint Create Invoice

| Lingkungan | Endpoint |
|---|---|
| Sandbox | `https://api-sandbox.duitku.com/api/merchant/createInvoice` |
| Production | `https://api-prod.duitku.com/api/merchant/createInvoice` |

Method: `POST`  
Content-Type: `application/json`

Gunakan Sandbox untuk pengembangan dan pengujian. Beralih ke Production hanya setelah kredensial, callback, validasi, dan pengujian resmi selesai.

## 3. Signature untuk Create Invoice

Header yang diwajibkan:

| Header | Keterangan |
|---|---|
| `Content-Type` | `application/json` |
| `x-duitku-timestamp` | Unix timestamp dalam milidetik |
| `x-duitku-signature` | HMAC-SHA256 dalam format hex |
| `x-duitku-merchantcode` | Merchant Code |

Formula yang didokumentasikan:

```text
stringToSign = merchantCode + timestamp
signature = HMAC_SHA256(stringToSign, apiKey)
```

Gunakan API key sebagai secret HMAC, bukan sebagai bagian dari `stringToSign`. Pastikan timestamp yang ditandatangani sama persis dengan nilai header yang dikirim. Dokumentasi menyatakan metode signature lama sudah usang; jangan gunakan signature MD5 atau SHA256 tanpa HMAC.

## 4. Request Create Invoice

Parameter utama yang didokumentasikan:

| Parameter | Tipe / batas | Wajib | Keterangan |
|---|---|---:|---|
| `paymentAmount` | integer | Ya | Nominal pembayaran |
| `merchantOrderId` | string, maks. 50 karakter | Ya | ID order unik dari merchant |
| `productDetails` | string, maks. 255 karakter | Ya | Deskripsi produk/transaksi |
| `email` | string, maks. 255 karakter | Ya | Email pelanggan |
| `callbackUrl` | string, maks. 255 karakter | Ya | URL HTTP callback backend |
| `returnUrl` | string | Sesuai kontrak request | URL tujuan setelah pelanggan kembali |
| `additionalParam` | string, maks. 255 karakter | Tidak | Parameter tambahan; URL-encode jika digunakan |
| `merchantUserInfo` | string, maks. 255 karakter | Tidak | Informasi pengguna merchant |
| `customerVaName` | string, maks. 20 karakter | Tidak | Nama pada konfirmasi VA |
| `phoneNumber` | string, maks. 50 karakter | Tidak | Nomor telepon pelanggan |
| `paymentMethod` | string | Tidak | Kode channel pembayaran; cek daftar resmi |
| `itemDetails` | array objek | Tidak | Detail item |
| `customerDetail` | objek | Tidak | Informasi pelanggan dan alamat |
| `creditCardDetail` | objek | Sesuai fitur | Detail tokenisasi kartu |
| `expiryPeriod` | integer | Tidak | Masa berlaku invoice dalam menit pada contoh resmi |

Objek `itemDetails` menggunakan `name`, `quantity`, dan `price`. Dokumentasi mensyaratkan `paymentAmount` setara dengan total nominal item yang dikirim. Backend merchant harus menghitung total dari data katalog tepercaya, bukan mempercayai harga/total dari browser.

Untuk transaksi tokenisasi kartu, dokumentasi menyebut `email`, `customerDetail.email`, `customerDetail.merchantCustomerId`, dan `creditCardDetail.saveCardToken` menjadi wajib. Aktifkan hanya jika akun merchant mendukung fitur tersebut.

Contoh struktur request minimal (nilai hanya contoh, bukan kredensial nyata):

```json
{
  "paymentAmount": 40000,
  "merchantOrderId": "ORDER-UNIK-001",
  "productDetails": "Pembayaran pesanan",
  "email": "pelanggan@example.com",
  "phoneNumber": "08123456789",
  "callbackUrl": "https://merchant.example/api/duitku/callback",
  "returnUrl": "https://merchant.example/payment/return",
  "itemDetails": [
    { "name": "Produk contoh", "quantity": 1, "price": 40000 }
  ],
  "expiryPeriod": 10
}
```

Lengkapi struktur sesuai kebutuhan integrasi dan skema resmi terkini. Contoh ini bukan pengganti validasi parameter untuk channel yang dipilih.

## 5. Respons Create Invoice

Respons sukses pada dokumentasi memiliki bentuk umum:

```json
{
  "merchantCode": "DXXXX",
  "reference": "REFERENSI_DUITKU",
  "paymentUrl": "https://app-sandbox.duitku.com/redirect_checkout?reference=REFERENSI_DUITKU",
  "statusCode": "00",
  "statusMessage": "SUCCESS"
}
```

Simpan `reference` dan kaitkan dengan order internal. Gunakan `paymentUrl` untuk redirect bila memilih window redirection. Jangan menganggap invoice berhasil dibuat hanya berdasarkan respons yang tidak tervalidasi.

Dokumentasi menyatakan respons dapat sama selama lima menit untuk request dengan order ID yang sama. Request berulang dengan ID sama ketika request sebelumnya masih diproses dapat menghasilkan `409 The transaction is still in progress`; nominal berbeda pada ID sama dapat menghasilkan konflik nominal. Karena itu:
- Gunakan `merchantOrderId` yang unik untuk setiap order baru.
- Terapkan idempotensi di backend.
- Jangan membuat order atau invoice duplikat akibat retry browser.
- Jangan mengganti nominal order yang sama sambil request invoice masih berjalan.

## 6. HTTP Callback

Duitku mengirim callback server-ke-server menggunakan:
- Method: `POST`
- Content-Type: `application/x-www-form-urlencoded`
- URL publik melalui HTTPS direkomendasikan
- Callback yang berhasil diproses harus membalas HTTP `200 OK`

Duitku dapat mengirim ulang callback jika tidak menerima HTTP 200; dokumentasi menyebut hingga lima percobaan, lalu notifikasi kegagalan melalui email. Fitur resend tersedia pada dashboard merchant.

### Parameter callback penting

| Parameter | Keterangan |
|---|---|
| `merchantCode` | Merchant Code |
| `amount` | Nominal transaksi |
| `merchantOrderId` | ID order merchant |
| `productDetail` | Detail produk |
| `additionalParam` | Parameter tambahan, jika ada |
| `paymentCode` | Kode metode pembayaran |
| `resultCode` | `00` sukses; `01` gagal pada tabel dokumentasi |
| `merchantUserId` | User ID merchant |
| `reference` | Referensi Duitku |
| `signature` | Signature callback |
| `publisherOrderId` | ID pembayaran unik dari Duitku |
| `settlementDate` | Tanggal estimasi settlement, format `YYYY-MM-DD` |
| `issuerCode` | Kode issuer QRIS jika berlaku |
| `customerName` | Informasi akun issuer untuk channel QRIS tertentu |
| `transactionState` | Status proses transaksi jika berlaku |
| `transactionStateStatus` | `Success` atau `Failed` untuk status state yang terkait |
| `merchantCustomerId` | ID pelanggan merchant untuk fitur terkait |
| `tokenId` | Token kartu, bila fitur tokenisasi digunakan |

Parameter tambahan bergantung pada channel pembayaran. Jangan mengasumsikan semua parameter hadir di setiap callback.

### Signature callback

Formula yang didokumentasikan:

```text
stringToSign = merchantCode + amount + merchantOrderId
signature = HMAC_SHA256(stringToSign, merchantKey)
```

Backend harus:
1. Memastikan parameter wajib tersedia.
2. Memastikan `merchantCode` sesuai konfigurasi merchant.
3. Menghitung ulang HMAC-SHA256 dengan API key yang tersimpan aman.
4. Membandingkan signature secara aman.
5. Mencocokkan `merchantOrderId`, `reference`, dan `amount` dengan order/invoice yang tersimpan.
6. Memproses callback secara atomik dan idempoten.
7. Mengembalikan HTTP 200 hanya setelah callback diterima dan ditangani dengan aman; untuk kegagalan internal, desain respons/retry harus mencegah kehilangan notifikasi.

Jangan mempercayai callback hanya karena endpoint menerima request. Jangan mengubah status order sebelum signature, identitas order, nominal, dan relasi referensi tervalidasi.

**Kebijakan status:** `resultCode=00` didokumentasikan sebagai sukses dan `01` sebagai gagal, tetapi implementasi harus mempertimbangkan seluruh kontrak channel dan kemungkinan status yang belum dapat dipastikan. Jangan menandai transaksi gagal jika kode/status yang diterima tidak dipahami; simpan sebagai pending/perlu pemeriksaan sampai dapat diverifikasi.

### Jaringan callback

Dokumentasi mencantumkan IP outgoing untuk allowlist:

- **Production:** `182.23.85.14`, `103.177.101.190`, `182.23.85.8`, `182.23.85.9`, `182.23.85.10`, `182.23.85.13`, `103.177.101.184`, `103.177.101.185`, `103.177.101.186`, `103.177.101.189`
- **Sandbox:** `182.23.85.11`, `182.23.85.12`, `103.177.101.187`, `103.177.101.188`

Persyaratan yang disebutkan: port 80 atau 443, URL dapat diakses publik, dan callback merespons HTTP 200. Verifikasi ulang daftar IP di sumber resmi sebelum mengatur firewall.

## 7. JavaScript POP callback dan redirect

Duitku JS dapat menyediakan event seperti:
- `successEvent`: pembayaran sukses (`00`)
- `pendingEvent`: pending (`01`)
- `errorEvent`: pembayaran error
- `closeEvent`: pelanggan menutup popup tanpa menyelesaikan pembayaran (`02`)

Respon JS callback umumnya berisi `resultCode`, `merchantOrderId`, dan `reference`. Sesuai dokumentasi, gunakan hasil ini hanya untuk notifikasi UI. **Jangan memperbarui status pembayaran di backend berdasarkan JavaScript callback atau redirect browser.**

Alternatifnya, gunakan `paymentUrl` dari Create Invoice untuk window redirection. Bahasa dapat ditentukan dengan parameter `lang=id` atau `lang=en` jika didukung oleh URL yang dikembalikan.

## 8. Error HTTP yang didokumentasikan

| HTTP / pesan | Makna pada dokumentasi | Penanganan yang disarankan |
|---|---|---|
| `400 Bad Request` | Request tidak valid | Periksa payload dan validasi parameter |
| `400 Amount is different please try again later` | ID order sama diminta dengan nominal berbeda pada rentang pemrosesan yang sama | Jangan retry dengan nominal berbeda; periksa order |
| `401 Unauthorized` | Akses ditolak | Periksa merchant code, timestamp, signature, API key, dan lingkungan |
| `404 Not Found` | Endpoint tidak ditemukan | Periksa URL dan lingkungan |
| `409 The transaction is still in progress` | Request dengan order ID yang sama masih diproses | Hindari request paralel; cek status internal sebelum retry |
| `500 Internal Server Error` | Kesalahan pemrosesan di Duitku | Catat correlation/order ID tanpa secret dan lakukan retry terkontrol |

Tangani error berdasarkan HTTP status, response body, dan kondisi order internal. Jangan mencatat API key, signature sensitif, atau data kartu dalam log.

## 9. Rekomendasi arsitektur backend

Untuk integrasi dengan Supabase:
- Simpan kredensial Duitku pada secrets/environment Edge Function, bukan di frontend atau file repository.
- Buat invoice hanya dari backend setelah membaca harga dan ketersediaan dari database.
- Simpan order internal, nominal, `merchantOrderId`, `reference`, `paymentUrl`, dan status yang diperlukan.
- Lindungi pembuatan invoice dengan idempotency key dan constraint unik.
- Verifikasi callback HMAC dan nominal sebelum perubahan status.
- Terapkan perubahan status/stock secara atomik dan idempoten di database.
- Jadikan callback server-to-server sumber kebenaran pembayaran.
- Pada halaman return, polling status backend boleh digunakan untuk memperbarui UI; status pending tidak boleh dianggap gagal hanya karena callback belum tiba.
- Jangan pernah mengirim service-role key atau Duitku API key ke client.
- Uji signature valid/tidak valid, callback duplikat, nominal mismatch, order tidak dikenal, callback terlambat, dan retry.

Dokumen ini tidak menetapkan skema database atau state machine lengkap aplikasi; keduanya perlu diselaraskan dengan repository dan seluruh kontrak resmi yang relevan.

## 10. Checklist sebelum rilis

- [ ] Sandbox merchant code dan API key tersimpan sebagai secret.
- [ ] Endpoint sandbox/production dipilih melalui konfigurasi backend yang eksplisit.
- [ ] Signature Create Invoice menggunakan HMAC-SHA256 sesuai formula.
- [ ] `merchantOrderId` unik dan retry terkontrol.
- [ ] `paymentAmount` sesuai jumlah item dari database.
- [ ] Callback publik menggunakan HTTPS dan menerima form-urlencoded.
- [ ] Signature, merchant code, order ID, reference, dan amount callback diverifikasi.
- [ ] Callback duplikat aman diproses berulang (idempoten).
- [ ] JavaScript callback/redirect tidak mengubah status pembayaran.
- [ ] HTTP 200 callback hanya diberikan setelah penanganan aman.
- [ ] Tidak ada secret atau data kartu sensitif di repository/log.
- [ ] Pengujian Sandbox mencakup sukses, gagal, pending, duplikat, dan mismatch.
- [ ] Kontrak/status yang ambigu dikonfirmasi dengan dukungan resmi Duitku sebelum state machine dikunci.

## 11. Referensi resmi

- [Duitku POP – Bahasa Indonesia](https://docs.duitku.com/pop/id/)
- [Duitku API – Bahasa Indonesia](https://docs.duitku.com/api/id/)
- [Duitku POP – English](https://docs.duitku.com/pop/en/)

Jika halaman resmi berubah, dokumentasi resmi Duitku adalah acuan utama untuk parameter, signature, endpoint, payment channel, dan perilaku callback.
