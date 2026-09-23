import React, { useState, useEffect } from 'react';
import { Smartphone, Wifi, ShieldCheck, Copy, Check, QrCode, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';
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
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
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
      <div className={`p-2.5 rounded-xl bg-[#181818] border border-neutral-800 text-neutral-400 text-xs animate-pulse ${className}`}>
        Carregando endereço de rede local...
      </div>
    );
  }

  return (
    <div
      id="mobile-access-banner"
      className={`rounded-xl bg-[#181818] border border-neutral-800 p-3 sm:p-3.5 shadow-xl relative overflow-hidden text-neutral-200 transition-all ${className}`}
    >
      {/* Sleek Compact Main Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* Left: Icon, Label, and IP Monospace Box */}
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm">
            <Smartphone className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-white shrink-0">
              Acesso no Celular:
            </span>

            {/* Address Box */}
            <div className="bg-black/80 border border-neutral-700/90 rounded-lg px-2.5 py-1 flex items-center gap-2 max-w-full">
              <span className="font-mono text-xs sm:text-sm text-emerald-400 font-bold truncate select-all">
                {activeUrl}
              </span>

              {/* Multiple IP selector */}
              {networkInfo && networkInfo.addresses.length > 1 && (
                <select
                  value={selectedIpIndex}
                  onChange={(e) => setSelectedIpIndex(Number(e.target.value))}
                  className="bg-neutral-800 text-neutral-300 text-[10px] rounded border border-neutral-700 px-1.5 py-0.5 outline-none cursor-pointer shrink-0"
                  title="Múltiplas placas de rede detectadas"
                >
                  {networkInfo.addresses.map((ip, idx) => (
                    <option key={ip} value={idx}>
                      IP {idx + 1}: {ip}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full font-mono">
              <Wifi className="w-3 h-3 animate-pulse" /> Same Wi-Fi
            </span>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow active:scale-95 cursor-pointer"
            title="Copiar link para a área de transferência"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </>
            )}
          </button>

          {/* QR Code Toggle */}
          <button
            type="button"
            onClick={() => setShowQr(!showQr)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
              showQr
                ? 'bg-neutral-700 border-neutral-500 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
            title="Exibir QR Code para a câmera do celular"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          {/* Expand Instructions Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Ver instruções passo a passo"
          >
            <span>Instruções</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {onCloseBanner && (
            <button
              type="button"
              onClick={onCloseBanner}
              className="text-neutral-500 hover:text-neutral-300 p-1 text-xs"
              title="Ocultar aviso"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* QR Code Popup / Drawer */}
      {showQr && qrMatrix && (
        <div className="mt-3 pt-3 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-center gap-3 bg-white/5 p-3 rounded-xl animate-in fade-in duration-150">
          <div className="bg-white p-2 rounded-lg shadow-lg border border-neutral-300">
            <svg
              viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
              className="w-28 h-28 sm:w-32 sm:h-32"
              shapeRendering="crispEdges"
            >
              {qrMatrix.map((row, r) =>
                row.map((cell, c) => (cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#000" /> : null))
              )}
            </svg>
          </div>
          <div className="text-center sm:text-left space-y-1 text-xs">
            <div className="font-bold text-white flex items-center gap-1.5 justify-center sm:justify-start">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>Escanear pelo Celular</span>
            </div>
            <p className="text-neutral-300 text-[11px] max-w-xs leading-relaxed">
              Abra a câmera do celular ou leitor de QR Code para acessar diretamente <strong className="text-emerald-400 font-mono">{activeUrl}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Expanded Instructions Accordion */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-neutral-800/80 space-y-3 text-xs animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-0.5">
              <div className="font-bold text-white flex items-center space-x-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">
                  1
                </span>
                <span>Mesmo Wi-Fi</span>
              </div>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                Conecte o celular na mesma rede Wi-Fi do computador onde o CineLocal está rodando.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-0.5">
              <div className="font-bold text-white flex items-center space-x-1.5">
                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono">
                  2
                </span>
                <span>Navegador do Celular</span>
              </div>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                Abra o Chrome, Safari ou Firefox e acesse <strong className="text-emerald-400 font-mono">{activeUrl}</strong>.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-0.5">
              <div className="font-bold text-white flex items-center space-x-1.5">
                <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-mono">
                  3
                </span>
                <span>Aviso de Certificado (HTTPS)</span>
              </div>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                Se aparecer <em>"Conexão não é privada"</em>, clique em <strong className="text-amber-300">Avançado</strong> e selecione <strong className="text-amber-300">Ir para o site assim mesmo</strong>.
              </p>
            </div>
          </div>

          {/* Certificate & Firewall details toggle */}
          <div className="flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => setShowHelpDetails(!showHelpDetails)}
              className="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer font-medium transition-colors"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span>Dúvidas sobre o aviso de certificado ou firewall?</span>
              {showHelpDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {showHelpDetails && (
            <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40 text-amber-200/90 text-xs space-y-1.5 animate-in fade-in duration-150">
              <div className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Sobre o Certificado HTTPS Local e Firewall:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-neutral-300">
                <li>
                  O CineLocal usa um certificado HTTPS local para segurança da rede doméstica sem depender de servidores na nuvem.
                </li>
                <li>
                  No Chrome/Safari do celular: clique em <strong>Avançado</strong> &gt; <strong>Continuar para {activeUrl}</strong>.
                </li>
                <li>
                  Opcional: instale o certificado CA em <code className="text-amber-300">certs/cinelocal.crt</code> nas configurações de segurança do celular.
                </li>
                <li>
                  Se não carregar, verifique se o Firewall do Windows permitiu o Node.js nas redes Privada e Pública.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
