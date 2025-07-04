# Permissions Setup for Dockerized Event App

Agar aplikasi berjalan lancar dan tidak error permission saat generate/upload file di Docker, lakukan langkah berikut di host (sebelum build/deploy):

```sh
sudo chown -R $(id -u):$(id -g) ./public/certificates ./public/uploads ./public/tickets
sudo chmod -R 755 ./public/certificates ./public/uploads ./public/tickets
```

- **Jalankan perintah di atas di folder project Anda.**
- Pastikan folder `public/certificates`, `public/uploads`, dan `public/tickets` sudah ada.
- Setelah itu, build dan jalankan Docker seperti biasa:

```sh
docker compose down
docker compose up --build -d
```

Dengan cara ini, permission akan selalu benar dan aplikasi tidak error saat menulis file di dalam container. 