import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Download, 
  Maximize2, 
  Minimize2, 
  Copy, 
  Check, 
  AlertCircle,
  FileCode2
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

// Initialize mermaid once with crisp, high-contrast settings matching SLSU theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
  themeVariables: {
    primaryColor: '#e2ebf8',
    primaryTextColor: '#1d58d9',
    primaryBorderColor: '#1d58d9',
    lineColor: '#64748b',
    secondaryColor: '#f0fdf4',
    tertiaryColor: '#fefce8',
    mainBkg: '#ffffff',
    nodeBorder: '#94a3b8',
    clusterBkg: '#f8fafc',
    clusterBorder: '#cbd5e1',
    titleColor: '#0f172a',
    edgeLabelBackground: '#ffffff',
  },
  flowchart: {
    curve: 'basis',
    padding: 18,
    nodeSpacing: 50,
    rankSpacing: 50,
    htmlLabels: true,
  },
});

interface MermaidViewerProps {
  chart: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  chart,
  title,
  subtitle,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showSource, setShowSource] = useState<boolean>(false);

  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    let timerId: any = null;

    const renderChart = async (attempt = 0) => {
      try {
        setError(null);
        // Generate a valid DOM ID
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, chart.trim());
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        const errorMsg = err?.message || 'Failed to render flowchart diagram.';
        // If it's a dynamic module fetch error or transient vite load issue, retry up to 3 times
        if (attempt < 3 && (errorMsg.includes('Failed to fetch') || errorMsg.includes('dynamically imported module') || errorMsg.includes('Loading chunk'))) {
          timerId = setTimeout(() => {
            if (isMounted) {
              renderChart(attempt + 1);
            }
          }, 400 * (attempt + 1));
          return;
        }

        if (isMounted) {
          setError(errorMsg);
        }
      }
    };

    renderChart(0);
    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [chart, retryCount]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.5));
  const handleResetZoom = () => setZoom(1);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(chart.trim());
      setCopied(true);
      toast.success('Mermaid diagram code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy diagram code');
    }
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title || 'slsu-flowchart').toLowerCase().replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Flowchart SVG downloaded successfully!');
  };

  return (
    <div
      className={`relative bg-white border border-neutral-200/90 rounded-2xl shadow-xs overflow-hidden transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none w-screen h-screen flex flex-col p-4 md:p-6 bg-slate-50'
          : className
      }`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-neutral-100 bg-neutral-50/70">
        <div>
          {title && (
            <h4 className="font-bold text-sm md:text-base text-neutral-800 tracking-tight flex items-center gap-2">
              <span>{title}</span>
            </h4>
          )}
          {subtitle && (
            <p className="text-[11px] md:text-xs text-neutral-500 mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-white border border-neutral-200 rounded-xl p-0.5 shadow-2xs">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              title="Zoom Out"
              className="h-7 w-7 p-0 text-neutral-600 hover:text-neutral-900 rounded-lg"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[10px] font-mono font-bold text-neutral-500 px-1.5 min-w-[3rem] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 2.5}
              title="Zoom In"
              className="h-7 w-7 p-0 text-neutral-600 hover:text-neutral-900 rounded-lg"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              title="Reset Zoom"
              className="h-7 w-7 p-0 text-neutral-600 hover:text-neutral-900 rounded-lg ml-0.5 border-l border-neutral-100"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSource(!showSource)}
            className="h-8 px-2.5 text-[11px] font-medium border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-xl gap-1.5"
            title={showSource ? 'Hide Code' : 'View Code'}
          >
            <FileCode2 className="w-3.5 h-3.5 text-neutral-500" />
            <span className="hidden sm:inline">{showSource ? 'Diagram' : 'Code'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            className="h-8 px-2.5 text-[11px] font-medium border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-xl gap-1.5"
            title="Copy Diagram Definition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Copy</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSvg}
            className="h-8 px-2.5 text-[11px] font-medium border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-xl gap-1.5"
            title="Export as Vector SVG"
          >
            <Download className="w-3.5 h-3.5 text-[#1d58d9]" />
            <span className="hidden sm:inline">Export SVG</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 w-8 p-0 border-neutral-200 text-neutral-700 hover:bg-neutral-100 rounded-xl"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Canvas / Diagram Viewport */}
      <div
        ref={containerRef}
        className={`relative overflow-auto p-6 md:p-8 flex items-center justify-center min-h-[380px] bg-gradient-to-b from-white to-[#fbfcfe] select-none ${
          isFullscreen ? 'flex-1 h-full' : ''
        }`}
      >
        {error ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md bg-amber-50/70 border border-amber-200 rounded-2xl text-amber-900">
            <AlertCircle className="w-8 h-8 text-amber-600 mb-2" />
            <h5 className="font-bold text-sm">Diagram Loading State</h5>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">{error}</p>
            <div className="flex items-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRetryCount((c) => c + 1)}
                className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-semibold rounded-xl"
              >
                Retry Diagram
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSource(true)}
                className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-semibold rounded-xl"
              >
                View Workflow Text
              </Button>
            </div>
            <pre className="mt-3 p-2 bg-white rounded-lg text-[10px] text-neutral-700 font-mono text-left w-full overflow-x-auto border border-amber-100 max-h-32">
              {chart}
            </pre>
          </div>
        ) : showSource ? (
          <div className="w-full max-w-3xl h-full p-4 bg-neutral-900 text-neutral-100 rounded-xl font-mono text-xs overflow-auto border border-neutral-800 leading-relaxed">
            <pre>{chart.trim()}</pre>
          </div>
        ) : svgContent ? (
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
            }}
            className="mermaid-svg-wrapper flex items-center justify-center max-w-full"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-[#1d58d9] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-neutral-400 font-medium">Generating flowchart vector graphics...</span>
          </div>
        )}
      </div>

      {/* Footer Helper Note */}
      <div className="px-5 py-2.5 bg-neutral-50 border-t border-neutral-100 text-[11px] text-neutral-500 flex items-center justify-between flex-wrap gap-2">
        <span>Click and scroll horizontally or vertically to explore the flow nodes.</span>
        <span className="font-mono text-[10px] text-neutral-400">Powered by Mermaid SVG Engine</span>
      </div>
    </div>
  );
};
