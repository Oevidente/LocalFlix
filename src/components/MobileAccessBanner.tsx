import React, { useState, useEffect } from 'react';
import { Smartphone, Wifi, ShieldCheck, Copy, Check, QrCode, ChevronDown, ChevronUp, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { generateQRCodeMatrix } from '../utils/qrcode';

interface NetworkInfo {
  protocol: string;
  port: number;
  addresses: string[];
  mobileUrls: string[];
  certPath?: string;
}

interface MobileAccessBannerProps {
  onCloseBanner?: () => void;
  className?: string;
}

export const MobileAccessBanner: React.FC<MobileAccessBannerProps> = ({ onCloseBanner, className = '' }) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIpIndex, setSelectedIpIndex] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [showQr, setShowQr] = useState<boolean>(false);
  const [showHelpDetails, setShowHelpDetails] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/system/network-info')
      .then((res) => res.json())
      .then((data: NetworkInfo) => {
        setNetworkInfo(data);
      })
      .catch((err) => console.error('Erro ao buscar dados de rede:', err))
      .finally(() => setLoading(false));
  }, []);

  // Compute active mobile URL
  const activeUrl = React.useMemo(() => {
    if (networkInfo && networkInfo.addresses.length > 0) {
      const ip = networkInfo.addresses[selectedIpIndex] || networkInfo.addresses[0];
      return `${networkInfo.protocol || 'https'}://${ip}:${networkInfo.port || 3050}`;
    }
    // Fallback using current hostname
    const host = window.location.hostname || '192.168.1.15';
    const port = networkInfo?.port || 3050;
    const protocol = networkInfo?.protocol || 'https';
    return `${protocol}://${host}:${port}`;
  }, [networkInfo, selectedIpIndex]);

  // Compute QR Matrix
  const qrMatrix = React.useMemo(() => {
    try {
      return generateQRCodeMatrix(activeUrl);
    } catch {
      return null;
    }
  }, [activeUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className={`p-4 rounded-2xl bg-[#181818] border border-neutral-800 text-neutral-400 text-xs animate-pulse ${className}`}>
        Carregando informações de rede local para celular...
      </div>
    );
  }

  return (
    <div id="mobile-access-banner" className={`rounded-2xl bg-[#181818] border border-neutral-800 p-4 sm:p-6 shadow-2xl relative overflow-hidden text-neutral-200 ${className}`}>
      {/* Decorative Glow Background */}
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-[#E50914]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Info Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800/90">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/40 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Acessar no Celular ou Smart TV</span>
            </h2>
            <p className="text-xs text-neutral-400">
              Assista seus vídeos em qualquer celular ou tablet conectado na mesma rede
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 flex items-center gap-1.5 shadow-sm">
            <Wifi className="w-3.5 h-3.5 animate-pulse" />
            <span>Rede Wi-Fi Local</span>
          </span>

          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-950/80 border border-sky-800/80 text-sky-400 flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>HTTPS Ativo</span>
          </span>
        </div>
      </div>

      {/* Main Address Display & Controls */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Left Column: Monospace URL Box & Copy */}
        <div className="lg:col-span-8 space-y-3">
          <div className="text-xs text-neutral-400 font-medium flex items-center justify-between">
            <span>Endereço HTTPS de acesso na sua rede local:</span>
            {networkInfo && networkInfo.addresses.length > 1 && (
              <span className="text-[11px] text-amber-400 font-normal">
                {networkInfo.addresses.length} IPs de rede detectados
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            {/* Address Display Box */}
            <div className="flex-1 bg-black/70 border border-neutral-700/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-inner min-w-0">
              <span className="font-mono text-sm sm:text-base text-emerald-400 font-bold truncate select-all">
                {activeUrl}
              </span>

              {/* IP selector if multiple network cards exist */}
              {networkInfo && networkInfo.addresses.length > 1 && (
                <select
                  value={selectedIpIndex}
                  onChange={(e) => setSelectedIpIndex(Number(e.target.value))}
                  className="bg-neutral-800 text-neutral-300 text-xs rounded border border-neutral-700 px-2 py-1 outline-none cursor-pointer"
                  title="Alternar entre endereços de IP"
                >
                  {networkInfo.addresses.map((ip, idx) => (
                    <option key={ip} value={idx}>
                      IP {idx + 1}: {ip}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Action Buttons: Copy & QR Code */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Link</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className={`flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  showQr
                    ? 'bg-neutral-700 border-neutral-500 text-white'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
                title="Escanear com a câmera do celular"
              >
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">QR Code</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Mini QR Code display if toggled */}
        {showQr && qrMatrix && (
          <div className="lg:col-span-4 flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-2xl border border-neutral-200 animate-in fade-in duration-200">
            <svg
              viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
              className="w-32 h-32 sm:w-36 sm:h-36"
              shapeRendering="crispEdges"
            >
              {qrMatrix.map((row, r) =>
                row.map((cell, c) => (cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#000" /> : null))
              )}
            </svg>
            <span className="text-[11px] font-bold text-neutral-800 mt-1">
              Aponte a câmera do celular
            </span>
          </div>
        )}
      </div>

      {/* Instructions Step-by-Step */}
      <div className="mt-4 pt-4 border-t border-neutral-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
          <div className="font-bold text-white flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px]">
              1
            </span>
            <span>Conecte ao mesmo Wi-Fi</span>
          </div>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            Certifique-se de que o seu celular ou tablet esteja conectado à mesma rede Wi-Fi do computador onde o CineLocal está rodando.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
          <div className="font-bold text-white flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px]">
              2
            </span>
            <span>Abra o Navegador do Celular</span>
          </div>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            Abra o Chrome, Safari, Firefox ou Edge no celular e digite o endereço <strong className="text-emerald-400 font-mono">{activeUrl}</strong>.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
          <div className="font-bold text-white flex items-center space-x-2">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px]">
              3
            </span>
            <span>Aviso de Certificado (HTTPS)</span>
          </div>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            Se aparecer <em>"Sua conexão não é privada"</em>, clique em <strong className="text-amber-300">Avançado</strong> e selecione <strong className="text-amber-300">Ir para o site assim mesmo</strong>.
          </p>
        </div>
      </div>

      {/* Expandable Extra Help & Certificate Instructions */}
      <div className="mt-3 pt-2 flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => setShowHelpDetails(!showHelpDetails)}
          className="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer font-medium transition-colors"
        >
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span>Dúvidas sobre o aviso de certificado ou firewall?</span>
          {showHelpDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {onCloseBanner && (
          <button
            type="button"
            onClick={onCloseBanner}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Ocultar aviso
          </button>
        )}
      </div>

      {showHelpDetails && (
        <div className="mt-3 p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-200/90 text-xs space-y-2 animate-in fade-in duration-150">
          <div className="font-bold text-amber-300 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Por que o navegador avisa sobre o certificado local?</span>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-300">
            O CineLocal gera um certificado HTTPS de segurança próprio para rodar localmente sem dependência de servidores externos.
            Nenhum dado sai do seu computador.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-neutral-300">
            <li>
              <strong>No Chrome / Edge / Safari do celular:</strong> Clique em <em>Avançado</em> &gt; <em>Continuar para {activeUrl}</em>.
            </li>
            <li>
              <strong>Instalar o certificado no celular (opcional):</strong> Copie o arquivo <code className="text-amber-300">cinelocal.crt</code> da pasta <code className="text-amber-300">certs/</code> para o celular e instale em <em>Configurações &gt; Segurança &gt; Instalar certificado CA</em>.
            </li>
            <li>
              <strong>Firewall do Windows:</strong> Se a página não carregar no celular, verifique se o Firewall do Windows permitiu o Node.js nas redes Privada e Pública.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
