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
