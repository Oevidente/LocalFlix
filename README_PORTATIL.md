# 🍿 CineLocal - Biblioteca de Mídia Offline (Portátil)

Aplicativo estilo Netflix 100% offline, sem conta, sem login e sem nuvem. Todos os seus dados ficam salvos no arquivo `data/library.json`.

---

## 📁 Estrutura Portátil (Pendrive ou HD Externo)

Você pode copiar a pasta inteira do aplicativo para qualquer pendrive ou HD externo:

```text
CineLocal/
│
├── start.bat             # Clique duplo no Windows para abrir e rodar
├── start.sh              # No Linux / macOS
│
├── bin/                  # Coloque aqui os executáveis portáteis (opcional se já tiver no sistema)
│   ├── ffmpeg.exe        # ffmpeg portátil para Windows
│   ├── ffprobe.exe       # ffprobe portátil para Windows
│   └── node.exe          # Opcional: node.exe portátil
│
├── data/
│   └── library.json      # TODOS os dados (progresso, séries, faixas, etc.)
│
├── dist/                 # Frontend compilado + server.cjs
├── package.json
└── server.ts
```

---

## 🚀 Como Usar no Windows
1. Conecte o pendrive no PC (ou abra a pasta do CineLocal).
2. Dê um duplo clique no arquivo `start.bat`.
3. O terminal iniciará o servidor local e seu navegador abrirá automaticamente em `http://localhost:3050`.

> **Dica de Porta**: Se quiser usar outra porta, basta editar a linha `set PORT=3050` dentro do `start.bat`.

---

## 🔄 Mudou a Letra do Drive? (Ex: `E:\` para `F:\`)
Se você plugar o pendrive em outro computador e a letra do drive mudar:
1. Abra o CineLocal no navegador.
2. Clique na série ou filme.
3. Clique em **"Relocalizar Pasta"**.
4. Selecione ou digite o novo caminho da pasta. Todo o seu histórico e segundos assistidos serão mantidos intactos!

---

## 🎥 Formatos Suportados
- **MP4 / WebM**: Toca direto pelo navegador com alta performance e seek instantâneo.
- **MKV / AVI / Áudio AC3/DTS**: Remuxado e transcodificado automaticamente pelo `ffmpeg` em tempo real.
- **Legendas**: Suporta legendas embutidas no MKV/MP4 e arquivos externos (`.srt`, `.vtt`, `.ass`).

## 📺 Transmitir para Chromecast

- Abra o CineLocal no Google Chrome e deixe o computador e o Chromecast na mesma rede Wi-Fi/LAN.
- Inicie um vídeo e clique no ícone de transmissão no canto inferior direito do player.
- Para o Chromecast acessar os vídeos, permita o Node.js/CineLocal na rede **Privada** do Firewall do Windows.
- O Chromecast recebe o fluxo diretamente do computador; não é necessário enviar os arquivos para a nuvem.
- O `start.bat` cria o certificado HTTPS local e abre o site em `https://localhost:3050`.
- Para acessar pelo Android, abra `https://IP_DO_PC:3050` e instale manualmente `certs/cinelocal.crt` como certificado CA no celular. O Chrome no iPhone/iPad não oferece transmissão web para Chromecast.
- O Chromecast usa uma porta HTTP auxiliar para receber os segmentos HLS; MKV é convertido pelo FFmpeg para H.264/AAC em HLS MPEG-TS antes da transmissão.
